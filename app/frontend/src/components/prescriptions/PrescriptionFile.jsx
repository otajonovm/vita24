import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchPrescriptionLink, loadPrescriptionObjectUrl } from "../../services/api";

export default function PrescriptionFile({ prescriptionId, audience, fileName = "" }) {
  const { t } = useTranslation();
  const label = fileName || t("common.rx");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!prescriptionId) return undefined;
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
  }, [prescriptionId, audience, fileName, t]);

  if (error) {
    return <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-red-600">{error}</p>;
  }
  if (!file) {
    return <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-slate-500">{t("order.rx.loading")}</p>;
  }
  if (file.type.includes("pdf")) {
    return (
      <iframe title={label} src={file.url} className="h-[70vh] w-full rounded-2xl bg-white" />
    );
  }
  return <img src={file.url} alt={label} className="mx-auto max-h-[52vh] w-full rounded-2xl bg-white object-contain" />;
}
