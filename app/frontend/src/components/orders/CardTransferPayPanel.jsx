import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check } from "lucide-react";
import { formatClock, formatSom } from "../../lib/format";
import { loadReceiptObjectUrl, uploadOrderReceipt } from "../../services/api";
import { userError } from "../../lib/userError";
import { ErrorState, LoadingButton, SkeletonLines } from "../ui";
import useLockBodyScroll from "../../hooks/useLockBodyScroll";

function formatCard(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ")
    .trim();
}

function CopyRow({ label, value, large }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(String(value || "").replace(/\s/g, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1 break-all font-extrabold text-slate-900 ${large ? "text-xl tabular-nums tracking-wide" : "text-sm"}`}>
          {value}
        </p>
      </div>
      <button type="button" onClick={copy} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-white px-3 text-xs font-bold text-brand">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? t("common.copied") : t("common.copy")}
      </button>
    </div>
  );
}

function ReceiptPreview({ receiptId, fileName }) {
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useLockBodyScroll(open);

  useEffect(() => {
    if (!receiptId) return undefined;
    let active = true;
    let objectUrl = "";
    loadReceiptObjectUrl(receiptId, "customer")
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

  const preview = file.type.includes("pdf") ? (
    <iframe title={fileName} src={file.url} className="pointer-events-none h-40 w-full rounded-xl bg-white" />
  ) : (
    <img src={file.url} alt={fileName} className="max-h-40 w-full rounded-xl object-contain" />
  );

  return (
    <div className="mt-3">
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        {preview}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 p-3" onClick={() => setOpen(false)}>
          <div className="mx-auto flex w-full max-w-3xl justify-end pb-2">
            <button type="button" onClick={() => setOpen(false)} className="grid h-11 min-w-11 place-items-center rounded-xl bg-white px-3 text-sm font-bold">
              {t("order.rx.close")}
            </button>
          </div>
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 overflow-y-auto" onClick={(event) => event.stopPropagation()}>
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

export default function CardTransferPayPanel({ order, remaining, onUploaded, onError }) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const card = order?.cardTransfer || {};
  const amount = Number(order?.payment?.amount || order?.totalAmount || 0);
  const latest = order?.latestReceipt || (order?.paymentReceipts || [])[0] || null;
  const pending = latest?.status === "PENDING";
  const rejected = latest?.status === "REJECTED";

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadOrderReceipt(order.id, file);
      onUploaded?.(result);
    } catch (err) {
      onError?.(userError(err, t, "order.receipt.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="mt-4 grid gap-3 rounded-2xl border border-brand/20 bg-brand-soft/40 p-4">
      <h2 className="text-base font-extrabold text-slate-900">{t("order.receipt.title")}</h2>
      <ol className="grid gap-2 text-sm text-slate-700">
        <li><span className="font-bold">1.</span> {t("order.receipt.step1")}</li>
        <li><span className="font-bold">2.</span> {t("order.receipt.step2")}</li>
        <li><span className="font-bold">3.</span> {t("order.receipt.step3")}</li>
      </ol>

      <CopyRow label={t("order.receipt.cardNumber")} value={formatCard(card.cardTransferNumber)} large />
      {card.cardTransferHolder ? (
        <p className="text-sm text-slate-700"><span className="font-bold">{t("order.receipt.holder")}:</span> {card.cardTransferHolder}</p>
      ) : null}
      {card.cardTransferBank ? (
        <p className="text-sm text-slate-700"><span className="font-bold">{t("order.receipt.bank")}:</span> {card.cardTransferBank}</p>
      ) : null}
      <CopyRow label={t("order.receipt.amount")} value={formatSom(amount)} large />
      <p className="text-sm text-slate-700">
        <span className="font-bold">{t("order.receipt.orderNo")}:</span> {order.orderNumber}
      </p>
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("order.receipt.commentHint")}</p>

      {!pending && remaining > 0 && (
        <p className="text-sm font-bold tabular-nums text-amber-800">{t("order.timer.payment", { time: formatClock(remaining) })}</p>
      )}
      {pending && <p className="text-sm font-bold text-brand">{t("order.receipt.reviewing")}</p>}
      {rejected && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("order.receipt.rejected")}: {latest.rejectReason || t("order.receipt.rejectOther")}
        </p>
      )}

      {latest && <ReceiptPreview receiptId={latest.id} fileName={latest.fileName} />}

      {!pending && (
        <label className="inline-flex">
          <LoadingButton
            type="button"
            loading={uploading}
            loadingText={t("common.loading")}
            className="h-12 rounded-xl bg-[#087B51] px-4 text-sm font-bold text-white disabled:opacity-50"
            onClick={() => document.getElementById(`receipt-file-${order.id}`)?.click()}
          >
            {latest ? t("order.receipt.replace") : t("order.receipt.upload")}
          </LoadingButton>
          <input
            id={`receipt-file-${order.id}`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            className="sr-only"
            disabled={uploading}
            onChange={onFile}
          />
        </label>
      )}
    </section>
  );
}
