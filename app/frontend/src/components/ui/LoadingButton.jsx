import Spinner from "./Spinner";

export default function LoadingButton({
  loading = false,
  loadingText,
  disabled = false,
  children,
  className = "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50",
  type = "button",
  onClick,
  ...rest
}) {
  const busy = Boolean(loading);

  function handleClick(event) {
    if (busy || disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy}
      onClick={onClick ? handleClick : undefined}
      className={`inline-flex items-center justify-center gap-2 ${className}`}
      {...rest}
    >
      {busy ? <Spinner className="h-4 w-4" label={loadingText || "Yuklanmoqda..."} /> : null}
      <span>{busy && loadingText ? loadingText : children}</span>
    </button>
  );
}
