import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in environment secrets. Please set GEMINI_API_KEY to enable AI caption generation.'
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function guessMimeType(filePathOrUrl: string, contentTypeHeader?: string | null): string {
  if (contentTypeHeader && contentTypeHeader.startsWith('image/')) {
    return contentTypeHeader.split(';')[0].trim();
  }
  const lower = filePathOrUrl.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

async function resolveImageInlinePart(params: {
  imageUrl?: string | null;
  imageData?: string | null;
  imageMimeType?: string | null;
}): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  // 1. Direct DB-stored base64 image data (survives container restarts)
  if (params.imageData && params.imageData.trim().length > 0) {
    const cleanBase64 = params.imageData
      .trim()
      .replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    if (cleanBase64) {
      return {
        inlineData: {
          mimeType: params.imageMimeType?.trim() || 'image/jpeg',
          data: cleanBase64,
        },
      };
    }
  }

  const trimmed = params.imageUrl?.trim();
  if (!trimmed) {
    return null;
  }

  // 2. Local uploaded image stored in /uploads
  if (trimmed.startsWith('/api/uploads/')) {
    const filename = path.basename(trimmed);
    if (!filename || filename.includes('..')) {
      return null;
    }
    try {
      const fileBuffer = await fs.readFile(path.join(UPLOADS_DIR, filename));
      return {
        inlineData: {
          mimeType: guessMimeType(filename),
          data: fileBuffer.toString('base64'),
        },
      };
    } catch {
      return null;
    }
  }

  // 3. Remote image URL
  if (/^https?:\/\/.+/i.test(trimmed)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(trimmed, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        return null;
      }

      const contentType = res.headers.get('content-type');
      if (contentType && !contentType.startsWith('image/')) {
        return null;
      }

      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > 10 * 1024 * 1024) {
        return null;
      }

      return {
        inlineData: {
          mimeType: guessMimeType(trimmed, contentType),
          data: Buffer.from(arrayBuffer).toString('base64'),
        },
      };
    } catch {
      return null;
    }
  }

  return null;
}

export async function generateOrganicFacebookCaption(params: {
  pageName: string;
  pageCategory?: string | null;
  productTitle?: string | null;
  productDetails?: string | null;
  imageUrl?: string | null;
  imageData?: string | null;
  imageMimeType?: string | null;
}): Promise<string> {
  const ai = getGeminiClient();

  const {
    pageName,
    pageCategory,
    productTitle,
    productDetails,
    imageUrl,
    imageData,
    imageMimeType,
  } = params;

  const imagePart = await resolveImageInlinePart({
    imageUrl,
    imageData,
    imageMimeType,
  });

  const productContext = productDetails?.trim()
    ? [
        productTitle?.trim() ? `Product Name: ${productTitle.trim()}` : null,
        `Product Details: ${productDetails.trim()}`,
      ]
        .filter(Boolean)
        .join('\n')
    : `No specific product item was attached; write a helpful, organic trust-building brand update for the Facebook Page "${pageName}".`;

  const promptText = [
    `Facebook Page Name: ${pageName}`,
    pageCategory ? `Page Category: ${pageCategory}` : null,
    productContext,
    imagePart
      ? 'A product photo is attached. Describe and reference visual details naturally from the photo alongside the product details.'
      : null,
    'Write one ready-to-publish Facebook Page caption (80–160 words) in a natural mix of Bengali (বাংলা) and English that builds organic trust with customers.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const systemInstruction =
    'You write authentic, human-sounding Facebook Page posts in a natural mix of Bengali (বাংলা script) and English (bilingual Bengali + English style) for businesses that want to build genuine organic trust around their products. ' +
    'Blend fluent, conversational Bengali sentences with clear English product terms, quality points, or specs naturally—just like trusted Bangladeshi and Bengali brand pages write. ' +
    'Lead with a relatable Bengali/English hook or customer benefit, highlight real details from the product info (and the attached photo if present), keep the tone warm and trustworthy (never pushy, spammy, or over-hyped), ' +
    'end with a friendly Bengali/English question or soft call-to-action, and include 2 to 4 relevant hashtags. ' +
    'Output ONLY the final Facebook caption text with no quotation marks, markdown headers, or explanations.';

  const contents = imagePart
    ? { parts: [imagePart, { text: promptText }] }
    : promptText;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents,
    config: {
      systemInstruction,
    },
  });

  const caption = response.text?.trim();
  if (!caption) {
    throw new Error('Gemini returned an empty caption.');
  }

  return caption;
}
