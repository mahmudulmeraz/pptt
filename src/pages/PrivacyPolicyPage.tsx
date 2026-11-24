import { Link } from 'react-router-dom';

export function PrivacyPolicyPage() {
  return (
    <main className="flex-1 bg-white">
      <div className="max-w-3xl mx-auto px-6 py-14 space-y-10">
        <header className="space-y-2 border-b border-slate-200 pb-6">
          <p className="text-xs font-medium text-[#1E40AF]">Legal &amp; Meta Platform Compliance</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
            Privacy Policy
          </h1>
          <p className="text-xs text-slate-500 tabular-nums">
            Effective Date: November 17, 2026 · PagePulse Automated Publishing
          </p>
        </header>

        <div className="space-y-8 text-sm text-slate-700 leading-relaxed">
          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              1. Information We Collect via Meta OAuth
            </h2>
            <p>
              When you authenticate with PagePulse using Facebook Login, we request only the
              information and permissions strictly required to schedule and publish posts to the
              Facebook Pages you explicitly select:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Profile Identifiers:</strong> Your Meta user ID, display name, and email
                address (when provided by Meta) to maintain your PagePulse account.
              </li>
              <li>
                <strong>Facebook Page Metadata:</strong> The Page ID, Page Name, and Page Category
                for each Facebook Page you authorize via{' '}
                <code className="font-mono text-xs text-slate-900">pages_show_list</code> and{' '}
                <code className="font-mono text-xs text-slate-900">business_management</code>.
              </li>
              <li>
                <strong>Page Access Tokens:</strong> Never-expiring Page Access Tokens retrieved
                through <code className="font-mono text-xs text-slate-900">/me/accounts</code> to
                publish authorized posts on your schedule via{' '}
                <code className="font-mono text-xs text-slate-900">pages_manage_posts</code> and
                verify delivery via{' '}
                <code className="font-mono text-xs text-slate-900">pages_read_engagement</code>.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              2. How We Protect &amp; Store Page Access Tokens
            </h2>
            <p>
              All Meta Page Access Tokens are encrypted before persistence using authenticated
              AES-256-GCM encryption with unique initialization vectors. Encrypted tokens are
              decrypted solely in server memory at the moment a scheduled post or user-initiated
              test post is transmitted to the Meta Graph API (v21.0). Page Access Tokens are never
              returned to client browsers, logged in plaintext, or shared with third parties.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              3. How We Use Your Data
            </h2>
            <p>
              Your Facebook data and Page Access Tokens are used exclusively to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Display your connected Facebook Pages inside your private client dashboard.</li>
              <li>Publish queued text and photo posts at the hourly cadence you configure.</li>
              <li>Record delivery status (Published or Failed) and resulting Facebook Post IDs.</li>
            </ul>
            <p>
              We never sell, rent, or use Meta Platform Data for advertising, profiling, or
              cross-client analytics.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              4. Data Retention &amp; Deletion
            </h2>
            <p>
              We retain your account record, connected Page records, and post logs only while your
              Pages remain connected. You may disconnect any Page immediately from the{' '}
              <Link to="/dashboard" className="text-[#1E40AF] hover:underline">
                Client Dashboard
              </Link>{' '}
              or follow the instructions on our{' '}
              <Link to="/data-deletion" className="text-[#1E40AF] hover:underline">
                User Data Deletion
              </Link>{' '}
              page to permanently purge all stored tokens and account records.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              5. Contact Information
            </h2>
            <p>
              For privacy inquiries, Meta Platform compliance verification, or manual deletion
              requests, contact our data protection team at{' '}
              <span className="font-mono text-xs text-slate-900">privacy@pagepulse.app</span>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
