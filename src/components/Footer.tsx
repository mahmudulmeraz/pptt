import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="w-full border-t border-slate-200 bg-white mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1">
          <p className="font-display text-sm font-bold text-slate-900">PagePulse</p>
          <p className="text-xs text-slate-500">
            Automated Facebook Page publishing via Meta Graph API v21.0
          </p>
        </div>

        <nav aria-label="Legal and Compliance" className="flex flex-wrap items-center gap-6 text-xs text-slate-600">
          <Link to="/privacy-policy" className="hover:text-slate-900 hover:underline underline-offset-4">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-slate-900 hover:underline underline-offset-4">
            Terms of Service
          </Link>
          <Link to="/data-deletion" className="hover:text-slate-900 hover:underline underline-offset-4">
            User Data Deletion
          </Link>
          <Link to="/dashboard" className="hover:text-slate-900 hover:underline underline-offset-4">
            Client Dashboard
          </Link>
        </nav>

        <p className="text-xs text-slate-500 tabular-nums">
          © {new Date().getFullYear()} PagePulse. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
