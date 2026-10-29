import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  assignOrderCourier,
  fetchBranchAdminOrders,
  fetchBranchCouriers,
  markCashReceived,
  undoOrderStatus,
  updateBranchOrderStatus,
} from "../../services/api";
import { EmptyState, ErrorState, LoadingButton, RefetchBar, SkeletonTable } from "../ui";
import OrderCard from "./OrderCard";
import { ORDER_FILTERS, apiError } from "./panelShared";
import { createRequestGate, isCanceled } from "../../lib/requestGate";

function formatUzDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

function toIsoDate(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value || "").trim());
  if (!match) return "";
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  if (Number.isNaN(date.getTime()) || date.getDate() !== Number(match[1])) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export default function OrdersTab({ branchId, pulse, focus, readOnly = false, onToast, onNewOrders, onReview, onOpen, onOrders }) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [counts, setCounts] = useState({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("urgent");
  const [highlight, setHighlight] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const ready = useRef(false);
  const from = toIsoDate(fromText);
  const to = toIsoDate(toText);
  const rangeError = fromText.trim() && toText.trim() && from && to && from > to;
  const filters = useRef({ query, from, to, status, sort });
  const requestGate = useRef(createRequestGate());
  filters.current = { query, from, to, status, sort };

  useEffect(() => {
    if (!branchId || readOnly) return undefined;
    let active = true;
    fetchBranchCouriers()
      .then((list) => {
        if (active) setCouriers(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [branchId, readOnly, pulse]);

  useEffect(() => {
    if (!focus) return;
    setStatus(focus.status ?? "");
    setFromText(focus.from || "");
    setToText(focus.to || "");
    setSort(focus.sort || "urgent");
  }, [focus]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!branchId || rangeError) return undefined;
    let active = true;
    const requestId = requestGate.current.next();
    setError("");
    if (orders.length === 0) setLoading(true);
    else setIsRefetching(true);
    fetchBranchAdminOrders(branchId, { search: query, from, to, status, sort, page: 1, limit: 20 })
      .then((data) => {
        if (!active || !requestGate.current.isLatest(requestId)) return;
        setOrders(data.orders);
        onOrders?.(data.orders);
        setCounts(data.counts || {});
        setPage(1);
        setHasMore(data.hasMore);
        setError("");
        ready.current = true;
      })
      .catch((err) => {
        if (!active || isCanceled(err) || !requestGate.current.isLatest(requestId)) return;
        setError(apiError(err, t("panel.loadFailed", "Ro'yxat yuklanmadi")));
        onToast(apiError(err, t("panel.loadFailed", "Ro'yxat yuklanmadi")));
      })
      .finally(() => {
        if (active && requestGate.current.isLatest(requestId)) {
          setLoading(false);
          setIsRefetching(false);
        }
      });
    return () => {
      active = false;
    };
  }, [branchId, query, from, to, status, sort]);

  useEffect(() => {
    if (!pulse || !branchId || !ready.current) return undefined;
    let active = true;
    const currentFilters = filters.current;
    fetchBranchAdminOrders(branchId, {
      search: currentFilters.query,
      from: currentFilters.from,
      to: currentFilters.to,
      status: currentFilters.status,
      sort: currentFilters.sort,
      page: 1,
      limit: 20,
    })
      .then((data) => {
        if (!active) return;
        setOrders((current) => {
          const freshIds = data.orders.filter((order) => !current.some((item) => item.id === order.id)).map((order) => order.id);
          if (freshIds.length) {
            setHighlight(freshIds);
            onNewOrders?.(data.orders.filter((order) => freshIds.includes(order.id)));
            setTimeout(() => setHighlight([]), 8000);
          }
          return data.orders;
        });
        setCounts(data.counts || {});
        setPage(1);
        setHasMore(data.hasMore);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pulse, branchId]);

  async function loadMore() {
    if (loadingMore) return;
    const next = page + 1;
    setLoadingMore(true);
    try {
      const data = await fetchBranchAdminOrders(branchId, { search: query, from, to, status, sort, page: next, limit: 20 });
      setOrders((current) => {
        const known = new Set(current.map((order) => order.id));
        return [...current, ...data.orders.filter((order) => !known.has(order.id))];
      });
      setPage(next);
      setHasMore(data.hasMore);
    } catch (err) {
      onToast(apiError(err, t("panel.loadFailed", "Ro'yxat yuklanmadi")));
    } finally {
      setLoadingMore(false);
    }
  }

  async function changeStatus(order, payload) {
    if (readOnly) return;
    setBusyId(order.id);
    try {
      const updated = await updateBranchOrderStatus(order.id, payload);
      setOrders((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      onToast(t("panel.saved", "Saqlandi"));
    } catch (error) {
      onToast(apiError(error, t("panel.actionFailed", "Amal bajarilmadi")));
    } finally {
      setBusyId("");
    }
  }

  async function cash(order) {
    if (readOnly) return;
    setBusyId(order.id);
    try {
      const updated = await markCashReceived(order.id);
      setOrders((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      onToast("Naqd to'lov qabul qilindi");
    } catch (error) {
      onToast(apiError(error, t("panel.actionFailed", "Amal bajarilmadi")));
    } finally {
      setBusyId("");
    }
  }

  async function assign(order, courierId) {
    if (readOnly) return;
    setBusyId(order.id);
    try {
      const updated = await assignOrderCourier(order.id, courierId);
      setOrders((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      onToast(t("courier.panel.saved"));
    } catch (error) {
      onToast(apiError(error, t("panel.actionFailed", "Amal bajarilmadi")));
    } finally {
      setBusyId("");
    }
  }

  async function undo(order) {
    if (readOnly) return;
    setBusyId(order.id);
    try {
      const updated = await undoOrderStatus(order.id);
      setOrders((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      onToast(t("panel.undone", "Oxirgi o'zgarish qaytarildi"));
    } catch (error) {
      onToast(apiError(error, t("panel.actionFailed", "Amal bajarilmadi")));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="grid gap-3">
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("panel.searchOrders", "Raqam, telefon yoki ism")}
          className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
        />
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Dan
          <input value={fromText} onChange={(event) => setFromText(event.target.value)} placeholder="kk.oo.yyyy" inputMode="numeric" className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-900" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          Gacha
          <input value={toText} onChange={(event) => setToText(event.target.value)} placeholder="kk.oo.yyyy" inputMode="numeric" className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-900" />
        </label>
        <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm">
          <option value="urgent">{t("panel.sortUrgent", "Shoshilinch")}</option>
          <option value="newest">{t("panel.sortNew", "Eng yangi")}</option>
          <option value="oldest">{t("panel.sortOld", "Eng eski")}</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["Bugun", 0],
          ["Kecha", 1],
          ["7 kun", 6],
        ].map(([label, days]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              const end = new Date();
              const start = new Date();
              start.setDate(end.getDate() - days);
              if (days === 1) end.setDate(end.getDate() - 1);
              setFromText(formatUzDate(start));
              setToText(formatUzDate(days === 1 ? end : new Date()));
            }}
            className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700"
          >
            {label}
          </button>
        ))}
      </div>
      {rangeError && <p className="text-sm text-red-600">Sana oralig'i noto'g'ri: Dan sanasi Gacha sanasidan keyin</p>}
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-wrap xl:overflow-visible">
        {ORDER_FILTERS.map(([id, key, fallback]) => {
          const countKey = id || "all";
          const count = counts[countKey];
          return (
            <button
              key={id || "all"}
              type="button"
              onClick={() => setStatus(id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${status === id ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
            >
              {t(key, fallback)}{count != null ? ` ${count}` : ""}
            </button>
          );
        })}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-canvas to-transparent xl:hidden" />
      </div>
      {loading && orders.length === 0 && <SkeletonTable rows={4} />}
      {!loading && error && orders.length === 0 && (
        <ErrorState title={error} onRetry={() => {
          setError("");
          setLoading(true);
          fetchBranchAdminOrders(branchId, { search: query, from, to, status, sort, page: 1, limit: 20 })
            .then((data) => {
              setOrders(data.orders);
              onOrders?.(data.orders);
              setCounts(data.counts || {});
              setPage(1);
              setHasMore(data.hasMore);
              setError("");
            })
            .catch((err) => setError(apiError(err, t("panel.loadFailed", "Ro'yxat yuklanmadi"))))
            .finally(() => setLoading(false));
        }} />
      )}
      {!loading && !error && orders.length === 0 && (
        <EmptyState
          title="Bu filtr bo'yicha buyurtma topilmadi"
          actionLabel="Filtrlarni tozalash"
          onAction={() => {
            setStatus("");
            setSearch("");
            setQuery("");
            setFromText("");
            setToText("");
          }}
        />
      )}
      <div className="relative grid gap-3">
        <RefetchBar show={isRefetching} />
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            highlight={highlight.includes(order.id)}
            busy={busyId === order.id}
            readOnly={readOnly}
            onOpen={onOpen}
            onReview={onReview}
            onStatus={changeStatus}
            onUndo={undo}
            onCash={cash}
            couriers={couriers}
            onAssign={assign}
          />
        ))}
      </div>
      {hasMore && (
        <LoadingButton
          type="button"
          loading={loadingMore}
          loadingText={t("common.loading")}
          onClick={loadMore}
          className="h-11 rounded-xl border border-slate-200 text-sm font-bold disabled:opacity-50"
        >
          {t("panel.loadMore", "Yana yuklash")}
        </LoadingButton>
      )}
    </section>
  );
}
