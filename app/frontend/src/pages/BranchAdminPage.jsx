import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import OrderDetailDrawer from "../components/branch-admin/OrderDetailDrawer";
import OrdersTab from "../components/branch-admin/OrdersTab";
import PanelHeader from "../components/branch-admin/PanelHeader";
import PrescriptionReviewModal from "../components/branch-admin/PrescriptionReviewModal";
import StaffLogin from "../components/branch-admin/StaffLogin";
import PasswordChangeForm from "../components/auth/PasswordChangeForm";
import StatsTab from "../components/branch-admin/StatsTab";
import StockTab from "../components/branch-admin/StockTab";
import { PanelToast, apiError, beep } from "../components/branch-admin/panelShared";
import { fetchBranches, fetchPanelSummary, setBranchOpen, verifyPrescription } from "../services/api";
import { useBranchStore } from "../store/useBranchStore";
import { useAdminAuth, usePharmacistAuth } from "../store/useAuthStore";

export default function BranchAdminPage() {
  const { t } = useTranslation();
  const pharmacistUser = usePharmacistAuth((state) => state.user);
  const pharmacistToken = usePharmacistAuth((state) => state.token);
  const pharmacistLogout = usePharmacistAuth((state) => state.logout);
  const adminUser = useAdminAuth((state) => state.user);
  const adminToken = useAdminAuth((state) => state.token);
  const adminLogout = useAdminAuth((state) => state.logout);

  const isPharmacist = pharmacistUser?.role === "BRANCH_ADMIN" && Boolean(pharmacistToken);
  const isSuperViewer = !isPharmacist && adminUser?.role === "SUPER_ADMIN" && Boolean(adminToken);
  const user = isPharmacist ? pharmacistUser : isSuperViewer ? adminUser : pharmacistUser;
  const token = isPharmacist ? pharmacistToken : isSuperViewer ? adminToken : pharmacistToken;
  const logout = isPharmacist ? pharmacistLogout : isSuperViewer ? adminLogout : pharmacistLogout;
  const readOnly = Boolean(isSuperViewer);

  const customerBranch = useBranchStore((state) => state.branch);
  const [tab, setTab] = useState(() => sessionStorage.getItem("vita24-ph-tab") || "orders");
  const [toast, setToast] = useState("");
  const [summary, setSummary] = useState(null);
  const [branch, setBranch] = useState(null);
  const [branches, setBranches] = useState([]);
  const [sound, setSound] = useState(() => localStorage.getItem("vita24-pharmacist-sound") !== "0");
  const [pulse, setPulse] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [openBusy, setOpenBusy] = useState(false);
  const [review, setReview] = useState(null);
  const [reviewOrders, setReviewOrders] = useState([]);
  const [drawerId, setDrawerId] = useState("");
  const [busyReview, setBusyReview] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [link, setLink] = useState("retrying");
  const [focus, setFocus] = useState(null);
  const [stockFocus, setStockFocus] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const toastTimer = useRef(null);

  const branchId = isPharmacist ? user?.branchId : branch?.id;

  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }

  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    sessionStorage.setItem("vita24-ph-tab", tab);
    setToast("");
  }, [tab]);
  useEffect(() => {
    if (!localStorage.getItem("vita24-shift-start")) {
      localStorage.setItem("vita24-shift-start", new Date().toISOString());
    }
  }, [token]);
  useEffect(() => {
    document.title = unseen > 0 ? `(${unseen}) Vita24 Farmatsevt` : "Vita24 Farmatsevt";
    return () => {
      document.title = "Vita24";
    };
  }, [unseen]);

  useEffect(() => {
    if (!isSuperViewer) return undefined;
    fetchBranches()
      .then((list) => {
        setBranches(list || []);
        setBranch((current) => current || (list || []).find((item) => item.id === customerBranch?.id) || list?.[0] || null);
      })
      .catch(() => {});
    return undefined;
  }, [isSuperViewer]);

  useEffect(() => {
    if (!token || !branchId) return undefined;
    let active = true;
    fetchPanelSummary(branchId)
      .then((data) => {
        if (!active) return;
        setSummary(data);
        if (isPharmacist) setBranch(data.branch);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token, branchId, pulse, isPharmacist]);

  useEffect(() => {
    if (!token || !branchId) return undefined;
    let stopped = false;
    let delay = 1000;
    let controller = new AbortController();
    let reconnects = 0;
    async function stream() {
      controller = new AbortController();
      try {
        const apiBase = String(import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
        const response = await fetch(`${apiBase}/branch-admin/events?branchId=${encodeURIComponent(branchId)}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error("stream");
        setLink("live");
        if (reconnects > 0) setPulse((value) => value + 1);
        delay = 1000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          if (parts.some((part) => /event:\s*(order(?:\.updated)?|branch)/.test(part))) setPulse((value) => value + 1);
        }
        if (!stopped) throw new Error("ended");
      } catch {
        if (stopped) return;
        setLink("retrying");
        reconnects += 1;
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 30000);
        if (!stopped) stream();
      }
    }
    stream();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [token, branchId]);

  function onNewOrders(orders) {
    setUnseen((count) => count + orders.length);
    if (sound) beep();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      orders.forEach((order) => {
        new Notification(t("panel.newOrder", "Yangi buyurtma"), { body: order.orderNumber });
      });
    }
  }

  async function toggleSound() {
    const next = !sound;
    setSound(next);
    localStorage.setItem("vita24-pharmacist-sound", next ? "1" : "0");
    if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }

  function askToggleOpen() {
    if (readOnly || !branch) return;
    if (branch.isOpen !== false) {
      setConfirmClose(true);
      return;
    }
    toggleOpen();
  }

  async function toggleOpen() {
    if (readOnly || !branch) return;
    setConfirmClose(false);
    setOpenBusy(true);
    try {
      const updated = await setBranchOpen(branch.id, branch.isOpen === false);
      setBranch(updated);
      showToast(updated.isOpen ? t("panel.opened", "Filial ochiq") : t("panel.nowClosed", "Filial yopiq"));
    } catch (error) {
      showToast(apiError(error, t("panel.actionFailed", "Amal bajarilmadi")));
    } finally {
      setOpenBusy(false);
    }
  }

  async function approve(order) {
    if (readOnly) return;
    setBusyReview(true);
    try {
      await verifyPrescription(order.id, { action: "APPROVE" });
      showToast("Retsept tasdiqlandi");
      setReview(null);
      setPulse((value) => value + 1);
    } catch (error) {
      showToast(apiError(error, t("panel.actionFailed", "Amal bajarilmadi")));
    } finally {
      setBusyReview(false);
    }
  }

  async function reject(order, payload) {
    if (readOnly) return;
    setBusyReview(true);
    try {
      await verifyPrescription(order.id, { action: "REJECT", rejectReasons: payload.rejectReasons, rejectNote: payload.rejectNote });
      showToast(t("panel.rejected", "Retsept rad etilgan"));
      setReview(null);
      setPulse((value) => value + 1);
    } catch (error) {
      showToast(apiError(error, t("panel.actionFailed", "Amal bajarilmadi")));
    } finally {
      setBusyReview(false);
    }
  }

  const isStaff = Boolean(token && (isPharmacist || isSuperViewer));
  if (!isStaff) return <StaffLogin />;
  if (isPharmacist && user?.mustChangePassword) {
    return (
      <PasswordChangeForm
        audience="pharmacist"
        onChanged={(session) =>
          usePharmacistAuth.getState().setSession(session?.user || { ...user, mustChangePassword: false }, session?.token, {
            refreshToken: session?.refreshToken,
          })
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      {readOnly && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Filialni ko'rish (faqat ko'rish)
        </div>
      )}
      {branch?.isOpen === false && !readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white">
          <span>Filial yopiq. Mijozlar buyurtma bera olmaydi.</span>
          <button type="button" onClick={toggleOpen} disabled={openBusy} className="h-9 rounded-xl bg-white px-3 text-sm font-bold text-red-700">Ochish</button>
        </div>
      )}
      {branch?.isOpen === false && readOnly && (
        <div className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white">
          Filial yopiq. Mijozlar buyurtma bera olmaydi.
        </div>
      )}
      <PanelHeader
        summary={summary}
        tab={tab}
        readOnly={readOnly}
        onTab={(next) => {
          setTab(next);
          if (next === "orders") setUnseen(0);
        }}
        sound={sound}
        onSound={toggleSound}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          setPulse((value) => value + 1);
          setTimeout(() => setRefreshing(false), 600);
        }}
        onLogout={logout}
        branch={branch}
        branches={isSuperViewer ? branches : []}
        onBranch={(id) => setBranch(branches.find((item) => item.id === id) || null)}
        onToggleOpen={askToggleOpen}
        openBusy={openBusy}
        link={link}
        onOpenQueue={() => {
          setTab("orders");
          setFocus({ status: "review", at: Date.now() });
        }}
        onOpenToday={() => {
          const now = new Date();
          const day = String(now.getDate()).padStart(2, "0");
          const month = String(now.getMonth() + 1).padStart(2, "0");
          const text = `${day}.${month}.${now.getFullYear()}`;
          setTab("orders");
          setFocus({ status: "", from: text, to: text, at: Date.now() });
        }}
        onOpenLowStock={() => {
          setTab("stock");
          setStockFocus(`low-${Date.now()}`);
        }}
      />
      {confirmClose && !readOnly && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={() => setConfirmClose(false)}>
          <div className="grid max-w-sm gap-3 rounded-2xl bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <p className="text-sm">Filialni yopsangiz, mijozlar buyurtma bera olmaydi</p>
            <div className="flex gap-2">
              <button type="button" onClick={toggleOpen} className="h-10 rounded-xl bg-red-600 px-3 text-sm font-bold text-white">Yopish</button>
              <button type="button" onClick={() => setConfirmClose(false)} className="h-10 rounded-xl px-3 text-sm">Bekor</button>
            </div>
          </div>
        </div>
      )}
      {tab === "orders" && (
        <OrdersTab
          branchId={branchId}
          pulse={pulse}
          focus={focus}
          readOnly={readOnly}
          onToast={showToast}
          onNewOrders={onNewOrders}
          onOrders={setReviewOrders}
          onReview={(order) => {
            setReview(order);
            setUnseen(0);
          }}
          onOpen={(order) => setDrawerId(order.id)}
        />
      )}
      {tab === "stock" && (
        <StockTab
          branch={branch || summary?.branch}
          branchId={branchId}
          focus={stockFocus}
          readOnly={readOnly}
          onToast={showToast}
          onBranch={setBranch}
        />
      )}
      {tab === "stats" && <StatsTab branchId={branchId} onToast={showToast} />}
      {review && (
        <PrescriptionReviewModal
          order={review}
          orders={reviewOrders.length ? reviewOrders : [review]}
          busy={busyReview}
          readOnly={readOnly}
          onClose={() => setReview(null)}
          onApprove={approve}
          onReject={reject}
          onSelect={setReview}
        />
      )}
      <OrderDetailDrawer orderId={drawerId} readOnly={readOnly} onClose={() => setDrawerId("")} onToast={showToast} />
      <PanelToast message={toast} />
    </div>
  );
}
