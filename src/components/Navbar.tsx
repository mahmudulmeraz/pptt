import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MetaConnectButton } from './MetaConnectButton';
import type { AuthUser } from '../types';

interface NavbarProps {
  user: AuthUser | null;
  onAuthSuccess?: () => void;
}

export function Navbar({ user, onAuthSuccess }: NavbarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleConnected = () => {
    if (onAuthSuccess) {
      onAuthSuccess();
    }
    navigate('/dashboard');
  };

  return (
    <header className="w-full bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <Link
          to="/"
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] rounded"
        >
          PagePulse
        </Link>

        {/* Zone 2: 4 clean single-line navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <Link
            to="/#workflow"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Architecture
          </Link>
          <Link
            to="/dashboard"
            className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              location.pathname === '/dashboard' ? 'text-slate-900 underline' : ''
            }`}
          >
            Dashboard
          </Link>
          <Link
            to="/privacy-policy"
            className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              location.pathname === '/privacy-policy' ? 'text-slate-900 underline' : ''
            }`}
          >
            Privacy Policy
          </Link>
          <Link
            to="/data-deletion"
            className={`hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              location.pathname === '/data-deletion' ? 'text-slate-900 underline' : ''
            }`}
          >
            Data Deletion
          </Link>
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center shrink-0">
          {user ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg bg-[#1E40AF] text-white hover:bg-[#1D4ED8] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2"
            >
              Open Dashboard
            </Link>
          ) : (
            <MetaConnectButton
              label="Connect Facebook"
              variant="compact"
              onSuccess={handleConnected}
            />
          )}
        </div>
      </div>
    </header>
  );
}
