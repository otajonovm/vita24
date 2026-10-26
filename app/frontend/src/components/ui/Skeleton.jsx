import Spinner from "./Spinner";

export function SkeletonPulse({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} aria-hidden />;
}

export function SkeletonLines({ rows = 3, className = "" }) {
  return (
    <div className={`grid gap-2 ${className}`} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonPulse key={index} className={`h-4 ${index === rows - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }) {
  return (
    <div className={`flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm ${className}`} aria-hidden>
      <SkeletonPulse className="h-36 rounded-xl md:h-40" />
      <SkeletonPulse className="mt-2 h-4 w-4/5" />
      <SkeletonPulse className="mt-1.5 h-3 w-1/2" />
      <SkeletonPulse className="mt-3 h-4 w-2/3" />
      <SkeletonPulse className="mt-2 h-11" />
    </div>
  );
}

export function SkeletonGrid({ count = 8, className = "" }) {
  return (
    <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 ${className}`} aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 4, className = "" }) {
  return (
    <div className={`grid gap-3 ${className}`} aria-busy="true" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonPulse key={index} className="h-14 rounded-2xl" />
      ))}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="grid gap-4" aria-busy="true">
      <SkeletonPulse className="h-8 w-48" />
      <SkeletonPulse className="h-24 w-full rounded-2xl" />
      <SkeletonTable rows={4} />
    </div>
  );
}

export function RefetchBar({ show, label = "Yangilanmoqda..." }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2">
      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
        <Spinner className="h-3.5 w-3.5" label={label} />
        {label}
      </span>
    </div>
  );
}

export default function Skeleton({ variant = "lines", rows = 3, count = 8, className = "" }) {
  if (variant === "card") return <SkeletonCard className={className} />;
  if (variant === "grid") return <SkeletonGrid count={count} className={className} />;
  if (variant === "table") return <SkeletonTable rows={rows} className={className} />;
  if (variant === "page") return <SkeletonPage />;
  return <SkeletonLines rows={rows} className={className} />;
}
