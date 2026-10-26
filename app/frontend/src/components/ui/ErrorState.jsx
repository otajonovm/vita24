export default function ErrorState({
  title = "Ma'lumot yuklanmadi",
  message,
  onRetry,
  retryLabel = "Qayta urinish",
  onClose,
  closeLabel = "Yopish",
  className = "",
}) {
  const text = message || title;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 ${className}`}>
      <p className="text-sm font-semibold text-red-700">{text}</p>
      <div className="flex flex-wrap gap-2">
        {onRetry ? (
          <button type="button" onClick={onRetry} className="h-10 rounded-xl bg-white px-3 text-sm font-bold text-red-700">
            {retryLabel}
          </button>
        ) : null}
        {onClose ? (
          <button type="button" onClick={onClose} className="h-10 rounded-xl px-3 text-sm font-semibold text-slate-600">
            {closeLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
