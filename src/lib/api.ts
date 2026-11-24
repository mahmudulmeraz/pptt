import type { AuthUser, ConnectedPageItem, OAuthStatus, PostQueueItem, ProductItem } from '../types';

const SESSION_STORAGE_KEY = 'pagepulse_session_token';

export function getStoredSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredSessionToken();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
    redirectUri?: string;
  };

  if (!res.ok) {
    const err = new Error(data.message || data.error || `Request failed (${res.status})`) as Error & {
      code?: string;
      status?: number;
      redirectUri?: string;
    };
    err.code = data.error;
    err.status = res.status;
    err.redirectUri = data.redirectUri;
    throw err;
  }

  return data;
}

export function fetchOAuthStatus(): Promise<OAuthStatus> {
  return apiFetch<OAuthStatus>('/api/config/oauth-status');
}

export function fetchSession(): Promise<{ user: AuthUser | null }> {
  return apiFetch<{ user: AuthUser | null }>('/api/auth/session');
}

export async function logoutSession(): Promise<void> {
  await apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  setStoredSessionToken(null);
}

export function fetchFacebookAuthUrl(): Promise<{ url: string; redirectUri: string }> {
  return apiFetch<{ url: string; redirectUri: string }>('/api/auth/facebook/login?format=json');
}

export function fetchConnectedPages(): Promise<{ pages: ConnectedPageItem[] }> {
  return apiFetch<{ pages: ConnectedPageItem[] }>('/api/pages');
}

export function updateConnectedPage(
  pageId: string,
  payload: { isActive?: boolean; postFrequencyHours?: number }
): Promise<{ page: ConnectedPageItem }> {
  return apiFetch<{ page: ConnectedPageItem }>(`/api/pages/${encodeURIComponent(pageId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function disconnectConnectedPage(pageId: string): Promise<{ ok: boolean; id: string }> {
  return apiFetch<{ ok: boolean; id: string }>(`/api/pages/${encodeURIComponent(pageId)}`, {
    method: 'DELETE',
  });
}

export function uploadProductImage(payload: {
  mimeType: string;
  dataBase64: string;
}): Promise<{ imageUrl: string }> {
  return apiFetch<{ imageUrl: string }>('/api/uploads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function addPageProduct(
  pageId: string,
  payload: {
    title?: string;
    details: string;
    imageUrl?: string;
    imageData?: string;
    imageMimeType?: string;
  }
): Promise<{ product: ProductItem }> {
  return apiFetch<{ product: ProductItem }>(`/api/pages/${encodeURIComponent(pageId)}/products`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deletePageProduct(
  pageId: string,
  productId: string
): Promise<{ ok: boolean; id: string }> {
  return apiFetch<{ ok: boolean; id: string }>(
    `/api/pages/${encodeURIComponent(pageId)}/products/${encodeURIComponent(productId)}`,
    { method: 'DELETE' }
  );
}

export function enqueuePagePost(
  pageId: string,
  payload: { content: string; imageUrl?: string; scheduledFor?: string }
): Promise<{ post: PostQueueItem }> {
  return apiFetch<{ post: PostQueueItem }>(`/api/pages/${encodeURIComponent(pageId)}/queue`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteQueuedPost(pageId: string, postId: string): Promise<{ ok: boolean; id: string }> {
  return apiFetch<{ ok: boolean; id: string }>(
    `/api/pages/${encodeURIComponent(pageId)}/queue/${encodeURIComponent(postId)}`,
    { method: 'DELETE' }
  );
}

export function publishTestPost(
  pageId: string,
  payload?: { content?: string; imageUrl?: string; productItemId?: string }
): Promise<{
  ok: boolean;
  result: {
    pageId: string;
    pageName: string;
    queueItemId: string;
    status: 'PUBLISHED' | 'FAILED';
    facebookPostId?: string;
    errorMessage?: string;
  };
}> {
  return apiFetch(`/api/pages/${encodeURIComponent(pageId)}/test-post`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });
}
