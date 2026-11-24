export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  facebookUserId: string;
  createdAt: string;
}

export interface OAuthStatus {
  configured: boolean;
  redirectUri: string;
  appBaseUrl: string;
  scopes: string[];
}

export type PostStatus = 'PENDING' | 'PUBLISHED' | 'FAILED';

export interface ProductItem {
  id: string;
  connectedPageId: string;
  title: string;
  details: string;
  imageUrl: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface PostQueueItem {
  id: string;
  connectedPageId: string;
  productItemId?: string | null;
  content: string;
  imageUrl: string | null;
  status: PostStatus;
  facebookPostId: string | null;
  errorMessage: string | null;
  scheduledFor: string;
  publishedAt: string | null;
  createdAt: string;
}

export interface ConnectedPageItem {
  id: string;
  userId: string;
  pageId: string;
  pageName: string;
  pageCategory: string | null;
  isActive: boolean;
  postFrequencyHours: number;
  lastPostedAt: string | null;
  createdAt: string;
  products: ProductItem[];
  postQueue: PostQueueItem[];
}
