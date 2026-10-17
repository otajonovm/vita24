function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}

export function ProfileHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <SkeletonBlock className="h-12 w-12 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="h-4 w-32" />
      </div>
    </div>
  );
}

export function OrdersTabSkeleton() {
  return (
    <div className="grid gap-3">
      {[1, 2].map((key) => (
        <article
          key={key}
          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
        >
          <div className="flex justify-between gap-3">
            <div className="space-y-2">
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="h-4 w-36" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
            <div className="space-y-2 text-right">
              <SkeletonBlock className="ml-auto h-6 w-24 rounded-full" />
              <SkeletonBlock className="ml-auto h-5 w-20" />
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-4/5" />
          </div>
          <SkeletonBlock className="mt-4 h-11 w-44" />
        </article>
      ))}
    </div>
  );
}

export function PrescriptionsTabSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[1, 2, 3, 4].map((key) => (
        <article
          key={key}
          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
        >
          <SkeletonBlock className="aspect-4/3 w-full" />
          <SkeletonBlock className="mt-3 h-4 w-3/4" />
          <SkeletonBlock className="mt-2 h-3 w-1/2" />
          <SkeletonBlock className="mt-3 h-6 w-28 rounded-full" />
        </article>
      ))}
    </div>
  );
}

export function AddressesTabSkeleton() {
  return (
    <div className="grid gap-3">
      {[1, 2].map((key) => (
        <article
          key={key}
          className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
        >
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-3 h-4 w-full" />
          <SkeletonBlock className="mt-2 h-3 w-2/3" />
        </article>
      ))}
    </div>
  );
}

export function SettingsTabSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <SkeletonBlock className="h-5 w-40" />
      <div className="mt-4 space-y-3">
        <SkeletonBlock className="h-12 w-full" />
        <SkeletonBlock className="h-12 w-full" />
      </div>
      <SkeletonBlock className="mt-4 h-11 w-24" />
    </div>
  );
}

export function ProfileTabSkeleton({ tab = "orders" }) {
  if (tab === "prescriptions") return <PrescriptionsTabSkeleton />;
  if (tab === "addresses") return <AddressesTabSkeleton />;
  if (tab === "settings") return <SettingsTabSkeleton />;
  return <OrdersTabSkeleton />;
}
