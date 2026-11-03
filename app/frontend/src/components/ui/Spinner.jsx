import { useTranslation } from "react-i18next";
import { LoaderCircle } from "lucide-react";

export default function Spinner({ className = "h-4 w-4", label }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center justify-center" role="status" aria-live="polite">
      <LoaderCircle className={`animate-spin ${className}`} aria-hidden />
      <span className="sr-only">{label || t("common.loading")}</span>
    </span>
  );
}
