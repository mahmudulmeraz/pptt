import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

export function DataDeletionPage() {
  const [searchParams] = useSearchParams();
  const confirmationCode = searchParams.get('code');

  return (
    <main className="flex-1 bg-white">
      <div className="max-w-3xl mx-auto px-6 py-14 space-y-10">
        <header className="space-y-2 border-b border-slate-200 pb-6">
          <p className="text-xs font-medium text-[#1E40AF]">Meta Platform Data Deletion</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
            User Data Deletion Instructions
          </h1>
          <p className="text-xs text-slate-500">
            How to revoke PagePulse access and delete all stored Facebook Page tokens and logs
          </p>
        </header>

        {confirmationCode && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-start gap-3 text-sm text-emerald-950"
          >
            <CheckCircle2 className="w-5 h-5 text-[#16A34A] mt-0.5 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">Data Deletion Request Confirmed</p>
              <p className="text-emerald-800">
                Your Facebook user record, connected Page tokens, and post queue logs have been
                permanently removed. Confirmation code:{' '}
                <code className="font-mono font-semibold text-emerald-950">{confirmationCode}</code>
              </p>
            </div>
          </div>
        )}

        <div className="space-y-8 text-sm text-slate-700 leading-relaxed">
          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Option A: Disconnect Directly in PagePulse
            </h2>
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>
                Open the{' '}
                <Link to="/dashboard" className="text-[#1E40AF] hover:underline">
                  Client Dashboard
                </Link>
                .
              </li>
              <li>Select the Facebook Page you want to remove from the left sidebar.</li>
              <li>
                Click <strong>Disconnect Page</strong> and confirm the removal. This immediately
                deletes the encrypted Page Access Token and all queued post history for that Page.
              </li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Option B: Revoke &amp; Delete via Facebook Settings
            </h2>
            <p>
              You can trigger automatic full account deletion directly from your Meta account:
            </p>
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>
                Go to your Facebook <strong>Settings &amp; Privacy</strong> &rarr;{' '}
                <strong>Settings</strong>.
              </li>
              <li>
                Open <strong>Security and Login</strong> (or <strong>Business Integrations</strong>)
                and locate <strong>PagePulse</strong>.
              </li>
              <li>
                Click <strong>Remove</strong> and optionally select{' '}
                <strong>Send Data Deletion Request</strong>.
              </li>
            </ol>
            <p>
              When you remove PagePulse from Facebook, Meta sends a signed callback to our{' '}
              <code className="font-mono text-xs text-slate-900">
                POST /api/auth/facebook/deauthorize
              </code>{' '}
              endpoint. Our server verifies the HMAC-SHA256{' '}
              <code className="font-mono text-xs text-slate-900">signed_request</code> signature,
              deletes your User record, all ConnectedPage tokens, and all PostQueue entries, and
              returns a unique confirmation code linked back to this status page.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Manual Deletion Assistance
            </h2>
            <p>
              If you need confirmation or manual assistance removing an account, email{' '}
              <span className="font-mono text-xs text-slate-900">privacy@pagepulse.app</span> with
              your Facebook User ID or Page ID. Requests are fulfilled within 48 hours.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
