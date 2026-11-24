import type { ConnectedPage, PostQueue, ProductItem } from '@prisma/client';
import { prisma } from './db.ts';
import { decryptToken } from './crypto.ts';
import { publishToFacebookPage } from './facebook.ts';
import { generateOrganicFacebookCaption } from './ai.ts';

function pickNextProductInRotation(products: ProductItem[]): ProductItem | null {
  if (products.length === 0) return null;

  const sorted = [...products].sort((a, b) => {
    // Prefer products that have a saved photo first if both are equally unused
    const aUsed = a.lastUsedAt ? a.lastUsedAt.getTime() : 0;
    const bUsed = b.lastUsedAt ? b.lastUsedAt.getTime() : 0;
    if (aUsed !== bUsed) {
      return aUsed - bUsed;
    }

    const aHasPhoto = Boolean(a.imageData || a.imageUrl) ? 1 : 0;
    const bHasPhoto = Boolean(b.imageData || b.imageUrl) ? 1 : 0;
    if (aHasPhoto !== bHasPhoto) {
      return bHasPhoto - aHasPhoto;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return sorted[0] ?? null;
}

/**
 * Selects the next product for a ConnectedPage (rotating least-recently-used first,
 * compatible with both SQLite and PostgreSQL) and uses Gemini AI to generate a
 * Bengali + English mixed Facebook caption paired with the saved product photo.
 */
export async function generateAutomatedPost(
  page: ConnectedPage,
  preferredProductId?: string
): Promise<{
  content: string;
  imageUrl?: string | null;
  imageData?: string | null;
  imageMimeType?: string | null;
  productItemId?: string | null;
}> {
  let product: ProductItem | null = null;

  if (preferredProductId) {
    product = await prisma.productItem.findFirst({
      where: { id: preferredProductId, connectedPageId: page.id },
    });
  }

  if (!product) {
    const allProducts = await prisma.productItem.findMany({
      where: { connectedPageId: page.id },
    });
    product = pickNextProductInRotation(allProducts);
  }

  const caption = await generateOrganicFacebookCaption({
    pageName: page.pageName,
    pageCategory: page.pageCategory,
    productTitle: product?.title ?? null,
    productDetails: product?.details ?? null,
    imageUrl: product?.imageUrl ?? null,
    imageData: product?.imageData ?? null,
    imageMimeType: product?.imageMimeType ?? null,
  });

  return {
    content: caption,
    imageUrl: product?.imageUrl ?? null,
    imageData: product?.imageData ?? null,
    imageMimeType: product?.imageMimeType ?? null,
    productItemId: product?.id ?? null,
  };
}

export interface PublishAttemptResult {
  pageId: string;
  pageName: string;
  queueItemId: string;
  status: 'PUBLISHED' | 'FAILED';
  facebookPostId?: string;
  errorMessage?: string;
}

/**
 * Publishes an immediate test post for a specific ConnectedPage.
 * If no custom content is provided, Gemini AI generates the Bengali + English caption
 * from the Page's saved product photo and details.
 */
export async function publishTestPostForPage(
  page: ConnectedPage,
  customContent?: string,
  customImageUrl?: string | null,
  preferredProductId?: string
): Promise<PublishAttemptResult> {
  let message = customContent?.trim() || '';
  let imageUrl = customImageUrl?.trim() || null;
  let imageData: string | null = null;
  let imageMimeType: string | null = null;
  let productItemId: string | null = preferredProductId || null;

  if (!message) {
    const generated = await generateAutomatedPost(page, preferredProductId);
    message = generated.content;
    imageUrl = imageUrl ?? generated.imageUrl ?? null;
    imageData = generated.imageData ?? null;
    imageMimeType = generated.imageMimeType ?? null;
    productItemId = generated.productItemId ?? null;
  }

  const queueEntry = await prisma.postQueue.create({
    data: {
      connectedPageId: page.id,
      productItemId,
      content: message,
      imageUrl,
      imageData,
      imageMimeType,
      status: 'PENDING',
      scheduledFor: new Date(),
    },
  });

  return executePostPublish(page, queueEntry);
}

async function executePostPublish(
  page: ConnectedPage,
  queueItem: PostQueue
): Promise<PublishAttemptResult> {
  try {
    const pageAccessToken = decryptToken(page.encryptedAccessToken);

    // Fallback: if queueItem came from an earlier record linked to a product, hydrate photo from ProductItem
    let imageData = queueItem.imageData;
    let imageMimeType = queueItem.imageMimeType;
    let imageUrl = queueItem.imageUrl;

    if (!imageData && queueItem.productItemId) {
      const linkedProduct = await prisma.productItem.findUnique({
        where: { id: queueItem.productItemId },
      });
      if (linkedProduct) {
        imageData = linkedProduct.imageData;
        imageMimeType = linkedProduct.imageMimeType;
        imageUrl = imageUrl || linkedProduct.imageUrl;
      }
    }

    const { facebookPostId } = await publishToFacebookPage({
      pageId: page.pageId,
      pageAccessToken,
      message: queueItem.content,
      imageUrl,
      imageData,
      imageMimeType,
    });

    const now = new Date();
    const txOperations = [
      prisma.postQueue.update({
        where: { id: queueItem.id },
        data: {
          status: 'PUBLISHED',
          facebookPostId,
          errorMessage: null,
          publishedAt: now,
        },
      }),
      prisma.connectedPage.update({
        where: { id: page.id },
        data: { lastPostedAt: now },
      }),
    ];

    if (queueItem.productItemId) {
      await prisma.$transaction([
        ...txOperations,
        prisma.productItem.updateMany({
          where: { id: queueItem.productItemId },
          data: { lastUsedAt: now },
        }),
      ]);
    } else {
      await prisma.$transaction(txOperations);
    }

    return {
      pageId: page.pageId,
      pageName: page.pageName,
      queueItemId: queueItem.id,
      status: 'PUBLISHED',
      facebookPostId,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown Graph API publishing error';
    await prisma.postQueue.update({
      where: { id: queueItem.id },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    });

    return {
      pageId: page.pageId,
      pageName: page.pageName,
      queueItemId: queueItem.id,
      status: 'FAILED',
      errorMessage,
    };
  }
}

const FAILURE_RETRY_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Automated scheduler runner: finds all active ConnectedPages whose lastPostedAt is null
 * or older than their configured postFrequencyHours, verifies they have a saved product
 * or pending queue item, generates an AI Bengali+English post paired with the saved product
 * photo via Gemini, and publishes to Facebook.
 */
export async function runScheduledPublishing(): Promise<{
  checkedPages: number;
  duePages: number;
  results: PublishAttemptResult[];
}> {
  const now = new Date();
  const activePages = await prisma.connectedPage.findMany({
    where: { isActive: true },
  });

  const duePages = activePages.filter((page) => {
    if (!page.lastPostedAt) {
      return true;
    }
    const elapsedMs = now.getTime() - page.lastPostedAt.getTime();
    const intervalMs = page.postFrequencyHours * 60 * 60 * 1000;
    return elapsedMs >= intervalMs;
  });

  const results: PublishAttemptResult[] = [];

  for (const page of duePages) {
    // Prevent spamming FAILED rows every 30s if the latest attempt failed very recently
    const latestAttempt = await prisma.postQueue.findFirst({
      where: { connectedPageId: page.id },
      orderBy: { createdAt: 'desc' },
    });
    if (
      latestAttempt &&
      latestAttempt.status === 'FAILED' &&
      now.getTime() - latestAttempt.createdAt.getTime() < FAILURE_RETRY_COOLDOWN_MS
    ) {
      continue;
    }

    let nextQueueItem = await prisma.postQueue.findFirst({
      where: {
        connectedPageId: page.id,
        status: 'PENDING',
        scheduledFor: { lte: now },
      },
      orderBy: { scheduledFor: 'asc' },
    });

    if (!nextQueueItem) {
      // Do not burn lastPostedAt before the user saves at least one product for this Page
      const productCount = await prisma.productItem.count({
        where: { connectedPageId: page.id },
      });
      if (productCount === 0) {
        continue;
      }

      try {
        const generated = await generateAutomatedPost(page);
        nextQueueItem = await prisma.postQueue.create({
          data: {
            connectedPageId: page.id,
            productItemId: generated.productItemId ?? null,
            content: generated.content,
            imageUrl: generated.imageUrl ?? null,
            imageData: generated.imageData ?? null,
            imageMimeType: generated.imageMimeType ?? null,
            status: 'PENDING',
            scheduledFor: now,
          },
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'AI caption generation failed.';
        const failedRecord = await prisma.postQueue.create({
          data: {
            connectedPageId: page.id,
            content: '[AI caption generation failed before publish]',
            status: 'FAILED',
            errorMessage,
            scheduledFor: now,
          },
        });
        results.push({
          pageId: page.pageId,
          pageName: page.pageName,
          queueItemId: failedRecord.id,
          status: 'FAILED',
          errorMessage,
        });
        continue;
      }
    }

    const result = await executePostPublish(page, nextQueueItem);
    results.push(result);
  }

  return {
    checkedPages: activePages.length,
    duePages: duePages.length,
    results,
  };
}
