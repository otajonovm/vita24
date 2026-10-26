import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../../lib/format";
import {
  disableAdmin2fa,
  enableAdmin2fa,
  fetchAdminSessions,
  revokeAdminSession,
  revokeAllAdminSessions,
  setupAdmin2fa,
} from "../../services/api";
import { useAdminAuth } from "../../store/useAuthStore";
import { LoadingButton } from "../ui";
import { AdminSkeleton, EmptyState, ErrorState, useConfirm } from "./ui";

function errorText(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}

export default function AdminSecurity() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const logout = useAdminAuth((state) => state.logout);
  const setSession = useAdminAuth((state) => state.setSession);
  const adminUser = useAdminAuth((state) => state.user);
  const [sessions, setSessions] = useState([]);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState("");
  const [codeError, setCodeError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  async function load() {
    setLoadError("");
    const data = await fetchAdminSessions();
    setSessions(data?.sessions || []);
    const enabled = Boolean(data?.totpEnabled);
    setTotpEnabled(enabled);
    const current = useAdminAuth.getState().user;
    if (current?.role === "SUPER_ADMIN" && current.totpEnabled !== enabled) {
      useAdminAuth.getState().setSession({ ...current, totpEnabled: enabled });
    }
  }

  useEffect(() => {
    load()
      .catch((err) => setLoadError(errorText(err, t("admin.securityLoadFailed"))))
      .finally(() => setLoading(false));
  }, [t]);

  async function revoke(session) {
    if (revokeBusy) return;
    setError("");
    setNotice("");
    setRevokeBusy(session.id);
    try {
      await revokeAdminSession(session.id);
      if (session.current) {
        logout();
        return;
      }
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (err) {
      setError(errorText(err, t("admin.securityLoadFailed")));
    } finally {
      setRevokeBusy("");
    }
  }

  async function revokeAll() {
    const ok = await confirm({
      title: t("admin.logoutAll"),
      body: t("admin.logoutAllConfirm"),
      confirmLabel: t("admin.logoutAll"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await revokeAllAdminSessions();
      logout();
    } catch (err) {
      setError(errorText(err, t("admin.securityLoadFailed")));
      setBusy(false);
    }
  }

  async function beginSetup() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setSetup(await setupAdmin2fa());
      setCode("");
    } catch (err) {
      setError(errorText(err, t("admin.securityLoadFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(event) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setCodeError(t("admin.validation.code"));
      return;
    }
    setCodeError("");
    setBusy(true);
    setError("");
    try {
      await enableAdmin2fa(code.trim());
      setTotpEnabled(true);
      if (adminUser) setSession({ ...adminUser, totpEnabled: true });
      setSetup(null);
      setCode("");
      setNotice(t("admin.twoFaEnabled"));
    } catch (err) {
      setError(errorText(err, t("admin.securityLoadFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function disable(event) {
    event.preventDefault();
    const badCode = !/^\d{6}$/.test(code);
    const badPassword = !password.trim();
    setCodeError(badCode ? t("admin.validation.code") : "");
    setPasswordError(badPassword ? t("admin.validation.required") : "");
    if (badCode || badPassword) return;
    setBusy(true);
    setError("");
    try {
      await disableAdmin2fa({ password, code: code.trim() });
      setTotpEnabled(false);
      if (adminUser) setSession({ ...adminUser, totpEnabled: false });
      setPassword("");
      setCode("");
      setNotice(t("admin.twoFaDisabled"));
    } catch (err) {
      setError(errorText(err, t("admin.securityLoadFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">{t("admin.sessionsTitle")}</h2>
          </div>
          <button
            type="button"
            onClick={revokeAll}
            disabled={busy}
            className="h-11 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-600 disabled:opacity-50"
          >
            {t("admin.logoutAll")}
          </button>
        </div>
        {loading ? (
          <div className="mt-4"><AdminSkeleton rows={2} /></div>
        ) : loadError ? (
          <div className="mt-4">
            <ErrorState
              title={loadError}
              onRetry={() => {
                setLoading(true);
                load()
                  .catch((err) => setLoadError(errorText(err, t("admin.securityLoadFailed"))))
                  .finally(() => setLoading(false));
              }}
            />
          </div>
        ) : sessions.length === 0 ? (
          <div className="mt-4">
            <EmptyState title={t("admin.sessionsEmpty")} body={t("admin.sessionsEmptyBody")} actionLabel={t("admin.refresh")} onAction={() => load().catch((err) => setLoadError(errorText(err, t("admin.securityLoadFailed"))))} />
          </div>
        ) : (
        <ul className="mt-4 grid gap-2">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {session.userAgent || "—"}
                  {session.current ? ` · ${t("admin.sessionCurrent")}` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {session.ip || "—"} · {formatDateTime(session.lastSeenAt)}
                </p>
              </div>
              <LoadingButton
                type="button"
                loading={revokeBusy === session.id}
                loadingText={t("common.saving")}
                onClick={() => revoke(session)}
                className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 disabled:opacity-50"
              >
                {t("admin.sessionRevoke")}
              </LoadingButton>
            </li>
          ))}
        </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-extrabold text-slate-900">{t("admin.twoFaTitle")}</h2>
        <p className="mt-1 text-sm text-slate-500">{totpEnabled ? t("admin.twoFaOn") : t("admin.twoFaOff")}</p>

        {!totpEnabled && !setup && (
          <button
            type="button"
            onClick={beginSetup}
            disabled={busy}
            className="mt-4 h-11 rounded-xl bg-[#087B51] px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {t("admin.twoFaSetup")}
          </button>
        )}

        {setup && (
          <form noValidate onSubmit={confirmSetup} className="mt-4 grid gap-3">
            <p className="text-sm text-slate-600">{t("admin.twoFaHint")}</p>
            <p className="break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-sm">{setup.secret}</p>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-slate-600">{t("admin.twoFaCode")}</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                className={`h-11 rounded-xl border px-3 text-sm outline-none ring-[#087B51]/30 focus:ring-2 ${codeError ? "border-red-400" : "border-slate-200"}`}
                aria-invalid={Boolean(codeError)}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setCodeError("");
                }}
              />
              {codeError && <span className="text-xs font-medium text-red-600">{codeError}</span>}
            </label>
            <button type="submit" disabled={busy} className="h-11 rounded-xl bg-[#087B51] text-sm font-bold text-white disabled:opacity-50">
              {t("admin.twoFaEnable")}
            </button>
          </form>
        )}

        {totpEnabled && (
          <form noValidate onSubmit={disable} className="mt-4 grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-slate-600">{t("admin.twoFaPassword")}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setPasswordError("");
                }}
                aria-invalid={Boolean(passwordError)}
                className={`h-11 rounded-xl border px-3 text-sm outline-none ring-[#087B51]/30 focus:ring-2 ${passwordError ? "border-red-400" : "border-slate-200"}`}
              />
              {passwordError && <span className="text-xs font-medium text-red-600">{passwordError}</span>}
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-slate-600">{t("admin.twoFaCode")}</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setCodeError("");
                }}
                aria-invalid={Boolean(codeError)}
                className={`h-11 rounded-xl border px-3 text-sm outline-none ring-[#087B51]/30 focus:ring-2 ${codeError ? "border-red-400" : "border-slate-200"}`}
              />
              {codeError && <span className="text-xs font-medium text-red-600">{codeError}</span>}
            </label>
            <button type="submit" disabled={busy} className="h-11 rounded-xl border border-red-200 text-sm font-bold text-red-600 disabled:opacity-50">
              {t("admin.twoFaDisable")}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
