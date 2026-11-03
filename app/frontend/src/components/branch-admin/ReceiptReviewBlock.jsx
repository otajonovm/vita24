import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime, formatSom } from "../../lib/format";
import { approveOrderReceipt, loadReceiptObjectUrl, rejectOrderReceipt } from "../../services/api";
import { ErrorState, LoadingButton, SkeletonLines } from "../ui";
import useLockBodyScroll from "../../hooks/useLockBodyScroll";
import { RECEIPT_REJECT_REASONS, apiError } from "./panelShared";

function Preview({ receiptId, fileName }) {
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useLockBodyScroll(open);

  useEffect(() => {
    if (!receiptId) return undefined;
    let active = true;
    let objectUrl = "";
    loadReceiptObjectUrl(receiptId, "branch")
      .then((next) => {
        if (!active) {
          URL.revokeObjectURL(next.url);
          return;
        }
        objectUrl = next.url;
        setFile(next);
      })
      .catch(() => {
        if (active) setError(t("order.receipt.failed"));
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [receiptId, t]);

  if (!receiptId) return null;
  if (error) return <ErrorState title={error} />;
  if (!file) return <SkeletonLines rows={3} />;

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        {file.type.includes("pdf") ? (
          <iframe title={fileName} src={file.url} className="pointer-events-none h-48 w-full rounded-xl bg-white" />
        ) : (
          <img src={file.url} alt={fileName} className="max-h-48 w-full rounded-xl object-contain" />
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/90 p-3" onClick={() => setOpen(false)}>
          <div className="mx-auto flex w-full max-w-3xl justify-end pb-2">
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl bg-white px-3 text-sm font-bold">
              {t("order.rx.close")}
            </button>
          </div>
          <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            {file.type.includes("pdf") ? (
              <iframe title={fileName} src={file.url} className="h-[70dvh] w-full rounded-2xl bg-white" />
            ) : (
              <img src={file.url} alt={fileName} className="max-h-[80dvh] w-full rounded-2xl object-contain" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReceiptReviewBlock({ order, readOnly = false, onDone, onToast }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("");
  const [reason, setReason] = useState("NOT_RECEIVED");
  const receipt = order?.latestReceipt || (order?.paymentReceipts || []).find((row) => row.status === "PENDING");
  const amount = Number(order?.payment?.amount || order?.totalAmount || 0);
  const pending = order?.status === "WAITING_PAYMENT" && String(order?.payment?.provider || "").toUpperCase() === "CARD_TRANSFER" && receipt?.status === "PENDING";

  if (!pending || !receipt) return null;

  async function approve() {
    setBusy(true);
    try {
      await approveOrderReceipt(order.id);
      onToast?.(t("panel.receipt.approved"));
      onDone?.();
      setMode("");
    } catch (err) {
      onToast?.(apiError(err, t("panel.receipt.actionFailed")), "error");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      await rejectOrderReceipt(order.id, reason);
      onToast?.(t("panel.receipt.rejected"));
      onDone?.();
      setMode("");
    } catch (err) {
      onToast?.(apiError(err, t("panel.receipt.actionFailed")), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase text-amber-800">{t("panel.receipt.title")}</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{formatSom(amount)}</p>
          <p className="text-sm text-slate-600">{order.customerPhone}</p>
          <p className="text-xs text-slate-500">{t("panel.receipt.uploadedAt")}: {formatDateTime(receipt.createdAt)}</p>
        </div>
      </div>
      <Preview receiptId={receipt.id} fileName={receipt.fileName} />
      {!readOnly && !mode && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("approve")} className="h-11 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white">
            {t("panel.receipt.approve")}
          </button>
          <button type="button" onClick={() => setMode("reject")} className="h-11 rounded-xl border border-red-200 bg-white px-3 text-sm font-bold text-red-700">
            {t("panel.receipt.reject")}
          </button>
        </div>
      )}
      {mode === "approve" && (
        <div className="grid gap-2 rounded-xl bg-white p-3">
          <p className="text-sm font-semibold text-slate-800">{t("panel.receipt.approveConfirm", { amount: formatSom(amount) })}</p>
          <div className="flex gap-2">
            <LoadingButton type="button" loading={busy} loadingText={t("common.saving")} onClick={approve} className="h-10 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white">
              {t("panel.receipt.approve")}
            </LoadingButton>
            <button type="button" disabled={busy} onClick={() => setMode("")} className="h-10 rounded-xl px-3 text-sm">{t("common.cancel")}</button>
          </div>
        </div>
      )}
      {mode === "reject" && (
        <div className="grid gap-2 rounded-xl bg-white p-3">
          <p className="text-sm font-semibold text-slate-800">{t("panel.receipt.rejectConfirm")}</p>
          <div className="grid gap-2">
            {RECEIPT_REJECT_REASONS.map(([code, key, fallback]) => (
              <label key={code} className="flex items-center gap-2 text-sm">
                <input type="radio" name={`reject-${order.id}`} checked={reason === code} onChange={() => setReason(code)} />
                {t(key, fallback)}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <LoadingButton type="button" loading={busy} loadingText={t("common.saving")} onClick={reject} className="h-10 rounded-xl bg-red-600 px-3 text-sm font-bold text-white">
              {t("panel.receipt.reject")}
            </LoadingButton>
            <button type="button" disabled={busy} onClick={() => setMode("")} className="h-10 rounded-xl px-3 text-sm">{t("common.cancel")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
