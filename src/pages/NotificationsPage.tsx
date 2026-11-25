import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { apiRequest } from '../lib/api';

interface NotifItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string;
  is_read: number;
  created_at: string;
}

export function NotificationsPage() {
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = async () => {
    const d = await apiRequest<{ notifications: NotifItem[]; unreadCount: number }>(
      '/api/notifications'
    );
    setItems(d.notifications);
    setUnreadCount(d.unreadCount);
  };

  useEffect(() => {
    void load();
  }, []);

  const markRead = async (id: string) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
    await load();
  };

  return (
    <DashboardLayout
      title="Notifications"
      subtitle={`${unreadCount} unread alert(s) across CV parsing, screening, interviews, and Level 2 emails`}
      actions={
        unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void markRead('all')}
            className="px-4 py-2 rounded-xl border border-white/15 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark All Read
          </button>
        )
      }
    >
      <div className="glass-panel rounded-2xl divide-y divide-white/8">
        {items.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Bell className="w-8 h-8 text-[#8E7E87] mx-auto" />
            <p className="text-sm text-[#8E7E87]">No notifications yet.</p>
          </div>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={`p-5 flex flex-wrap items-center justify-between gap-4 ${
                n.is_read === 0 ? 'bg-[#4B1528]/20' : ''
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-bold text-white">{n.title}</span>
                  {n.is_read === 0 && (
                    <span className="text-[11px] font-semibold text-[#E69AB5]">Unread</span>
                  )}
                </div>
                <p className="text-xs text-[#C8B9C0]">{n.message}</p>
                <p className="font-mono-num text-[11px] text-[#8E7E87]">{n.created_at}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={n.link}
                  onClick={() => {
                    if (n.is_read === 0) void markRead(n.id);
                  }}
                  className="px-3.5 py-1.5 rounded-lg burgundy-cta text-xs font-semibold text-white"
                >
                  Open
                </Link>
                {n.is_read === 0 && (
                  <button
                    type="button"
                    onClick={() => void markRead(n.id)}
                    className="px-3 py-1.5 rounded-lg border border-white/12 text-xs text-[#C8B9C0] hover:text-white cursor-pointer"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardLayout>
  );
}
