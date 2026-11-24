import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prisma } from './src/server/db.ts';
import {
  createSignedOAuthState,
  encryptToken,
  parseMetaSignedRequest,
  signSessionToken,
  verifySignedOAuthState,
} from './src/server/crypto.ts';
import {
  buildMetaOAuthUrl,
  exchangeCodeForShortToken,
  exchangeForLongLivedToken,
  fetchFacebookUser,
  fetchManagedPages,
  getAppBaseUrl,
  getMetaConfig,
  getResolvedRedirectUri,
  META_OAUTH_SCOPES,
} from './src/server/facebook.ts';
import {
  getSessionUserFromRequest,
  requireAuth,
  SESSION_COOKIE_NAME,
} from './src/server/authMiddleware.ts';
import type { AuthenticatedRequest } from './src/server/authMiddleware.ts';
import { publishTestPostForPage, runScheduledPublishing } from './src/server/scheduler.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OAUTH_STATE_COOKIE = 'fb_oauth_state';
const PORT = Number(process.env.PORT) || 3000;

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const ALLOWED_IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function serializePageForClient(page: {
  id: string;
  userId: string;
  pageId: string;
  pageName: string;
  pageCategory: string | null;
  isActive: boolean;
  postFrequencyHours: number;
  lastPostedAt: Date | null;
  createdAt: Date;
  products?: Array<{
    id: string;
    connectedPageId: string;
    title: string;
    details: string;
    imageUrl: string | null;
    lastUsedAt: Date | null;
    createdAt: Date;
  }>;
  postQueue?: Array<{
    id: string;
    connectedPageId: string;
    productItemId: string | null;
    content: string;
    imageUrl: string | null;
    status: string;
    facebookPostId: string | null;
    errorMessage: string | null;
    scheduledFor: Date;
    publishedAt: Date | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: page.id,
    userId: page.userId,
    pageId: page.pageId,
    pageName: page.pageName,
    pageCategory: page.pageCategory,
    isActive: page.isActive,
    postFrequencyHours: page.postFrequencyHours,
    lastPostedAt: page.lastPostedAt,
    createdAt: page.createdAt,
    products: (page.products ?? []).map((p) => ({
      id: p.id,
      connectedPageId: p.connectedPageId,
      title: p.title,
      details: p.details,
      imageUrl: p.imageUrl,
      lastUsedAt: p.lastUsedAt,
      createdAt: p.createdAt,
    })),
    postQueue: (page.postQueue ?? []).map((q) => ({
      id: q.id,
      connectedPageId: q.connectedPageId,
      productItemId: q.productItemId,
      content: q.content,
      imageUrl: q.imageUrl,
      status: q.status,
      facebookPostId: q.facebookPostId,
      errorMessage: q.errorMessage,
      scheduledFor: q.scheduledFor,
      publishedAt: q.publishedAt,
      createdAt: q.createdAt,
    })),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPopupResultHtml(params: {
  ok: boolean;
  sessionToken?: string;
  pagesConnected?: number;
  errorMessage?: string;
}): string {
  const payload = JSON.stringify(
    params.ok
      ? {
          type: 'META_OAUTH_SUCCESS',
          sessionToken: params.sessionToken,
          pagesConnected: params.pagesConnected ?? 0,
        }
      : {
          type: 'META_OAUTH_ERROR',
          error: params.errorMessage || 'Facebook authentication failed.',
        }
  );

  const safeStatusTitle = params.ok
    ? 'Facebook Pages Connected'
    : 'Facebook Connection Failed';
  const safeDetail = params.ok
    ? `Successfully connected ${params.pagesConnected ?? 0} Facebook Page(s). Returning to PagePulse...`
    : escapeHtml(params.errorMessage || 'Authentication could not be completed.');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeStatusTitle}</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #F8FAFC; color: #0F172A; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
      .card { max-width: 420px; width: 100%; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 28px; text-align: center; }
      h1 { font-size: 18px; margin: 0 0 8px; font-weight: 600; }
      p { font-size: 14px; color: #475569; margin: 0 0 18px; line-height: 1.5; }
      a { display: inline-block; padding: 10px 18px; background: #1E40AF; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${safeStatusTitle}</h1>
      <p>${safeDetail}</p>
      <a href="/dashboard">Continue to Dashboard</a>
    </div>
    <script>
      (function () {
        var data = ${payload};
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(data, '*');
          setTimeout(function () { window.close(); }, 300);
        } else if (data.type === 'META_OAUTH_SUCCESS') {
          window.location.replace('/dashboard');
        }
      })();
    </script>
  </body>
</html>`;
}

async function createServer() {
  const app = express();
  app.set('trust proxy', 1);

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  app.use(express.json({ limit: '12mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Built-in background auto-posting loop guard (defined early so mutations can wake it)
  let schedulerRunning = false;
  const runSchedulerTick = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      const summary = await runScheduledPublishing();
      if (summary.duePages > 0) {
        console.log(
          `[PagePulse Scheduler] Checked ${summary.checkedPages} active page(s), processed ${summary.duePages} due page(s).`
        );
      }
    } catch (err) {
      console.error('Background auto-posting tick error:', err);
    } finally {
      schedulerRunning = false;
    }
  };

  // Serve product images stored directly in the database
  app.get('/api/products/:productId/image', async (req, res) => {
    try {
      const product = await prisma.productItem.findUnique({
        where: { id: String(req.params.productId) },
        select: { imageData: true, imageMimeType: true },
      });
      if (!product?.imageData) {
        res.status(404).send('Product image not found');
        return;
      }
      const raw = product.imageData.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      const buf = Buffer.from(raw, 'base64');
      res.setHeader('Content-Type', product.imageMimeType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(buf);
    } catch {
      res.status(500).send('Failed to load product image');
    }
  });

  // Upload product image for authenticated users
  app.post('/api/uploads', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType.toLowerCase().trim() : '';
      const dataBase64 = typeof req.body?.dataBase64 === 'string' ? req.body.dataBase64.trim() : '';

      const ext = ALLOWED_IMAGE_MIME_TO_EXT[mimeType];
      if (!ext) {
        res.status(400).json({ error: 'Unsupported image format. Please upload JPG, PNG, WEBP, or GIF.' });
        return;
      }

      const rawBase64 = dataBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      if (!rawBase64) {
        res.status(400).json({ error: 'Image data is empty.' });
        return;
      }

      const buffer = Buffer.from(rawBase64, 'base64');
      if (buffer.byteLength === 0 || buffer.byteLength > 8 * 1024 * 1024) {
        res.status(400).json({ error: 'Image size must be between 1 byte and 8 MB.' });
        return;
      }

      const filename = `${crypto.randomUUID()}.${ext}`;
      await fs.promises.writeFile(path.join(UPLOADS_DIR, filename), buffer);

      res.status(201).json({ imageUrl: `/api/uploads/${filename}` });
    } catch (err) {
      console.error('Image upload error:', err);
      res.status(500).json({ error: 'Failed to store uploaded image.' });
    }
  });

  app.get('/api/uploads/:filename', (req, res) => {
    const safeName = path.basename(String(req.params.filename));
    if (!safeName || safeName.includes('..')) {
      res.status(400).send('Invalid filename');
      return;
    }
    const fullPath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      res.status(404).send('Image not found');
      return;
    }
    res.sendFile(fullPath);
  });

  // Public config status endpoint (no secrets exposed)
  app.get('/api/config/oauth-status', (_req, res) => {
    const config = getMetaConfig();
    res.json({
      configured: Boolean(config),
      redirectUri: getResolvedRedirectUri(),
      appBaseUrl: getAppBaseUrl(),
      scopes: META_OAUTH_SCOPES,
    });
  });

  // Current authenticated user session
  app.get('/api/auth/session', async (req, res) => {
    try {
      const user = await getSessionUserFromRequest(req);
      if (!user) {
        res.json({ user: null });
        return;
      }
      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          facebookUserId: user.facebookUserId,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      console.error('Session lookup error:', err);
      res.status(500).json({ error: 'Failed to inspect session.' });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    res.json({ ok: true });
  });

  // Step 1: Initiate Meta OAuth flow (supports both JSON for iframe popup and 302 redirect)
  app.get('/api/auth/facebook/login', (req, res) => {
    const config = getMetaConfig();
    const wantsJson = req.query.format === 'json';

    if (!config) {
      const message =
        'Meta App credentials (META_APP_ID and META_APP_SECRET) are not configured on the server.';
      if (wantsJson) {
        res.status(503).json({
          error: 'META_OAUTH_NOT_CONFIGURED',
          message,
          redirectUri: getResolvedRedirectUri(),
          scopes: META_OAUTH_SCOPES,
        });
        return;
      }
      res.redirect(`/?oauth_error=${encodeURIComponent(message)}`);
      return;
    }

    const state = createSignedOAuthState();
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 10 * 60 * 1000,
    });

    const authUrl = buildMetaOAuthUrl(config, state);
    if (wantsJson) {
      res.json({ url: authUrl, redirectUri: config.redirectUri });
      return;
    }

    res.redirect(authUrl);
  });

  // Step 2: Meta OAuth Callback -> Short Token -> 60-day Long-Lived Token -> /me/accounts Permanent Page Tokens
  const handleFacebookCallback = async (req: express.Request, res: express.Response) => {
    const oauthError = req.query.error_description || req.query.error;
    if (typeof oauthError === 'string' && oauthError.length > 0) {
      res
        .status(400)
        .send(renderPopupResultHtml({ ok: false, errorMessage: oauthError }));
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;

    res.clearCookie(OAUTH_STATE_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });

    const stateCheck = verifySignedOAuthState(state, cookieState);
    if (!stateCheck.valid || !code) {
      res.status(400).send(
        renderPopupResultHtml({
          ok: false,
          errorMessage: 'Invalid or expired OAuth CSRF state parameter.',
        })
      );
      return;
    }

    const config = getMetaConfig();
    if (!config) {
      res.status(503).send(
        renderPopupResultHtml({
          ok: false,
          errorMessage: 'META_APP_ID and META_APP_SECRET are not configured.',
        })
      );
      return;
    }

    try {
      // 1. Exchange temporary code for Short-Lived User Access Token
      const shortToken = await exchangeCodeForShortToken(code, config);

      // 2. Exchange Short-Lived User Token for 60-day Long-Lived User Access Token
      const longLivedUserToken = await exchangeForLongLivedToken(
        shortToken.access_token,
        config
      );

      // 3. Fetch Meta user profile and all approved Pages with permanent Page Access Tokens
      const [fbProfile, managedPages] = await Promise.all([
        fetchFacebookUser(longLivedUserToken.access_token),
        fetchManagedPages(longLivedUserToken.access_token),
      ]);

      // 4. Upsert User and encrypt each Page Access Token with AES-256-GCM
      const user = await prisma.user.upsert({
        where: { facebookUserId: fbProfile.id },
        update: {
          name: fbProfile.name,
          email: fbProfile.email ?? null,
        },
        create: {
          facebookUserId: fbProfile.id,
          name: fbProfile.name,
          email: fbProfile.email ?? null,
        },
      });

      for (const fbPage of managedPages) {
        if (!fbPage.access_token) continue;
        const encryptedAccessToken = encryptToken(fbPage.access_token);

        await prisma.connectedPage.upsert({
          where: { pageId: fbPage.id },
          update: {
            userId: user.id,
            pageName: fbPage.name,
            pageCategory: fbPage.category ?? null,
            encryptedAccessToken,
          },
          create: {
            userId: user.id,
            pageId: fbPage.id,
            pageName: fbPage.name,
            pageCategory: fbPage.category ?? null,
            encryptedAccessToken,
            isActive: true,
            postFrequencyHours: 24,
          },
        });
      }

      // 5. Issue HTTP-only signed session cookie + popup message
      const sessionToken = signSessionToken(user.id, user.facebookUserId);
      res.cookie(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 1000 * 60 * 60 * 24 * 30,
      });

      res.send(
        renderPopupResultHtml({
          ok: true,
          sessionToken,
          pagesConnected: managedPages.length,
        })
      );
    } catch (err) {
      console.error('Meta OAuth callback error:', err);
      const message =
        err instanceof Error ? err.message : 'Unexpected error exchanging Meta tokens.';
      res.status(500).send(renderPopupResultHtml({ ok: false, errorMessage: message }));
    }
  };

  app.get(['/api/auth/facebook/callback', '/api/auth/facebook/callback/'], handleFacebookCallback);

  // Meta Data Deletion / Deauthorization Webhook Callback
  app.post('/api/auth/facebook/deauthorize', async (req, res) => {
    try {
      const signedRequest =
        typeof req.body?.signed_request === 'string' ? req.body.signed_request : '';
      const config = getMetaConfig();

      if (!signedRequest || !config) {
        res.status(400).json({ error: 'Invalid deauthorization callback request.' });
        return;
      }

      const parsed = parseMetaSignedRequest(signedRequest, config.appSecret);
      if (!parsed || !parsed.user_id) {
        res.status(400).json({ error: 'Invalid signed_request signature.' });
        return;
      }

      await prisma.user.deleteMany({
        where: { facebookUserId: parsed.user_id },
      });

      const confirmationCode = crypto.randomBytes(8).toString('hex').toUpperCase();
      const statusUrl = `${getAppBaseUrl()}/data-deletion?code=${confirmationCode}`;

      res.json({
        url: statusUrl,
        confirmation_code: confirmationCode,
      });
    } catch (err) {
      console.error('Meta deauthorize webhook error:', err);
      res.status(500).json({ error: 'Failed to process data deletion request.' });
    }
  });

  // List authenticated user's connected Pages, products, and recent PostQueue logs
  app.get('/api/pages', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const pages = await prisma.connectedPage.findMany({
        where: { userId: req.sessionUser!.id },
        orderBy: { createdAt: 'desc' },
        include: {
          products: {
            orderBy: [{ createdAt: 'desc' }],
            select: {
              id: true,
              connectedPageId: true,
              title: true,
              details: true,
              imageUrl: true,
              lastUsedAt: true,
              createdAt: true,
            },
          },
          postQueue: {
            orderBy: [{ createdAt: 'desc' }],
            take: 25,
            select: {
              id: true,
              connectedPageId: true,
              productItemId: true,
              content: true,
              imageUrl: true,
              status: true,
              facebookPostId: true,
              errorMessage: true,
              scheduledFor: true,
              publishedAt: true,
              createdAt: true,
            },
          },
        },
      });
      res.json({ pages: pages.map(serializePageForClient) });
    } catch (err) {
      console.error('List pages error:', err);
      res.status(500).json({ error: 'Failed to load connected Facebook Pages.' });
    }
  });

  // Update automation status (isActive) or frequency (postFrequencyHours)
  app.patch('/api/pages/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const pageId = String(req.params.id);
      const existing = await prisma.connectedPage.findFirst({
        where: { id: pageId, userId: req.sessionUser!.id },
      });

      if (!existing) {
        res.status(404).json({ error: 'Connected Page not found.' });
        return;
      }

      const updateData: { isActive?: boolean; postFrequencyHours?: number } = {};

      if (typeof req.body?.isActive === 'boolean') {
        updateData.isActive = req.body.isActive;
      }
      if (req.body?.postFrequencyHours !== undefined) {
        const hours = Number(req.body.postFrequencyHours);
        if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
          res.status(400).json({ error: 'postFrequencyHours must be an integer between 1 and 720.' });
          return;
        }
        updateData.postFrequencyHours = hours;
      }

      const updated = await prisma.connectedPage.update({
        where: { id: existing.id },
        data: updateData,
        include: {
          products: {
            orderBy: [{ createdAt: 'desc' }],
            select: {
              id: true,
              connectedPageId: true,
              title: true,
              details: true,
              imageUrl: true,
              lastUsedAt: true,
              createdAt: true,
            },
          },
          postQueue: {
            orderBy: [{ createdAt: 'desc' }],
            take: 25,
            select: {
              id: true,
              connectedPageId: true,
              productItemId: true,
              content: true,
              imageUrl: true,
              status: true,
              facebookPostId: true,
              errorMessage: true,
              scheduledFor: true,
              publishedAt: true,
              createdAt: true,
            },
          },
        },
      });

      if (updated.isActive) {
        setImmediate(() => {
          void runSchedulerTick();
        });
      }

      res.json({ page: serializePageForClient(updated) });
    } catch (err) {
      console.error('Update page error:', err);
      res.status(500).json({ error: 'Failed to update Page automation settings.' });
    }
  });

  // Disconnect Page and delete encrypted token from database
  app.delete('/api/pages/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const pageId = String(req.params.id);
      const existing = await prisma.connectedPage.findFirst({
        where: { id: pageId, userId: req.sessionUser!.id },
      });

      if (!existing) {
        res.status(404).json({ error: 'Connected Page not found.' });
        return;
      }

      await prisma.connectedPage.delete({
        where: { id: existing.id },
      });

      res.json({ ok: true, id: existing.id });
    } catch (err) {
      console.error('Delete page error:', err);
      res.status(500).json({ error: 'Failed to disconnect Page.' });
    }
  });

  // Add a product (image + product details) for AI caption generation
  app.post('/api/pages/:id/products', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const pageId = String(req.params.id);
      const existing = await prisma.connectedPage.findFirst({
        where: { id: pageId, userId: req.sessionUser!.id },
      });

      if (!existing) {
        res.status(404).json({ error: 'Connected Page not found.' });
        return;
      }

      const titleRaw = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const details = typeof req.body?.details === 'string' ? req.body.details.trim() : '';
      const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
      const imageDataRaw = typeof req.body?.imageData === 'string' ? req.body.imageData.trim() : '';
      const imageMimeTypeRaw =
        typeof req.body?.imageMimeType === 'string'
          ? req.body.imageMimeType.toLowerCase().trim()
          : '';

      if (!details) {
        res.status(400).json({ error: 'Product details are required.' });
        return;
      }

      let storedImageData: string | null = null;
      let storedMimeType: string | null = null;

      if (imageDataRaw) {
        if (!ALLOWED_IMAGE_MIME_TO_EXT[imageMimeTypeRaw]) {
          res.status(400).json({ error: 'Unsupported image format. Please upload JPG, PNG, WEBP, or GIF.' });
          return;
        }
        const cleanBase64 = imageDataRaw.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
        const bytes = Buffer.from(cleanBase64, 'base64');
        if (bytes.byteLength === 0 || bytes.byteLength > 8 * 1024 * 1024) {
          res.status(400).json({ error: 'Image size must be between 1 byte and 8 MB.' });
          return;
        }
        storedImageData = cleanBase64;
        storedMimeType = imageMimeTypeRaw;
      } else if (
        imageUrl &&
        !/^https?:\/\/.+/i.test(imageUrl) &&
        !imageUrl.startsWith('/api/uploads/') &&
        !imageUrl.startsWith('/api/products/')
      ) {
        res.status(400).json({ error: 'Image URL must be a valid http(s) URL or uploaded image.' });
        return;
      }

      const title =
        titleRaw || (details.length > 56 ? `${details.slice(0, 56).trim()}...` : details);

      let product = await prisma.productItem.create({
        data: {
          connectedPageId: existing.id,
          title,
          details,
          imageUrl: storedImageData ? null : imageUrl || null,
          imageData: storedImageData,
          imageMimeType: storedMimeType,
        },
      });

      if (storedImageData) {
        product = await prisma.productItem.update({
          where: { id: product.id },
          data: { imageUrl: `/api/products/${product.id}/image` },
        });
      }

      if (existing.isActive && !existing.lastPostedAt) {
        setImmediate(() => {
          void runSchedulerTick();
        });
      }

      res.status(201).json({
        product: {
          id: product.id,
          connectedPageId: product.connectedPageId,
          title: product.title,
          details: product.details,
          imageUrl: product.imageUrl,
          lastUsedAt: product.lastUsedAt,
          createdAt: product.createdAt,
        },
      });
    } catch (err) {
      console.error('Create product error:', err);
      res.status(500).json({ error: 'Failed to save product item.' });
    }
  });

  // Remove a product item from a connected Page
  app.delete(
    '/api/pages/:id/products/:productId',
    requireAuth,
    async (req: AuthenticatedRequest, res) => {
      try {
        const pageId = String(req.params.id);
        const productId = String(req.params.productId);

        const page = await prisma.connectedPage.findFirst({
          where: { id: pageId, userId: req.sessionUser!.id },
        });
        if (!page) {
          res.status(404).json({ error: 'Connected Page not found.' });
          return;
        }

        const product = await prisma.productItem.findFirst({
          where: { id: productId, connectedPageId: page.id },
        });
        if (!product) {
          res.status(404).json({ error: 'Product item not found.' });
          return;
        }

        await prisma.productItem.delete({ where: { id: product.id } });
        res.json({ ok: true, id: product.id });
      } catch (err) {
        console.error('Delete product error:', err);
        res.status(500).json({ error: 'Failed to delete product item.' });
      }
    }
  );

  // Enqueue a custom post into PostQueue for a connected Page
  app.post('/api/pages/:id/queue', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const pageId = String(req.params.id);
      const existing = await prisma.connectedPage.findFirst({
        where: { id: pageId, userId: req.sessionUser!.id },
      });

      if (!existing) {
        res.status(404).json({ error: 'Connected Page not found.' });
        return;
      }

      const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
      const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
      const scheduledForRaw =
        typeof req.body?.scheduledFor === 'string' ? req.body.scheduledFor : undefined;

      if (!content) {
        res.status(400).json({ error: 'Post content text is required.' });
        return;
      }

      if (
        imageUrl &&
        !/^https?:\/\/.+/i.test(imageUrl) &&
        !imageUrl.startsWith('/api/uploads/')
      ) {
        res.status(400).json({ error: 'Image URL must be a valid http(s) URL.' });
        return;
      }

      let scheduledFor = new Date();
      if (scheduledForRaw) {
        const parsedDate = new Date(scheduledForRaw);
        if (Number.isNaN(parsedDate.getTime())) {
          res.status(400).json({ error: 'Invalid scheduledFor date.' });
          return;
        }
        scheduledFor = parsedDate;
      }

      const queueItem = await prisma.postQueue.create({
        data: {
          connectedPageId: existing.id,
          content,
          imageUrl: imageUrl || null,
          status: 'PENDING',
          scheduledFor,
        },
      });

      res.status(201).json({ post: queueItem });
    } catch (err) {
      console.error('Queue post error:', err);
      res.status(500).json({ error: 'Failed to queue post.' });
    }
  });

  // Remove a pending post from the queue
  app.delete('/api/pages/:id/queue/:postId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const pageId = String(req.params.id);
      const postId = String(req.params.postId);

      const page = await prisma.connectedPage.findFirst({
        where: { id: pageId, userId: req.sessionUser!.id },
      });
      if (!page) {
        res.status(404).json({ error: 'Connected Page not found.' });
        return;
      }

      const post = await prisma.postQueue.findFirst({
        where: { id: postId, connectedPageId: page.id },
      });
      if (!post) {
        res.status(404).json({ error: 'Queued post not found.' });
        return;
      }

      await prisma.postQueue.delete({ where: { id: post.id } });
      res.json({ ok: true, id: post.id });
    } catch (err) {
      console.error('Delete queue item error:', err);
      res.status(500).json({ error: 'Failed to delete queued post.' });
    }
  });

  // Trigger an instant live AI-generated (or custom) post for a connected Page
  app.post('/api/pages/:id/test-post', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const pageId = String(req.params.id);
      const page = await prisma.connectedPage.findFirst({
        where: { id: pageId, userId: req.sessionUser!.id },
      });

      if (!page) {
        res.status(404).json({ error: 'Connected Page not found.' });
        return;
      }

      const customContent =
        typeof req.body?.content === 'string' ? req.body.content : undefined;
      const customImageUrl =
        typeof req.body?.imageUrl === 'string' ? req.body.imageUrl : undefined;
      const preferredProductId =
        typeof req.body?.productItemId === 'string' ? req.body.productItemId : undefined;

      const result = await publishTestPostForPage(
        page,
        customContent,
        customImageUrl,
        preferredProductId
      );

      if (result.status === 'FAILED') {
        res.status(502).json({
          error: result.errorMessage || 'Meta Graph API rejected the test post.',
          result,
        });
        return;
      }

      res.json({ ok: true, result });
    } catch (err) {
      console.error('Test post error:', err);
      const message = err instanceof Error ? err.message : 'Failed to execute test post.';
      res.status(500).json({ error: message });
    }
  });

  // Automated Cron Publishing Endpoint (supports POST and GET for external cron services)
  const handleCronPublish = async (req: express.Request, res: express.Response) => {
    const cronSecret = process.env.CRON_SECRET?.trim();
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const queryToken = typeof req.query?.secret === 'string' ? req.query.secret.trim() : '';
    const token = bearerToken || queryToken;

    if (!cronSecret || token !== cronSecret) {
      res.status(401).json({ error: 'Unauthorized: invalid or missing CRON_SECRET bearer token.' });
      return;
    }

    try {
      const summary = await runScheduledPublishing();
      res.json({ ok: true, ...summary });
    } catch (err) {
      console.error('Cron publish error:', err);
      res.status(500).json({ error: 'Automated cron publish run failed.' });
    }
  };

  app.post('/api/cron/publish', handleCronPublish);
  app.get('/api/cron/publish', handleCronPublish);

  // Mount Vite middleware in development, or serve built dist/ in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  // Run first check 5s after startup, then every 30s so due intervals post promptly
  setTimeout(() => {
    void runSchedulerTick();
  }, 5_000);
  setInterval(() => {
    void runSchedulerTick();
  }, 30_000);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PagePulse server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
