import { useState } from "react";
import { Lock, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { staffLogin } from "../../services/api";
import { setPharmacistRemember, useAdminAuth, useCourierAuth, usePharmacistAuth } from "../../store/useAuthStore";
import { apiError } from "./panelShared";

const ADMIN_ROLES = ["BRANCH_ADMIN"];

function normalizePhoneInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("998")) return `+${digits.slice(0, 12)}`;
  if (digits) return `+998${digits.slice(0, 9)}`;
  return "+998";
}

export default function StaffLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = usePharmacistAuth((state) => state.setSession);
  const setAdminSession = useAdminAuth((state) => state.setSession);
  const setCourierSession = useCourierAuth((state) => state.setSession);
  const [phone, setPhone] = useState("+998");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [totp, setTotp] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const nextPhone = normalizePhoneInput(phone);
    const nextPhoneError = /^\+998\d{9}$/.test(nextPhone) ? "" : "Telefon +998 va 9 ta raqam bo'lishi kerak";
    const nextPasswordError = password.trim() ? "" : "Parolni kiriting";
    setPhoneError(nextPhoneError);
    setPasswordError(nextPasswordError);
    if (nextPhoneError || nextPasswordError) return;
    setLoading(true);
    setError("");
    try {
      const result = await staffLogin({ phone: nextPhone, password, totp: needs2fa ? totp : undefined });
      if (result?.requires2fa) {
        setNeeds2fa(true);
        return;
      }
      if (!result?.token || !result?.user) throw new Error(t("panel.noToken", "Token olinmadi"));
      if (result.user.role === "SUPER_ADMIN") {
        setAdminSession(result.user, result.token, { refreshToken: result.refreshToken });
        navigate("/admin", { replace: true });
        return;
      }
      if (result.user.role === "COURIER") {
        setCourierSession(result.user, result.token);
        navigate("/courier", { replace: true });
        return;
      }
      if (!ADMIN_ROLES.includes(result.user.role)) {
        throw new Error(t("panel.staffOnly", "Faqat farmatsevt kira oladi"));
      }
      setPharmacistRemember(remember);
      setSession(result.user, result.token);
    } catch (err) {
      setError(apiError(err, t("panel.loginFailed", "Kirish amalga oshmadi")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto grid min-h-[70vh] w-full max-w-md place-content-center gap-4">
    <div className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brand">{t("panel.title", "Vita24 Farmatsevt")}</p>
        <h1 className="mt-1 text-xl font-extrabold text-slate-900">{t("panel.login", "Kirish")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("panel.loginHint", "Filial farmatsevti hisobi bilan kiring.")}</p>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-slate-600">{t("panel.phone", "Telefon")}</span>
          <span className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand" />
            <input value={phone} onChange={(event) => setPhone(normalizePhoneInput(event.target.value))} inputMode="tel" className={`h-12 w-full rounded-xl border pl-10 pr-3 text-sm outline-none ring-brand/30 focus:ring-2 ${phoneError ? "border-red-500" : "border-slate-200"}`} />
          </span>
          {phoneError && <span className="text-xs text-red-600">{phoneError}</span>}
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-slate-600">{t("panel.password", "Parol")}</span>
          <span className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand" />
            <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className={`h-12 w-full rounded-xl border pl-10 pr-16 text-sm outline-none ring-brand/30 focus:ring-2 ${passwordError ? "border-red-500" : "border-slate-200"}`} />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
              {showPassword ? "Yashirish" : "Ko'rsatish"}
            </button>
          </span>
          {passwordError && <span className="text-xs text-red-600">{passwordError}</span>}
        </label>
        {needs2fa && (
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-slate-600">{t("admin.loginCode")}</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={totp}
              onChange={(event) => setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-brand/30 focus:ring-2"
              required
            />
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          {t("panel.remember", "Meni eslab qol")}
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="h-12 rounded-xl bg-brand text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50">
          {loading ? t("panel.checking", "Tekshirilmoqda...") : t("panel.login", "Kirish")}
        </button>
      </form>
    </div>
    </section>
  );
}
