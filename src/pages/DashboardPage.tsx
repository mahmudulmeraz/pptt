import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  LogOut,
  Pause,
  Play,
  Send,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { MetaConnectButton } from '../components/MetaConnectButton';
import {
  addPageProduct,
  deletePageProduct,
  deleteQueuedPost,
  disconnectConnectedPage,
  fetchConnectedPages,
  logoutSession,
  publishTestPost,
  updateConnectedPage,
} from '../lib/api';
import type { AuthUser, ConnectedPageItem, PostStatus } from '../types';

interface DashboardPageProps {
  user: AuthUser | null;
  loadingAuth: boolean;
  onRefreshSession: () => Promise<void>;
}

const FREQUENCY_OPTIONS = [
  { value: 1, label: 'Every 1 hour' },
  { value: 2, label: 'Every 2 hours' },
  { value: 3, label: 'Every 3 hours' },
  { value: 6, label: 'Every 6 hours' },
  { value: 12, label: 'Every 12 hours' },
  { value: 24, label: 'Every 24 hours' },
  { value: 48, label: 'Every 48 hours' },
  { value: 72, label: 'Every 72 hours' },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function DashboardPage({
  user,
  loadingAuth,
  onRefreshSession,
}: DashboardPageProps) {
  const [pages, setPages] = useState<ConnectedPageItem[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);

  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [pageFilter, setPageFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [queueFilter, setQueueFilter] = useState<'ALL' | PostStatus>('ALL');

  // Product catalog form state (Image Upload or URL + Product Details)
  const [productTitle, setProductTitle] = useState('');
  const [productDetails, setProductDetails] = useState('');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [productImageData, setProductImageData] = useState<string | null>(null);
  const [productImageMimeType, setProductImageMimeType] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productFeedback, setProductFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Action states
  const [togglingPage, setTogglingPage] = useState(false);
  const [updatingFreq, setUpdatingFreq] = useState(false);
  const [testingPost, setTestingPost] = useState(false);
  const [testPostBanner, setTestPostBanner] = useState<{
    type: 'success' | 'error';
    message: string;
    facebookPostId?: string;
  } | null>(null);
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadPages = useCallback(async () => {
    if (!user) {
      setPages([]);
      return;
    }
    setLoadingPages(true);
    setPagesError(null);
    try {
      const { pages: loaded } = await fetchConnectedPages();
      setPages(loaded);
      setSelectedPageId((prev) => {
        if (prev && loaded.some((p) => p.id === prev)) return prev;
        return loaded[0]?.id ?? null;
      });
    } catch (err) {
      setPagesError(err instanceof Error ? err.message : 'Unable to fetch connected Pages.');
    } finally {
      setLoadingPages(false);
    }
  }, [user]);

  useEffect(() => {
    loadPages();
    if (!user) return;
    const intervalId = window.setInterval(() => {
      void loadPages();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [loadPages, user]);

  const filteredPages = useMemo(() => {
    if (pageFilter === 'active') return pages.filter((p) => p.isActive);
    if (pageFilter === 'paused') return pages.filter((p) => !p.isActive);
    return pages;
  }, [pages, pageFilter]);

  const selectedPage = useMemo(
    () => pages.find((p) => p.id === selectedPageId) ?? null,
    [pages, selectedPageId]
  );

  const filteredQueue = useMemo(() => {
    if (!selectedPage) return [];
    if (queueFilter === 'ALL') return selectedPage.postQueue;
    return selectedPage.postQueue.filter((item) => item.status === queueFilter);
  }, [selectedPage, queueFilter]);

  const handleToggleActive = async (page: ConnectedPageItem) => {
    setTogglingPage(true);
    setTestPostBanner(null);
    try {
      const { page: updated } = await updateConnectedPage(page.id, {
        isActive: !page.isActive,
      });
      setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      setTestPostBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update status.',
      });
    } finally {
      setTogglingPage(false);
    }
  };

  const handleFrequencyChange = async (page: ConnectedPageItem, hours: number) => {
    setUpdatingFreq(true);
    setTestPostBanner(null);
    try {
      const { page: updated } = await updateConnectedPage(page.id, {
        postFrequencyHours: hours,
      });
      setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      setTestPostBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update cadence.',
      });
    } finally {
      setUpdatingFreq(false);
    }
  };

  const handleImageFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setProductFeedback(null);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read selected image file.'));
        reader.readAsDataURL(file);
      });

      setProductImageData(dataUrl);
      setProductImageMimeType(file.type || 'image/jpeg');
      setProductImageUrl('');
      setProductFeedback({ type: 'success', message: 'Product photo ready to save.' });
    } catch (err) {
      setProductFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to read image.',
      });
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleProductSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPage) return;

    const trimmedDetails = productDetails.trim();
    if (!trimmedDetails) {
      setProductFeedback({ type: 'error', message: 'Please enter product details.' });
      return;
    }

    setSavingProduct(true);
    setProductFeedback(null);

    try {
      await addPageProduct(selectedPage.id, {
        title: productTitle.trim() || undefined,
        details: trimmedDetails,
        imageUrl: productImageData ? undefined : productImageUrl.trim() || undefined,
        imageData: productImageData ?? undefined,
        imageMimeType: productImageMimeType ?? undefined,
      });

      setProductTitle('');
      setProductDetails('');
      setProductImageUrl('');
      setProductImageData(null);
      setProductImageMimeType(null);
      setProductFeedback({
        type: 'success',
        message:
          'Product saved. AI will automatically post this photo with a Bengali + English caption on schedule.',
      });
      await loadPages();
    } catch (err) {
      setProductFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save product.',
      });
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (pageId: string, productId: string) => {
    try {
      await deletePageProduct(pageId, productId);
      await loadPages();
    } catch (err) {
      setProductFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to remove product.',
      });
    }
  };

  const handleDeleteQueueItem = async (pageId: string, postId: string) => {
    try {
      await deleteQueuedPost(pageId, postId);
      await loadPages();
    } catch (err) {
      setTestPostBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to remove queued post.',
      });
    }
  };

  const handleTestPost = async (page: ConnectedPageItem, preferredProductId?: string) => {
    setTestingPost(true);
    setTestPostBanner(null);
    try {
      const response = await publishTestPost(
        page.id,
        preferredProductId ? { productItemId: preferredProductId } : {}
      );
      setTestPostBanner({
        type: 'success',
        message: `AI generated caption and published live to ${page.pageName}.`,
        facebookPostId: response.result.facebookPostId,
      });
      await loadPages();
    } catch (err) {
      setTestPostBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to generate and publish post.',
      });
      await loadPages();
    } finally {
      setTestingPost(false);
    }
  };

  const handleDisconnect = async (pageId: string) => {
    setDisconnecting(true);
    try {
      await disconnectConnectedPage(pageId);
      setConfirmDisconnectId(null);
      setTestPostBanner(null);
      await loadPages();
    } catch (err) {
      setTestPostBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to disconnect Page.',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleLogout = async () => {
    await logoutSession();
    await onRefreshSession();
  };

  if (loadingAuth) {
    return (
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4 animate-pulse">
          <div className="h-6 w-48 bg-slate-200 rounded" />
          <div className="h-4 w-80 bg-slate-100 rounded" />
          <div className="h-32 w-full bg-slate-100 rounded" />
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-16">
        <div className="max-w-xl bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Connect your Facebook Pages
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Sign in with Meta OAuth to authorize the Facebook Pages you want PagePulse to manage.
              Add your product images and details once, choose an interval starting from 1 hour, and
              let AI write and publish organic posts automatically.
            </p>
          </div>
          <MetaConnectButton
            label="Connect with Facebook"
            onSuccess={() => {
              onRefreshSession();
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Sidebar: Account + Connected Pages List */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold text-slate-900 truncate">
                  {user.name}
                </p>
                <p className="text-xs text-slate-500 font-mono tabular-nums truncate">
                  FB ID: {user.facebookUserId}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign out"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </div>

            <MetaConnectButton
              label="Sync / Add Pages"
              variant="secondary"
              onSuccess={loadPages}
              className="w-full"
            />
          </div>

          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'active', 'paused'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setPageFilter(tab)}
                  className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap ${
                    pageFilter === tab
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <nav aria-label="Connected Facebook Pages" className="divide-y divide-slate-200">
            {loadingPages && pages.length === 0 ? (
              <div className="p-5 space-y-3">
                <div className="h-10 bg-slate-100 rounded animate-pulse" />
                <div className="h-10 bg-slate-100 rounded animate-pulse" />
              </div>
            ) : filteredPages.length === 0 ? (
              <div className="p-5 text-xs text-slate-500">
                No connected Pages match this filter.
              </div>
            ) : (
              filteredPages.map((page) => {
                const isSelected = page.id === selectedPage?.id;
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => {
                      setSelectedPageId(page.id);
                      setTestPostBanner(null);
                      setProductFeedback(null);
                      setConfirmDisconnectId(null);
                    }}
                    className={`w-full text-left px-5 py-3.5 transition-colors flex items-center justify-between gap-3 ${
                      isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${
                          isSelected ? 'text-[#1E40AF]' : 'text-slate-900'
                        }`}
                      >
                        {page.pageName}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                        Every {page.postFrequencyHours}h ·{' '}
                        <span className={page.isActive ? 'text-[#16A34A]' : 'text-[#D97706]'}>
                          {page.isActive ? 'Active' : 'Paused'}
                        </span>
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </nav>
        </aside>

        {/* Main Workspace Viewport */}
        <section className="lg:col-span-9 space-y-6">
          {pagesError && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-sm text-red-800"
            >
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{pagesError}</span>
            </div>
          )}

          {!loadingPages && pages.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
              <h1 className="font-display text-xl font-bold text-slate-900">
                No Facebook Pages connected yet
              </h1>
              <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                Make sure you grant Page permissions during the Meta OAuth dialog and manage at
                least one Facebook Page with publishing privileges.
              </p>
              <div className="pt-2">
                <MetaConnectButton label="Reconnect & Select Pages" onSuccess={loadPages} />
              </div>
            </div>
          ) : selectedPage ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Page Control Header */}
              <div className="p-6 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="font-display text-xl font-bold text-slate-900 truncate">
                      {selectedPage.pageName}
                    </h1>
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                        selectedPage.isActive ? 'text-[#16A34A]' : 'text-[#D97706]'
                      }`}
                    >
                      {selectedPage.isActive ? (
                        <Play className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>{selectedPage.isActive ? 'Active' : 'Paused'}</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 tabular-nums">
                    {selectedPage.pageCategory || 'Facebook Page'} · ID{' '}
                    <span className="font-mono text-slate-700">{selectedPage.pageId}</span> · Last
                    published: {formatDateTime(selectedPage.lastPostedAt)} ·{' '}
                    {selectedPage.isActive
                      ? selectedPage.products.length === 0
                        ? 'Waiting for a saved product'
                        : selectedPage.lastPostedAt
                          ? `Next auto-post: ${formatDateTime(
                              new Date(
                                new Date(selectedPage.lastPostedAt).getTime() +
                                  selectedPage.postFrequencyHours * 60 * 60 * 1000
                              ).toISOString()
                            )}`
                          : 'Next auto-post: Due now'
                      : 'Automation paused'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                    <span className="whitespace-nowrap">Cadence</span>
                    <select
                      aria-label="Posting frequency"
                      value={selectedPage.postFrequencyHours}
                      disabled={updatingFreq}
                      onChange={(e) =>
                        handleFrequencyChange(selectedPage, Number(e.target.value))
                      }
                      className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
                    >
                      {FREQUENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    disabled={togglingPage}
                    onClick={() => handleToggleActive(selectedPage)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    {selectedPage.isActive ? (
                      <>
                        <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Pause Automation</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Resume Automation</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={testingPost}
                    onClick={() => handleTestPost(selectedPage)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#1E40AF] text-white hover:bg-[#1D4ED8] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{testingPost ? 'Generating & Publishing...' : 'Publish AI Post Now'}</span>
                  </button>

                  {confirmDisconnectId === selectedPage.id ? (
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        disabled={disconnecting}
                        onClick={() => handleDisconnect(selectedPage.id)}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-[#DC2626] text-white hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
                      >
                        {disconnecting ? 'Removing...' : 'Confirm Disconnect'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDisconnectId(null)}
                        className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnectId(selectedPage.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:text-[#DC2626] hover:border-red-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Disconnect Page</span>
                    </button>
                  )}
                </div>
              </div>

              {testPostBanner && (
                <div
                  role="status"
                  className={`px-6 py-3.5 border-b text-sm flex flex-wrap items-center justify-between gap-3 ${
                    testPostBanner.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testPostBanner.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" aria-hidden="true" />
                    ) : (
                      <XCircle className="w-4 h-4 text-[#DC2626] shrink-0" aria-hidden="true" />
                    )}
                    <span>{testPostBanner.message}</span>
                  </div>
                  {testPostBanner.facebookPostId && (
                    <a
                      href={`https://www.facebook.com/${testPostBanner.facebookPostId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E40AF] hover:underline"
                    >
                      <span>View Live Post</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}

              {/* Split Body: Product Catalog (Image + Details for AI) + Automated Post History */}
              <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-slate-200">
                {/* Product Catalog Form & Saved Items */}
                <div className="xl:col-span-6 p-6 space-y-6">
                  <div>
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Products &amp; Images for AI Auto-Posting
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Add a product photo (upload or URL) beside its product details. At every
                      hourly interval, Gemini AI automatically posts the saved photo with a natural
                      Bengali + English caption to build organic trust.
                    </p>
                  </div>

                  <form onSubmit={handleProductSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                      {/* Image Upload / URL Column */}
                      <div className="sm:col-span-5 space-y-2.5">
                        <span className="block text-xs font-medium text-slate-700">
                          Product Image
                        </span>

                        <div className="aspect-square w-full rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
                          {productImageData || productImageUrl ? (
                            <img
                              src={productImageData || productImageUrl}
                              alt="Product preview"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center p-4 space-y-1 text-slate-400">
                              <ImageIcon className="w-6 h-6 mx-auto" aria-hidden="true" />
                              <p className="text-xs">No image yet</p>
                            </div>
                          )}
                        </div>

                        <label className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 cursor-pointer transition-colors">
                          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{uploadingImage ? 'Reading...' : 'Upload Image'}</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            disabled={uploadingImage}
                            onChange={handleImageFileSelect}
                            className="sr-only"
                          />
                        </label>

                        <input
                          type="text"
                          value={productImageUrl}
                          onChange={(e) => {
                            setProductImageUrl(e.target.value);
                            if (e.target.value.trim()) {
                              setProductImageData(null);
                              setProductImageMimeType(null);
                            }
                          }}
                          placeholder="Or paste https:// image URL"
                          aria-label="Product image URL"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
                        />
                      </div>

                      {/* Product Details Column Beside Image */}
                      <div className="sm:col-span-7 space-y-3">
                        <div className="space-y-1.5">
                          <label htmlFor="product-title" className="block text-xs font-medium text-slate-700">
                            Product Name (optional)
                          </label>
                          <input
                            id="product-title"
                            type="text"
                            value={productTitle}
                            onChange={(e) => setProductTitle(e.target.value)}
                            placeholder="e.g., Cold-Pressed Olive Oil 500ml"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="product-details" className="block text-xs font-medium text-slate-700">
                            Product Details
                          </label>
                          <textarea
                            id="product-details"
                            rows={6}
                            required
                            value={productDetails}
                            onChange={(e) => setProductDetails(e.target.value)}
                            placeholder="Describe key benefits, craftsmanship, ingredients, who it helps, price, or store link so AI can write trustworthy organic posts..."
                            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E40AF]"
                          />
                        </div>
                      </div>
                    </div>

                    {productFeedback && (
                      <p
                        role="status"
                        className={`text-xs font-medium ${
                          productFeedback.type === 'success' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {productFeedback.message}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={savingProduct || uploadingImage}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors disabled:opacity-60"
                    >
                      {savingProduct ? 'Saving Product...' : 'Save Product for Auto-Posting'}
                    </button>
                  </form>

                  {/* Saved Products List */}
                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <h3 className="font-semibold text-slate-900">Saved Products</h3>
                      <span className="text-slate-500 tabular-nums">
                        {selectedPage.products.length} item(s)
                      </span>
                    </div>

                    {selectedPage.products.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No products saved yet. Add a product above so AI can feature it in
                        automated interval posts.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                        {selectedPage.products.map((product) => (
                          <div key={product.id} className="p-3.5 flex items-start gap-3.5">
                            <div className="w-16 h-16 rounded-md border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                              {product.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.title}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-slate-400" aria-hidden="true" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {product.title}
                              </p>
                              <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                                {product.details}
                              </p>
                              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                                <span className="text-slate-400 tabular-nums">
                                  Last posted: {formatDateTime(product.lastUsedAt)}
                                </span>
                                <button
                                  type="button"
                                  disabled={testingPost}
                                  onClick={() => handleTestPost(selectedPage, product.id)}
                                  className="font-medium text-[#1E40AF] hover:underline disabled:opacity-50"
                                >
                                  Post Now
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProduct(selectedPage.id, product.id)}
                                  className="text-slate-400 hover:text-[#DC2626] transition-colors"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Automated Post History & Queue Log */}
                <div className="xl:col-span-6 p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        AI Post Queue &amp; History
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        {selectedPage.postQueue.length} recorded item(s)
                      </p>
                    </div>

                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      {(['ALL', 'PENDING', 'PUBLISHED', 'FAILED'] as const).map((statusTab) => (
                        <button
                          key={statusTab}
                          type="button"
                          onClick={() => setQueueFilter(statusTab)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            queueFilter === statusTab
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {statusTab === 'ALL'
                            ? 'All'
                            : statusTab.charAt(0) + statusTab.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredQueue.length === 0 ? (
                    <div className="border border-dashed border-slate-200 rounded-lg p-8 text-center space-y-1.5">
                      <p className="text-sm font-medium text-slate-700">
                        No posts in this view
                      </p>
                      <p className="text-xs text-slate-500">
                        Save a product on the left and click &ldquo;Publish AI Post Now&rdquo; or
                        let the {selectedPage.postFrequencyHours}-hour scheduler publish
                        automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                      {filteredQueue.map((item) => (
                        <div key={item.id} className="p-4 space-y-2 hover:bg-slate-50/70 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {item.status === 'PUBLISHED' && (
                                <span className="inline-flex items-center gap-1 font-semibold text-[#16A34A]">
                                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Published</span>
                                </span>
                              )}
                              {item.status === 'PENDING' && (
                                <span className="inline-flex items-center gap-1 font-semibold text-[#D97706]">
                                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Pending</span>
                                </span>
                              )}
                              {item.status === 'FAILED' && (
                                <span className="inline-flex items-center gap-1 font-semibold text-[#DC2626]">
                                  <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Failed</span>
                                </span>
                              )}

                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>

                              <span className="text-slate-500 tabular-nums">
                                {item.publishedAt
                                  ? `Published ${formatDateTime(item.publishedAt)}`
                                  : `Scheduled ${formatDateTime(item.scheduledFor)}`}
                              </span>

                              {item.imageUrl && (
                                <>
                                  <span aria-hidden="true" className="text-slate-300">
                                    ·
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-slate-500">
                                    <ImageIcon className="w-3 h-3" aria-hidden="true" />
                                    <span>Photo attached</span>
                                  </span>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              {item.facebookPostId && (
                                <a
                                  href={`https://www.facebook.com/${item.facebookPostId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-[#1E40AF] hover:underline whitespace-nowrap"
                                >
                                  <span>Facebook Post</span>
                                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                </a>
                              )}
                              {item.status === 'PENDING' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteQueueItem(selectedPage.id, item.id)}
                                  className="text-xs text-slate-400 hover:text-[#DC2626] transition-colors"
                                  aria-label="Remove queued post"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>

                          <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                            {item.content}
                          </p>

                          {item.errorMessage && (
                            <p className="text-xs font-mono text-[#DC2626] bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
                              Error: {item.errorMessage}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
