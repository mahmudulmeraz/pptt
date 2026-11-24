import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Copy, ArrowRight, ShieldCheck, Layers } from 'lucide-react';
import { MetaConnectButton } from '../components/MetaConnectButton';
import { fetchOAuthStatus } from '../lib/api';
import type { AuthUser, OAuthStatus } from '../types';

interface LandingPageProps {
  user: AuthUser | null;
  onAuthSuccess: () => void;
}

const HERO_IMAGE = '/src/assets/images/hero_publishing_studio_1794982590219.jpg';
const WORKFLOW_IMAGE = '/src/assets/images/workflow_automation_desk_1794982589960.jpg';

export function LandingPage({ user, onAuthSuccess }: LandingPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get('oauth_error');

  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [workflowImgFailed, setWorkflowImgFailed] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);

  useEffect(() => {
    fetchOAuthStatus()
      .then(setOauthStatus)
      .catch(() => setOauthStatus(null));
  }, []);

  const resolvedCallbackUri =
    oauthStatus?.redirectUri || `${window.location.origin}/api/auth/facebook/callback`;

  const handleCopyUri = async () => {
    try {
      await navigator.clipboard.writeText(resolvedCallbackUri);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <main className="flex-1">
      {oauthError && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-6xl mx-auto px-6 py-3 text-sm text-amber-900">
            Meta OAuth notice: {oauthError}
          </div>
        </div>
      )}

      {/* Hero Split Section */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-14 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between space-y-8">
              <div className="space-y-5">
                <p className="text-xs font-medium tracking-wide text-[#1E40AF]">
                  Meta Graph API v21.0 · Multi-Tenant Publishing
                </p>
                <h1
                  className="font-display font-bold tracking-tight text-slate-900 leading-[1.1]"
                  style={{ fontSize: 'clamp(2.25rem, 4vw, 3.35rem)', textWrap: 'balance' }}
                >
                  Automated Facebook Page publishing without manual token setup.
                </h1>
                <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                  Clients sign in through official Meta OAuth, pick the Facebook Pages they manage,
                  and set a recurring publishing cadence. PagePulse exchanges short-lived codes into
                  never-expiring Page Access Tokens, encrypts them with AES-256-GCM, and publishes
                  scheduled text and photo posts automatically.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  {user ? (
                    <Link
                      to="/dashboard"
                      className="inline-flex items-center justify-center gap-2.5 px-6 py-3 text-sm font-semibold rounded-lg bg-[#1E40AF] text-white hover:bg-[#1D4ED8] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2"
                    >
                      <span>Open Client Dashboard</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  ) : (
                    <MetaConnectButton
                      label="Connect with Facebook"
                      onSuccess={() => {
                        onAuthSuccess();
                        navigate('/dashboard');
                      }}
                    />
                  )}

                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>View Dashboard</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>

                <p className="text-xs text-slate-500">
                  Requests <span className="font-mono text-slate-700">pages_show_list</span>,{' '}
                  <span className="font-mono text-slate-700">pages_manage_posts</span>,{' '}
                  <span className="font-mono text-slate-700">pages_read_engagement</span>, and{' '}
                  <span className="font-mono text-slate-700">business_management</span>.
                </p>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[280px] lg:min-h-[380px] w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                {!heroImgFailed ? (
                  <img
                    src={HERO_IMAGE}
                    alt="Modern digital publishing studio workstation managing scheduled Facebook Page operations"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600">
                    <Layers className="w-10 h-10 mb-3 text-slate-400" aria-hidden="true" />
                    <p className="text-sm font-medium text-slate-700">
                      PagePulse Publishing Operations Workspace
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4-Column Architectural Spec Strip */}
          <div className="mt-12 pt-8 border-t border-slate-200 grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <p className="text-xs text-slate-500">Meta API Target</p>
              <p className="mt-1 font-display text-lg font-semibold text-slate-900 tabular-nums">
                Graph API v21.0
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Token Exchange</p>
              <p className="mt-1 font-display text-lg font-semibold text-slate-900">
                Never-Expiring Page Token
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Token Vault Cipher</p>
              <p className="mt-1 font-display text-lg font-semibold text-slate-900 font-mono">
                AES-256-GCM
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Supported Formats</p>
              <p className="mt-1 font-display text-lg font-semibold text-slate-900">
                Text Feed &amp; Photo Posts
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities & Pipeline Section */}
      <section id="workflow" className="max-w-6xl mx-auto px-6 py-16 lg:py-20">
        <div className="max-w-2xl space-y-3 mb-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            End-to-end Page automation built for multi-client scale
          </h2>
          <p className="text-base text-slate-600">
            Every step from OAuth consent to scheduled cron execution runs cleanly on your backend,
            keeping client credentials encrypted at rest and never exposed to the browser.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <article className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
              <h3 className="font-display text-base font-semibold text-slate-900">
                01. Official Meta OAuth Handshake
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Generates a signed CSRF state cookie and redirects clients straight to Meta&apos;s
                permission dialog to select the Pages they authorize.
              </p>
            </article>

            <article className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
              <h3 className="font-display text-base font-semibold text-slate-900">
                02. Permanent Token Exchange
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Exchanges the authorization code for a 60-day user token, calls{' '}
                <code className="font-mono text-xs text-slate-800">/me/accounts</code> for permanent
                Page tokens, and encrypts each with AES-256-GCM.
              </p>
            </article>

            <article className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
              <h3 className="font-display text-base font-semibold text-slate-900">
                03. Queue &amp; Cadence Scheduler
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Protected <code className="font-mono text-xs text-slate-800">POST /api/cron/publish</code>{' '}
                worker evaluates each active Page&apos;s hourly interval, drains pending queue items,
                or invokes the customizable fallback hook.
              </p>
            </article>

            <article className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
              <h3 className="font-display text-base font-semibold text-slate-900">
                04. Instant Verification &amp; Audit
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Clients can publish an instant test post directly from their dashboard, inspect
                exact Graph API errors, or revoke access at any time.
              </p>
            </article>
          </div>

          <div className="lg:col-span-5">
            <div className="h-full min-h-[260px] rounded-xl overflow-hidden border border-slate-200 bg-white flex flex-col">
              <div className="flex-1 bg-slate-100 overflow-hidden">
                {!workflowImgFailed ? (
                  <img
                    src={WORKFLOW_IMAGE}
                    alt="Editorial calendar grid and workstation for scheduled Facebook Page publishing"
                    referrerPolicy="no-referrer"
                    onError={() => setWorkflowImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-6 text-slate-500 text-sm">
                    Editorial Queue &amp; Cadence Control
                  </div>
                )}
              </div>
              <div className="p-5 border-t border-slate-200 space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  Built for Meta App Review Verification
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Includes one-click test publishing, public Privacy Policy, Terms of Service, and
                  signed Data Deletion callback support.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Meta Developer Setup & Compliance Reference Strip */}
      <section className="bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldCheck className="w-5 h-5 text-[#1E40AF]" aria-hidden="true" />
              <h2 className="font-display text-xl font-bold tracking-tight">
                Meta App Review &amp; OAuth Callback Configuration
              </h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Register the exact OAuth Redirect URI below inside your Meta for Developers{' '}
              <strong>Facebook Login for Business</strong> settings and pair it with your{' '}
              <code className="font-mono text-xs text-slate-800">META_APP_ID</code> and{' '}
              <code className="font-mono text-xs text-slate-800">META_APP_SECRET</code> environment
              variables.
            </p>

            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <code className="font-mono text-xs text-slate-900 truncate flex-1">
                {resolvedCallbackUri}
              </code>
              <button
                type="button"
                onClick={handleCopyUri}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1E40AF] hover:underline whitespace-nowrap shrink-0"
              >
                {copiedUri ? (
                  <>
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy Callback URI</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 border border-slate-200 rounded-xl p-6 bg-slate-50/70 space-y-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Public Compliance URLs
            </h3>
            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2">
                <dt className="text-slate-600">Privacy Policy</dt>
                <dd>
                  <Link to="/privacy-policy" className="font-mono text-[#1E40AF] hover:underline">
                    /privacy-policy
                  </Link>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2">
                <dt className="text-slate-600">Terms of Service</dt>
                <dd>
                  <Link to="/terms" className="font-mono text-[#1E40AF] hover:underline">
                    /terms
                  </Link>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-2">
                <dt className="text-slate-600">User Data Deletion</dt>
                <dd>
                  <Link to="/data-deletion" className="font-mono text-[#1E40AF] hover:underline">
                    /data-deletion
                  </Link>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-600">Deauthorize Webhook</dt>
                <dd className="font-mono text-slate-800">/api/auth/facebook/deauthorize</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </main>
  );
}
