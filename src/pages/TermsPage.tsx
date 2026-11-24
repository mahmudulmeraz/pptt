import { Link } from 'react-router-dom';

export function TermsPage() {
  return (
    <main className="flex-1 bg-white">
      <div className="max-w-3xl mx-auto px-6 py-14 space-y-10">
        <header className="space-y-2 border-b border-slate-200 pb-6">
          <p className="text-xs font-medium text-[#1E40AF]">Legal &amp; Service Agreement</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
            Terms of Service
          </h1>
          <p className="text-xs text-slate-500 tabular-nums">
            Last Updated: November 17, 2026 · PagePulse Automated Publishing
          </p>
        </header>

        <div className="space-y-8 text-sm text-slate-700 leading-relaxed">
          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              1. Acceptance of Terms
            </h2>
            <p>
              By connecting a Facebook Page to PagePulse, you agree to these Terms of Service and
              confirm that you hold administrative or publishing authority over every Facebook Page
              you authorize.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              2. Meta Platform Compliance &amp; Content Responsibility
            </h2>
            <p>
              All automated and test posts published through PagePulse must comply with the Meta
              Community Standards, Meta Platform Terms, and applicable laws. You remain solely
              responsible for the text, image URLs, and publishing frequency configured for your
              connected Pages.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              3. Authorization &amp; Revocation
            </h2>
            <p>
              PagePulse accesses your Facebook Pages strictly via official Meta OAuth v21.0
              permissions. You may pause automated publishing, disconnect individual Pages, or
              revoke PagePulse inside your Facebook Business Integrations settings at any time.
              Disconnecting a Page immediately deletes its encrypted Page Access Token from our
              database.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              4. Service Availability
            </h2>
            <p>
              Automated publishing depends on Meta Graph API availability and valid Page
              permissions. If Meta invalidates a token or rejects a post payload, PagePulse logs the
              exact Graph API error message in your dashboard without modifying your Page content.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              5. Related Policies
            </h2>
            <p>
              Please review our{' '}
              <Link to="/privacy-policy" className="text-[#1E40AF] hover:underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link to="/data-deletion" className="text-[#1E40AF] hover:underline">
                User Data Deletion
              </Link>{' '}
              instructions for details on how your data is handled and removed.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
