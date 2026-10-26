import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { formatDateTime } from "../../lib/format";
import { fetchNotifications, markNotificationsRead } from "../../services/api";
import { SkeletonPulse } from "../ui";
import { useAuthStore } from "../../store/useAuthStore";

export default function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const role = useAuthStore((state) => state.user?.role);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const boxRef = useRef(null);
  const customer = Boolean(token && role === "CUSTOMER");

  useEffect(() => {
    if (!customer) return undefined;
    let active = true;
    const load = () => {
      fetchNotifications()
        .then((data) => {
          if (!active || !data) return;
          setItems(data.items || []);
          setUnread(Number(data.unread) || 0);
          setError("");
        })
        .catch(() => {
          if (active) setError(t("error.generic"));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    load();
    const timer = setInterval(load, 20000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [customer]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!customer) return null;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      try {
        const data = await markNotificationsRead();
        setUnread(Number(data?.unread) || 0);
        setItems((current) => current.map((item) => ({ ...item, read: true })));
      } catch {
        /* badge stays until the next poll */
      }
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={t("notifications.title")}
        className="relative grid h-11 w-11 place-items-center rounded-xl text-[#087b51] hover:bg-slate-50"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <b className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#087b51] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </b>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-[calc(7.5rem+var(--tg-safe-top,env(safe-area-inset-top,0px)))] z-40 max-h-[70dvh] overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-lg md:absolute md:inset-x-auto md:right-0 md:top-[calc(100%+6px)] md:max-h-80 md:w-80">
          <p className="border-b border-slate-100 px-3 py-2 text-sm font-extrabold text-slate-900">
            {t("notifications.title")}
          </p>
          {loading ? (
            <div className="grid gap-2 px-3 py-3">
              <SkeletonPulse className="h-10 w-full" />
              <SkeletonPulse className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="px-3 py-4 text-sm text-red-600">{error}</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">{t("notifications.empty")}</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="block w-full border-b border-slate-50 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50"
                    onClick={() => {
                      setOpen(false);
                      if (item.orderId) navigate(`/orders/${item.orderId}`);
                    }}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                    {(item.body || item.orderNumber) && (
                      <span className="mt-0.5 block text-xs text-slate-600">
                        {item.body || item.orderNumber}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-slate-500">{formatDateTime(item.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
