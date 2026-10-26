import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchPrescriptionLink, loadPrescriptionObjectUrl } from "../../services/api";
import { ErrorState, SkeletonPulse } from "../ui";

export default function PrescriptionFile({ prescriptionId, audience, fileName = "" }) {
  const { t } = useTranslation();
  const label = fileName || t("common.rx");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!prescriptionId) {
      setFile(null);
      setError("");
      return undefined;
    }
    let active = true;
    let objectUrl = "";
    setError("");
    setFile(null);
    const request =
      audience === "admin"
        ? fetchPrescriptionLink(prescriptionId, "admin").then((link) => ({
            url: link.url,
            type: String(fileName).toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg",
            remote: true,
          }))
        : loadPrescriptionObjectUrl(prescriptionId, audience);
    request
      .then((next) => {
        if (!active) {
          if (!next.remote) URL.revokeObjectURL(next.url);
          return;
        }
        objectUrl = next.remote ? "" : next.url;
        setFile(next);
      })
      .catch(() => {
        if (active) setError(t("order.rx.failed"));
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [prescriptionId, audience, fileName, t, reloadKey]);

  if (!prescriptionId) {
    return <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-slate-500">{t("common.missingRx")}</p>;
  }
  if (error) {
    return <ErrorState title={error} onRetry={() => setReloadKey((value) => value + 1)} />;
  }
  if (!file) {
    return <SkeletonPulse className="h-48 w-full rounded-2xl" />;
  }
  if (file.type.includes("pdf")) {
    return (
      <div className="grid gap-2">
        <iframe title={label} src={file.url} className="h-[70dvh] w-full rounded-2xl bg-white" />
        <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800">
          {t("order.rx.open")}
        </a>
      </div>
    );
  }
  return <img src={file.url} alt={label} className="mx-auto max-h-[52dvh] w-full rounded-2xl bg-white object-contain" />;
}
