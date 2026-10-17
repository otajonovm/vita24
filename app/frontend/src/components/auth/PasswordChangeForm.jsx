import { useState } from "react";
import { useTranslation } from "react-i18next";
import { changeOwnPassword } from "../../services/api";

function validPassword(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(value);
}

export default function PasswordChangeForm({ audience, onChanged }) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [field, setField] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!validPassword(newPassword)) {
      setField(t("admin.validation.staffPassword"));
      return;
    }
    setBusy(true);
    setError("");
    setField("");
    try {
      const result = await changeOwnPassword({ currentPassword, newPassword }, audience);
      onChanged(result);
    } catch (err) {
      setError(err.response?.data?.error?.message || t("admin.loginFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[70vh] place-items-center p-4">
      <form noValidate onSubmit={submit} className="grid w-full max-w-md gap-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-extrabold text-slate-900">{t("admin.changePasswordTitle")}</h1>
        <p className="text-sm text-slate-500">{t("admin.changePasswordHint")}</p>
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-slate-600">{t("admin.currentPassword")}</span>
          <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-slate-600">{t("admin.newPassword")}</span>
          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm" />
          {field ? <span className="text-xs font-medium text-red-600">{field}</span> : null}
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-[#087B51] text-sm font-bold text-white disabled:opacity-50">
          {busy ? t("admin.saving") : t("admin.changePassword")}
        </button>
      </form>
    </div>
  );
}
