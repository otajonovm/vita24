import { Link } from "react-router-dom";

export default function EmptyState({
  title,
  body,
  description,
  actionLabel,
  onAction,
  actionTo,
  icon: Icon,
  align = "start",
  className = "",
}) {
  const text = body || description;
  const centered = align === "center";
  return (
    <div
      className={`grid gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 ${
        centered ? "place-items-center text-center" : "justify-items-start"
      } ${className}`}
    >
      {Icon ? (
        <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      ) : null}
      <p className="text-sm font-bold text-slate-800">{title}</p>
      {text ? <p className="max-w-md text-sm text-slate-500">{text}</p> : null}
      {actionLabel && actionTo ? (
        <Link to={actionTo} className="mt-1 inline-flex h-10 items-center rounded-xl bg-brand px-3 text-sm font-bold text-white no-underline">
          {actionLabel}
        </Link>
      ) : null}
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className="mt-1 h-10 rounded-xl bg-brand px-3 text-sm font-bold text-white">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
