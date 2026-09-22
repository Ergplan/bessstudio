'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useSession } from '../../platform/auth';
import { useWorkspace } from '../../platform/workspace';
import { repository } from '../../platform/repo';
import { notificationsFor, unreadCount } from '../../platform/notifications';
import { nowIso } from '../../platform/types';

/**
 * The notification bell.
 *
 * Items are derived from the records already being watched (see `platform/notifications.ts`), so
 * opening this costs nothing and the list cannot be out of date. Only the last-seen timestamp is
 * written, and only when the panel is actually opened.
 */
export function Notifications() {
  const { org, user, role } = useSession();
  const { quotes } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!org || !user) return;
    let live = true;
    void repository().listMembers(org.id)
      .then(ms => { if (live) setSeenAt(ms.find(m => m.uid === user.uid)?.notificationsSeenAt ?? null); })
      .catch(() => { /* an unreadable member list simply means everything reads as unread */ });
    return () => { live = false; };
  }, [org, user]);

  const items = useMemo(
    () => (user ? notificationsFor(quotes, role, user.uid, seenAt) : []),
    [quotes, role, user, seenAt],
  );
  const unread = unreadCount(items);

  // Opening the panel is what marks things seen — not hovering, and not merely being on a page.
  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (!next || !org || !user || !unread) return;
    const at = nowIso();
    setSeenAt(at);
    try {
      const members = await repository().listMembers(org.id);
      const me = members.find(m => m.uid === user.uid);
      if (me) await repository().saveMember(org.id, { ...me, notificationsSeenAt: at });
    } catch { /* the badge clears for this session either way; it is not worth an error */ }
  }, [open, org, user, unread]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!user) return null;

  return (
    <div className="notif" ref={panel}>
      <button className="btn ghost sm notif-bell" onClick={() => void toggle()}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open}>
        <Bell size={15} />
        {unread > 0 && <i className="notif-dot">{unread > 9 ? '9+' : unread}</i>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head"><span className="label">Notifications</span></div>
          {items.length ? items.slice(0, 12).map(n => (
            <Link key={n.id} href={n.href} className={n.unread ? 'notif-item unread' : 'notif-item'} onClick={() => setOpen(false)}>
              <b>{n.title}</b>
              <span>{n.detail}</span>
            </Link>
          )) : <p className="notif-empty muted">Nothing needs your attention.</p>}
        </div>
      )}
    </div>
  );
}
