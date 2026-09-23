import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { logout } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { displayName } from '../lib/name';

const HOME_ROUTE_BY_ROLE: Record<string, string> = {
  STUDENT: '/student',
  TEACHER: '/teacher',
  ADMIN: '/admin',
};

export function DashboardLayout({ title, children }: { title: string; children: ReactNode }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const userDisplayName = user ? displayName(user.nameEn, user.nameAr, user.username) : undefined;
  const homeRoute = user ? HOME_ROUTE_BY_ROLE[user.role] : undefined;

  async function handleLogout() {
    await logout();
    setUser(null);
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          {homeRoute && (
            <Link
              to={homeRoute}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              aria-label="Home"
              title="Home"
            >
              Home
            </Link>
          )}
          <h1 dir="auto" className="text-lg font-semibold text-gray-900">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span dir="auto" className="text-sm text-gray-600">
            {userDisplayName}
          </span>
          <button
            onClick={handleLogout}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
