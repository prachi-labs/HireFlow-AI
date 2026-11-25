import React, { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Briefcase,
  CheckSquare,
  FileText,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  PhoneCall,
  Settings,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/jobs', label: 'Job Descriptions', icon: Briefcase },
  { to: '/resumes', label: 'CV Management', icon: FileText },
  { to: '/screening', label: 'AI Screening', icon: Sparkles },
  { to: '/candidates', label: 'Candidates', icon: Users },
  { to: '/interviews', label: 'Interview Center', icon: PhoneCall },
  { to: '/level2', label: 'Level 2 & Email', icon: CheckSquare },
  { to: '/pipeline', label: 'Pipeline Board', icon: GitBranch },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function DashboardLayout({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    apiRequest<{ unreadCount: number }>('/api/notifications')
      .then((d) => setUnreadCount(d.unreadCount || 0))
      .catch(() => {});
  }, [title]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#1A1017] border-r border-white/10 w-64 p-4">
      <Link to="/" className="flex items-center gap-3 px-2 py-2 mb-5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-gradient-to-br from-[#9B395F] to-[#2B0D1A] text-xs font-extrabold text-white shrink-0">
          HF
        </span>
        <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
          HireFlow AI
        </span>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Workspace navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#4B1528] text-white border border-[#C26A8A]/35'
                    : 'text-[#C8B9C0] hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </span>
              {item.to === '/notifications' && unreadCount > 0 && (
                <span className="font-mono-num text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#7B2948] text-white">
                  {unreadCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-white/10 pt-4 mt-4 space-y-3">
        <div className="px-2">
          <p className="text-sm font-semibold text-white truncate">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-xs text-[#8E7E87] truncate">{user?.companyName}</p>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-[#C8B9C0] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#10090D] text-white flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block shrink-0">{sidebarContent}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="relative z-10">{sidebarContent}</div>
          <button
            type="button"
            aria-label="Close navigation drawer"
            onClick={() => setMobileOpen(false)}
            className="flex-1 bg-black/70"
          />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-[#10090D]/90 backdrop-blur-md border-b border-white/10 px-5 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle workspace menu"
              className="lg:hidden p-2 rounded-lg bg-white/5 border border-white/10 text-white cursor-pointer"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white truncate">{title}</h1>
              {subtitle && <p className="text-xs text-[#C8B9C0] truncate mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
        </header>

        <main className="flex-1 p-5 lg:p-8 max-w-[1400px] w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
