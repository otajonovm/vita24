import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Phone, User, XCircle } from "lucide-react";
import customerService from "../../services/customerService";
import { requestCustomerOtp, verifyCustomerOtp } from "../../services/api";
import { loadPublicSettings } from "../../lib/publicSettings";
import { userError } from "../../lib/userError";
import useLockBodyScroll from "../../hooks/useLockBodyScroll";
import { LoadingButton } from "../ui";
import { useAuthStore } from "../../store/useAuthStore";

function maskLocal(value) {
  const digits = String(value || "").replace(/\D/g, "").replace(/^998/, "").slice(0, 9);
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean).join(" ");
}

function normalizePhoneInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("998") && digits.length >= 12) {
    return `+${digits.slice(0, 12)}`;
  }
  if (digits.length >= 9) {
    return `+998${digits.slice(-9)}`;
  }
  if (digits.length > 0) {
    return `+998${digits}`;
  }
  return "";
}

function formatWait(totalSeconds) {
  const total = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function retryAfterSeconds(error) {
  const value = Number(error?.response?.data?.error?.retryAfter);
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
}

function formatPhoneDisplay(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 12) return phone;
  const local = digits.slice(3);
  return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

export default function AuthLoginModal({ open, onClose, onSuccess }) {
  const { t } = useTranslation();
  const setSession = useAuthStore((state) => state.setSession);
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [botName, setBotName] = useState("");
  const [otp, setOtp] = useState("");
  const [fullName, setFullName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState("");
  const [delivery, setDelivery] = useState("");
  const [botUrl, setBotUrl] = useState("");
  const [awaitingContact, setAwaitingContact] = useState(false);
  const [resendLeft, setResendLeft] = useState(0);
  const [retryLeft, setRetryLeft] = useState(0);
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    loadPublicSettings().then((shop) => {
      if (!active) return;
      setBotName(shop.telegramBotUsername || "");
      if (shop.telegramBotUrl) setBotUrl(shop.telegramBotUrl);
    });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setStep("phone");
      setPhone("");
      setOtp("");
      setFullName("");
      setNeedsName(false);
      setError("");
      setDevCode("");
      setDelivery("");
      setBotUrl("");
      setBotName("");
      setAwaitingContact(false);
      setResendLeft(0);
      setRetryLeft(0);
    }
  }, [open]);

  useEffect(() => {
    if (resendLeft <= 0 && retryLeft <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendLeft((current) => (current > 0 ? current - 1 : 0));
      setRetryLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendLeft > 0, retryLeft > 0]);

  if (!open) return null;

  const normalizedPhone = normalizePhoneInput(phone);
  const phoneValid = /^\+998\d{9}$/.test(normalizedPhone);

  async function completeLogin(session) {
    setSession(session.user, session.token);
    if (fullName.trim() && session.user?.name === "Mijoz") {
      const updated = await customerService.updateProfile({ fullName: fullName.trim() });
      if (updated?.user) setSession(updated.user);
    }
    onSuccess?.(session.user);
    onClose?.();
  }

  function applyOtpError(err, fallbackKey) {
    const wait = retryAfterSeconds(err);
    if (wait) {
      setRetryLeft(wait);
      setError("");
      return;
    }
    setError(userError(err, t, fallbackKey));
  }

  async function sendOtp() {
    if (!phoneValid || resendLeft > 0) return;
    setLoading(true);
    setError("");
    try {
      const issued = await requestCustomerOtp(normalizedPhone);
      setDevCode(issued?.devCode || "");
      setDelivery(issued?.delivery || "");
      setBotUrl(issued?.botUrl || "");
      setAwaitingContact(Boolean(issued?.awaitingContact));
      setOtp("");
      setRetryLeft(0);
      setResendLeft(60);
      setStep("otp");
    } catch (err) {
      applyOtpError(err, "auth.codeFailed");
    } finally {
      setLoading(false);
    }
  }

  function handleSendOtp(event) {
    event.preventDefault();
    if (!phoneValid) {
      setError(t("auth.phoneInvalid"));
      return;
    }
    sendOtp();
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await verifyCustomerOtp({
        phone: normalizedPhone,
        code: otp.trim(),
        fullName: fullName.trim() || undefined,
      });
      if (session?.isNew && !fullName.trim()) {
        setNeedsName(true);
        setStep("name");
        setSession(session.user, session.token);
        return;
      }
      await completeLogin(session);
    } catch (err) {
      applyOtpError(err, "auth.codeWrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleNameSubmit(event) {
    event.preventDefault();
    if (!fullName.trim()) {
      setError(t("auth.nameRequired"));
      return;
    }
    setLoading(true);
    try {
      const updated = await customerService.updateProfile({ fullName: fullName.trim() });
      if (updated?.user) setSession(updated.user);
      onSuccess?.(updated?.user);
      onClose?.();
    } catch (err) {
      setError(userError(err, t, "auth.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 md:items-center md:p-5"
      onClick={() => {
        if (!loading) onClose();
      }}
      role="presentation"
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl border border-slate-100 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-sm md:rounded-2xl md:pb-5"
        onClick={(event) => event.stopPropagation()}
        onFocus={(event) => {
          const field = event.target;
          if (field?.tagName !== "INPUT" && field?.tagName !== "TEXTAREA") return;
          window.setTimeout(() => field.scrollIntoView({ block: "center" }), 280);
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-login-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#087b51]">{t("common.login")}</p>
            <h2 id="auth-login-title" className="mt-1 text-lg font-extrabold text-slate-900">
              {t("auth.cabinet")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {botName ? (
                <>
                  {t("auth.botTarget", { bot: botName })}
                  {botUrl ? (
                    <>
                      {" "}
                      <a href={botUrl} target="_blank" rel="noreferrer" className="font-bold text-[#087B51]">
                        @{botName}
                      </a>
                    </>
                  ) : null}
                </>
              ) : (
                t("auth.botTargetPlain")
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">{t("auth.botStart")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 hover:bg-slate-50 disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {step === "phone" && (
          <form onSubmit={handleSendOtp} className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-slate-600">{t("auth.phone")}</span>
              <span className="flex h-12 items-center rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-[#087b51]/30">
                <Phone className="ml-3 h-4 w-4 shrink-0 text-[#087b51]" />
                <span className="pl-2 text-sm font-bold text-slate-800">+998</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(event) => setPhone(maskLocal(event.target.value))}
                  placeholder="90 123 45 67"
                  className="h-full min-w-0 flex-1 bg-transparent px-2 text-base outline-none md:text-sm"
                />
              </span>
            </label>
            {retryLeft > 0 && <p className="text-sm text-red-600">{t("auth.tooMany", { time: formatWait(retryLeft) })}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <LoadingButton
              type="submit"
              disabled={!phoneValid || retryLeft > 0}
              loading={loading}
              loadingText={t("common.loading")}
              className="h-12 rounded-xl bg-[#087b51] text-sm font-bold text-white hover:bg-[#066341] disabled:opacity-50"
            >
              {t("auth.getCode")}
            </LoadingButton>
            {!phoneValid && <p className="text-xs font-medium text-slate-500">{t("auth.phoneIncomplete")}</p>}
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="grid gap-3">
            <p className="text-sm text-slate-600">
              {awaitingContact ? t("auth.openBot") : t("auth.codeSentWait")}
            </p>
            {!awaitingContact && <p className="text-xs text-slate-500">{t("auth.botStart")}</p>}
            {(awaitingContact || delivery === "telegram") && botUrl && (
              <a
                href={botUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-12 items-center justify-center rounded-xl border border-[#087b51] text-sm font-bold text-[#087b51] hover:bg-[#087b51]/5"
              >
                {t("auth.openTelegram")}
              </a>
            )}
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-slate-600">{t("auth.code")}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="h-12 w-full rounded-xl border border-slate-200 px-3 text-center text-lg font-bold tracking-[0.3em] outline-none ring-[#087b51]/30 focus:ring-2"
              />
            </label>
            {devCode && <p className="text-xs text-slate-500">{t("auth.devCode", { code: devCode })}</p>}
            {retryLeft > 0 && <p className="text-sm text-red-600">{t("auth.tooMany", { time: formatWait(retryLeft) })}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <LoadingButton
              type="button"
              disabled={resendLeft > 0}
              loading={loading}
              loadingText={t("common.loading")}
              onClick={sendOtp}
              className="h-11 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {resendLeft > 0 ? t("auth.resendIn", { time: formatWait(resendLeft) }) : t("auth.resend")}
            </LoadingButton>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setError("");
                }}
                className="h-12 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                {t("common.back")}
              </button>
              <LoadingButton
                type="submit"
                disabled={otp.length < 6}
                loading={loading}
                loadingText={t("common.loading")}
                className="h-12 rounded-xl bg-[#087b51] text-sm font-bold text-white hover:bg-[#066341] disabled:opacity-50"
              >
                {t("order.cancel.submit")}
              </LoadingButton>
            </div>
          </form>
        )}

        {step === "name" && needsName && (
          <form onSubmit={handleNameSubmit} className="grid gap-3">
            <p className="text-sm text-slate-600">{t("auth.newUser")}</p>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-slate-600">{t("auth.name")}</span>
              <span className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#087b51]" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Ali Valiyev"
                  className="h-12 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-base outline-none ring-[#087b51]/30 focus:ring-2 md:text-sm"
                />
              </span>
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <LoadingButton
              type="submit"
              loading={loading}
              loadingText={t("common.saving")}
              className="h-12 rounded-xl bg-[#087b51] text-sm font-bold text-white hover:bg-[#066341] disabled:opacity-50"
            >
              {t("auth.continue")}
            </LoadingButton>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
