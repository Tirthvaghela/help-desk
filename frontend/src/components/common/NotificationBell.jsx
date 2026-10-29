import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { useAuth } from "../../auth/useAuth.js";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationLink,
} from "../../api/notifications.js";
import { formatShortTime } from "../staff/staffFormat.js";

const POLL_MS = 60_000;
const PANEL_WIDTH = 340;
const PHONE_MAX = 640;
const PAGE_SIZE = 10;

// Bell with unread count and a dropdown of the signed-in user's notifications.
// The count is polled once a minute while the tab is visible; the list loads when opened.
// `buttonClassName` lets each header keep its own look.
export default function NotificationBell({ buttonClassName = "", panelClassName = "" }) {
  const navigate = useNavigate();
  const { user, token, endSessionIfRejected } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [list, setList] = useState({ status: "idle", items: [], total: 0, error: null });
  const [busy, setBusy] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [position, setPosition] = useState(null);

  const handleError = useCallback((error) => !endSessionIfRejected(error), [endSessionIfRejected]);
  // The token in use now. Answers to requests sent with an older one (before a password
  // change or new sign-in) are dropped, so they cannot overwrite the newer session's list.
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Unread count: on mount, every minute while visible, and when the tab becomes visible.
  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      getUnreadCount(token).then(
        (count) => active && setUnread(count),
        (error) => active && handleError(error),
      );
    };
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [token, handleError]);

  const loadList = useCallback(async () => {
    setList((previous) => ({ ...previous, status: "loading", error: null }));
    try {
      const result = await listNotifications(token, { limit: PAGE_SIZE });
      if (tokenRef.current !== token) return;
      setList({ status: "ready", items: result.notifications, total: result.total, error: null });
      setUnread(result.unreadCount);
    } catch (error) {
      if (handleError(error) && tokenRef.current === token) setList((previous) => ({ ...previous, status: "error", error }));
    }
  }, [token, handleError]);

  const toggle = () => {
    setOpen((previous) => {
      if (!previous) loadList();
      return !previous;
    });
  };

  // Close on Escape (focus back to the bell) or a click outside.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (event) => {
      if (!containerRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function openNotification(notification) {
    const link = notificationLink(notification, user?.role);
    if (!notification.readAt) {
      try {
        const result = await markNotificationRead(token, notification.id);
        if (tokenRef.current !== token) return;
        setUnread(result.unreadCount);
        setList((previous) => ({
          ...previous,
          items: previous.items.map((item) => (item.id === notification.id ? result.notification : item)),
        }));
      } catch (error) {
        if (!handleError(error)) return;
      }
    }
    if (link) {
      setOpen(false);
      navigate(link);
    }
  }

  async function markAll() {
    if (busy) return;
    setBusy(true);
    try {
      await markAllNotificationsRead(token);
      if (tokenRef.current !== token) return;
      setUnread(0);
      const now = new Date().toISOString();
      setList((previous) => ({ ...previous, items: previous.items.map((item) => ({ ...item, readAt: item.readAt ?? now })) }));
    } catch (error) {
      if (handleError(error)) setList((previous) => ({ ...previous, error }));
    } finally {
      setBusy(false);
    }
  }

  // The panel is rendered at the end of <body> (a portal) and placed from the bell's position,
  // because headers with blur effects would otherwise squeeze a fixed panel into themselves.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const top = Math.round(rect.bottom + 8);
      if (window.innerWidth < PHONE_MAX) setPosition({ top, left: 16, right: 16 });
      else setPosition({ top, right: Math.max(16, Math.round(window.innerWidth - rect.right)), width: PANEL_WIDTH });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={toggle}
        className={`relative flex items-center justify-center ${buttonClassName}`}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#d9534f] px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && position && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          style={{ position: "fixed", ...position }}
          className={`z-[60] rounded-[20px] border border-white/80 bg-white/95 p-4 text-left shadow-xl backdrop-blur-xl ${panelClassName}`}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[#1c302b]">Notifications</h3>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={busy}
                className="rounded-md text-[12px] font-semibold text-[#168461] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40 disabled:opacity-60"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="mt-3 max-h-[60vh] overflow-y-auto" aria-busy={list.status === "loading"}>
            {list.status === "loading" && list.items.length === 0 && (
              <p role="status" className="py-4 text-sm text-[#687c75]">Loading…</p>
            )}
            {list.status === "error" && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-700">
                Notifications could not be loaded.{" "}
                <button type="button" onClick={loadList} className="font-semibold underline">Try again</button>
              </p>
            )}
            {list.status === "ready" && list.items.length === 0 && (
              <p className="py-4 text-sm text-[#687c75]">You're all caught up. No notifications yet.</p>
            )}
            {list.items.length > 0 && (
              <ul className="space-y-1">
                {list.items.map((notification) => {
                  const link = notificationLink(notification, user?.role);
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => openNotification(notification)}
                        className={`w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-[#edf7f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168461]/40 ${notification.readAt ? "" : "bg-[#f1f9f4]"}`}
                      >
                        <span className="flex items-start gap-2">
                          <span
                            aria-hidden="true"
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? "bg-transparent" : "bg-[#168461]"}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-[#1c302b]">
                              {notification.title}
                              {!notification.readAt && <span className="sr-only"> (unread)</span>}
                            </span>
                            <span className="mt-0.5 block break-words text-[12px] leading-relaxed text-[#4f655d]">{notification.message}</span>
                            <span className="mt-1 block text-[11px] text-[#8a9d92]">
                              {formatShortTime(notification.createdAt)}
                              {!link && notification.ticket === null && " · ticket no longer available to you"}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {list.status === "ready" && list.total > list.items.length && (
              <p className="mt-2 text-center text-[11px] text-[#8a9d92]">Showing the latest {list.items.length} of {list.total}.</p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
