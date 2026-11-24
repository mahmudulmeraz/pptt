import { useEffect, useState } from 'react';
import { ArrowUpRight, Copy, Check, AlertCircle } from 'lucide-react';
import { fetchFacebookAuthUrl, setStoredSessionToken } from '../lib/api';

interface MetaConnectButtonProps {
  label?: string;
  variant?: 'primary' | 'secondary' | 'compact';
  onSuccess?: () => void;
  className?: string;
}

export function MetaConnectButton({
  label = 'Connect with Facebook',
  variant = 'primary',
  onSuccess,
  className = '',
}: MetaConnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [setupNotice, setSetupNotice] = useState<{
    message: string;
    redirectUri?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      const isAllowedOrigin =
        origin === window.location.origin ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost');

      if (!isAllowedOrigin || !event.data || typeof event.data !== 'object') {
        return;
      }

      if (event.data.type === 'META_OAUTH_SUCCESS') {
        if (typeof event.data.sessionToken === 'string') {
          setStoredSessionToken(event.data.sessionToken);
        }
        setLoading(false);
        setSetupNotice(null);
        if (onSuccess) {
          onSuccess();
        }
      } else if (event.data.type === 'META_OAUTH_ERROR') {
        setLoading(false);
        setSetupNotice({
          message:
            typeof event.data.error === 'string'
              ? event.data.error
              : 'Facebook authentication did not complete.',
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccess]);

  const handleClick = async () => {
    setLoading(true);
    setSetupNotice(null);

    try {
      const { url } = await fetchFacebookAuthUrl();
      const popup = window.open(
        url,
        'meta_oauth_dialog',
        'width=640,height=740,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        // Fallback if popups are blocked: navigate top window if permitted or inform user
        setLoading(false);
        setSetupNotice({
          message: 'Popup window was blocked by your browser. Please allow popups for this site and try again.',
        });
        return;
      }

      const pollTimer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(pollTimer);
          setLoading(false);
        }
      }, 600);
    } catch (err) {
      setLoading(false);
      const typedErr = err as Error & { redirectUri?: string };
      setSetupNotice({
        message: typedErr.message || 'Unable to start Meta OAuth flow.',
        redirectUri: typedErr.redirectUri,
      });
    }
  };

  const handleCopyUri = async (uri: string) => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const baseButtonClasses =
    variant === 'compact'
      ? 'inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#1E40AF] text-white hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60'
      : variant === 'secondary'
        ? 'inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60'
        : 'inline-flex items-center justify-center gap-2.5 px-6 py-3 text-sm font-semibold rounded-lg bg-[#1E40AF] text-white hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60';

  return (
    <div className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`${baseButtonClasses} ${className}`}
      >
        <span>{loading ? 'Connecting to Meta...' : label}</span>
        <ArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" />
      </button>

      {setupNotice && (
        <div
          role="alert"
          className="mt-4 w-full max-w-xl rounded-lg border border-amber-200 bg-amber-50/90 p-4 text-left text-sm text-slate-800"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="space-y-2 min-w-0 flex-1">
              <p className="font-medium text-slate-900">{setupNotice.message}</p>
              {setupNotice.redirectUri && (
                <div className="space-y-1.5 text-xs text-slate-700">
                  <p>
                    Configure <code className="font-mono text-slate-900">META_APP_ID</code> and{' '}
                    <code className="font-mono text-slate-900">META_APP_SECRET</code> in your
                    environment, then add this Valid OAuth Redirect URI in Meta for Developers:
                  </p>
                  <div className="flex items-center gap-2 bg-white border border-amber-200 rounded px-2.5 py-1.5">
                    <code className="font-mono text-xs text-slate-900 truncate flex-1">
                      {setupNotice.redirectUri}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopyUri(setupNotice.redirectUri!)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#1E40AF] hover:underline whitespace-nowrap shrink-0"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Copy URI</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
