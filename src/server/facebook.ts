import fs from 'node:fs/promises';
import path from 'node:path';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const DIALOG_BASE_URL = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

export const META_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'business_management',
];

export interface MetaConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export function getAppBaseUrl(): string {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl && appUrl !== 'MY_APP_URL') {
    return appUrl.replace(/\/+$/, '');
  }
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicUrl) {
    return publicUrl.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
}

export function getResolvedRedirectUri(): string {
  const explicit = process.env.META_REDIRECT_URI?.trim();
  if (explicit && !explicit.includes('localhost')) {
    return explicit;
  }
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl && appUrl !== 'MY_APP_URL') {
    return `${appUrl.replace(/\/+$/, '')}/api/auth/facebook/callback`;
  }
  return explicit || 'http://localhost:3000/api/auth/facebook/callback';
}

export function getMetaConfig(): MetaConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return null;
  }
  return {
    appId,
    appSecret,
    redirectUri: getResolvedRedirectUri(),
  };
}

export function buildMetaOAuthUrl(config: MetaConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state,
    response_type: 'code',
    scope: META_OAUTH_SCOPES.join(','),
  });
  return `${DIALOG_BASE_URL}?${params.toString()}`;
}

export interface GraphApiErrorPayload {
  error?: {
    message: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

async function parseGraphJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & GraphApiErrorPayload;
  if (!res.ok || data.error) {
    const msg = data.error?.message || `Meta Graph API returned HTTP ${res.status}`;
    const code = data.error?.code ? ` (code ${data.error.code})` : '';
    throw new Error(`${msg}${code}`);
  }
  return data;
}

export async function exchangeCodeForShortToken(
  code: string,
  config: MetaConfig
): Promise<{ access_token: string; token_type?: string; expires_in?: number }> {
  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
  });
  const res = await fetch(`${GRAPH_BASE_URL}/oauth/access_token?${params.toString()}`);
  return parseGraphJson(res);
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  config: MetaConfig
): Promise<{ access_token: string; token_type?: string; expires_in?: number }> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`${GRAPH_BASE_URL}/oauth/access_token?${params.toString()}`);
  return parseGraphJson(res);
}

export interface FacebookUserProfile {
  id: string;
  name: string;
  email?: string;
}

export async function fetchFacebookUser(userAccessToken: string): Promise<FacebookUserProfile> {
  const params = new URLSearchParams({
    fields: 'id,name,email',
    access_token: userAccessToken,
  });
  const res = await fetch(`${GRAPH_BASE_URL}/me?${params.toString()}`);
  return parseGraphJson<FacebookUserProfile>(res);
}

export interface FacebookManagedPage {
  id: string;
  name: string;
  category?: string;
  access_token?: string;
  tasks?: string[];
}

/**
 * Fetches all Facebook Pages managed by the authenticated user along with
 * their never-expiring Page Access Tokens (when fetched with a Long-Lived User Token).
 */
export async function fetchManagedPages(longLivedUserToken: string): Promise<FacebookManagedPage[]> {
  const pages: FacebookManagedPage[] = [];
  let nextUrl: string | undefined = `${GRAPH_BASE_URL}/me/accounts?${new URLSearchParams({
    fields: 'id,name,category,access_token,tasks',
    limit: '100',
    access_token: longLivedUserToken,
  }).toString()}`;

  while (nextUrl) {
    const res: Response = await fetch(nextUrl);
    const payload: {
      data: FacebookManagedPage[];
      paging?: { next?: string };
    } = await parseGraphJson<{
      data: FacebookManagedPage[];
      paging?: { next?: string };
    }>(res);
    if (Array.isArray(payload.data)) {
      pages.push(...payload.data);
    }
    nextUrl = payload.paging?.next;
  }

  return pages.filter((p) => Boolean(p.access_token));
}

export interface PublishResult {
  facebookPostId: string;
}

function getImageMimeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function getExtensionFromMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('png')) return 'png';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('gif')) return 'gif';
  return 'jpg';
}

/**
 * Publishes a post to a Facebook Page via Graph API v21.0.
 * - Uses DB-stored base64 imageData via multipart upload to /{pageId}/photos when available
 * - Uses multipart file upload when imageUrl is a locally uploaded image (/api/uploads/...)
 * - Uses url parameter on /{pageId}/photos when imageUrl is a public http(s) URL
 * - Uses /{pageId}/feed for text-only posts
 */
export async function publishToFacebookPage(params: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  imageUrl?: string | null;
  imageData?: string | null;
  imageMimeType?: string | null;
}): Promise<PublishResult> {
  const { pageId, pageAccessToken, message, imageUrl, imageData, imageMimeType } = params;

  if (imageData && imageData.trim().length > 0) {
    const cleanBase64 = imageData
      .trim()
      .replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const mime = imageMimeType?.trim() || 'image/jpeg';
    const fileBytes = Buffer.from(cleanBase64, 'base64');
    const filename = `product.${getExtensionFromMime(mime)}`;

    const form = new FormData();
    form.append('source', new Blob([fileBytes], { type: mime }), filename);
    form.append('caption', message);
    form.append('access_token', pageAccessToken);

    const res = await fetch(`${GRAPH_BASE_URL}/${encodeURIComponent(pageId)}/photos`, {
      method: 'POST',
      body: form,
    });
    const data = await parseGraphJson<{ id?: string; post_id?: string }>(res);
    const postId = data.post_id || data.id;
    if (!postId) {
      throw new Error('Meta Graph API did not return a post ID after photo upload.');
    }
    return { facebookPostId: postId };
  }

  const trimmedImageUrl = imageUrl?.trim();

  if (trimmedImageUrl && trimmedImageUrl.startsWith('/api/uploads/')) {
    const filename = path.basename(trimmedImageUrl);
    if (!filename || filename.includes('..')) {
      throw new Error('Invalid uploaded image path.');
    }

    const fileBytes = await fs.readFile(path.join(UPLOADS_DIR, filename));
    const form = new FormData();
    form.append('source', new Blob([fileBytes], { type: getImageMimeFromFilename(filename) }), filename);
    form.append('caption', message);
    form.append('access_token', pageAccessToken);

    const res = await fetch(`${GRAPH_BASE_URL}/${encodeURIComponent(pageId)}/photos`, {
      method: 'POST',
      body: form,
    });
    const data = await parseGraphJson<{ id?: string; post_id?: string }>(res);
    const postId = data.post_id || data.id;
    if (!postId) {
      throw new Error('Meta Graph API did not return a post ID after photo upload.');
    }
    return { facebookPostId: postId };
  }

  if (trimmedImageUrl && trimmedImageUrl.length > 0) {
    const body = new URLSearchParams({
      url: trimmedImageUrl,
      caption: message,
      access_token: pageAccessToken,
    });
    const res = await fetch(`${GRAPH_BASE_URL}/${encodeURIComponent(pageId)}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await parseGraphJson<{ id?: string; post_id?: string }>(res);
    const postId = data.post_id || data.id;
    if (!postId) {
      throw new Error('Meta Graph API did not return a post ID after photo upload.');
    }
    return { facebookPostId: postId };
  }

  const body = new URLSearchParams({
    message,
    access_token: pageAccessToken,
  });
  const res = await fetch(`${GRAPH_BASE_URL}/${encodeURIComponent(pageId)}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await parseGraphJson<{ id?: string }>(res);
  if (!data.id) {
    throw new Error('Meta Graph API did not return a post ID after feed publish.');
  }
  return { facebookPostId: data.id };
}
