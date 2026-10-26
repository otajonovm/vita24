import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  LogOut,
  MapPin,
  Package,
  Phone,
  Plus,
  Settings,
  User,
  XCircle,
} from "lucide-react";
import { ErrorState, LoadingButton } from "../components/ui";
import useLockBodyScroll from "../hooks/useLockBodyScroll";
import AddressModal from "../components/profile/AddressModal";
import {
  ProfileHeaderSkeleton,
  ProfileTabSkeleton,
} from "../components/profile/ProfileSkeleton";
import AuthLoginModal from "../components/modals/AuthLoginModal";
import CustomerOrderList from "../components/orders/CustomerOrderList";
import { formatDateTime, formatPhoneDisplay } from "../lib/format";
import { displayName } from "../lib/personName";
import LanguageSwitcher from "../components/layout/LanguageSwitcher";
import customerService from "../services/customerService";
import { useAdminAuth, useAuthStore, usePharmacistAuth } from "../store/useAuthStore";
import { useCartStore } from "../store/useCartStore";

const TABS = [
  { id: "orders", labelKey: "profile.tabs.orders", Icon: Package },
  { id: "prescriptions", labelKey: "profile.tabs.prescriptions", Icon: FileText },
  { id: "addresses", labelKey: "profile.tabs.addresses", Icon: MapPin },
  { id: "settings", labelKey: "profile.tabs.settings", Icon: Settings },
];

const PRESCRIPTION_BADGE = {
  PENDING: {
    labelKey: "profile.rx.pending",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: Clock,
  },
  APPROVED: {
    labelKey: "profile.rx.approved",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Icon: CheckCircle2,
  },
  REJECTED: {
    labelKey: "profile.rx.rejected",
    className: "bg-red-50 text-red-600 border-red-200",
    Icon: XCircle,
  },
};

const EMPTY_ADDRESS_FORM = {
  street: "",
  apartment: "",
  floor: "",
  intercom: "",
  lat: null,
  lng: null,
};

function formatDate(value) {
  return formatDateTime(value) || "—";
}

function formatOrderNumber(orderNumber) {
  if (!orderNumber) return "#V24-0000";
  return orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`;
}

function TabButton({ tab, active, onClick, className = "" }) {
  const { t } = useTranslation();
  const { Icon } = tab;
  return (
    <button
      type="button"
      onClick={() => onClick(tab.id)}
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${
        active ? "bg-brand-soft text-brand" : "text-slate-600 hover:bg-slate-50"
      } ${className}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{t(tab.labelKey)}</span>
      {active && <ChevronRight className="ml-auto hidden h-4 w-4 shrink-0 opacity-60 lg:block" aria-hidden />}
    </button>
  );
}

function EmptyState({ Icon, title, description, actionLabel, actionTo, onAction }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-5 py-10 text-center shadow-sm">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-3 text-base font-extrabold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="mt-5 inline-flex h-11 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white no-underline hover:bg-brand-dark"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex h-11 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function PrescriptionPreview({ fileUrl, fileName }) {
  const { t } = useTranslation();
  const isImage = fileUrl?.startsWith("data:image");
  const isPdf = fileUrl?.startsWith("data:application/pdf");

  if (isImage) {
    return (
      <img
        src={fileUrl}
        alt={fileName || t("common.rx")}
        className="h-full w-full rounded-xl object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 text-brand/70">
      <FileText className="h-10 w-10" />
      <span className="px-3 text-center text-xs font-semibold text-slate-500">
        {isPdf ? t("common.pdfRx") : fileName || t("common.rxFile")}
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setSession = useAuthStore((state) => state.setSession);
  const logout = useAuthStore((state) => state.logout);
  const setSavedAddress = useCartStore((state) => state.setSavedAddress);
  const clearSession = useCartStore((state) => state.clearSession);

  const activeTab = searchParams.get("tab") || "orders";
  const telegramAuthPending = useAuthStore((state) => state.telegramAuthPending);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [orders, setOrders] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [profile, setProfile] = useState(null);
  const [settingsName, setSettingsName] = useState("");
  const [notifyOrders, setNotifyOrders] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressTitleKey, setAddressTitleKey] = useState("profile.newAddress");
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS_FORM);
  const [savingAddress, setSavingAddress] = useState(false);
  const [message, setMessage] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  useLockBodyScroll(logoutOpen);

  const setTab = useCallback(
    (tabId) => {
      setSearchParams({ tab: tabId }, { replace: true });
    },
    [setSearchParams]
  );

  const loadProfileData = useCallback(async ({ quiet = false } = {}) => {
    if (!user?.phone) return;
    if (!quiet) setLoading(true);
    setMessage("");
    setLoadError("");

    try {
      const data = await customerService.loadDashboard(user.phone);
      setProfile(data.profile);
      setOrders(data.orders);
      setPrescriptions(data.prescriptions);
      setSettingsName(displayName(data.profile?.fullName || user.name));
      setNotifyOrders(data.profile?.notifyOrders !== false);

      if (data.profile?.user) {
        setSession(data.profile.user);
      }
    } catch {
      setLoadError(t("profile.loadFailed"));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [user?.phone, user?.name, setSession, t]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadProfileData();
  }, [isAuthenticated, loadProfileData]);

  const savedAddresses = useMemo(() => {
    const list = [];
    const primary = profile?.primaryAddress || profile;

    if (primary?.lastStreet || profile?.lastStreet) {
      list.push({
        id: "primary",
        labelKey: "profile.primary",
        street: primary?.lastStreet || profile?.lastStreet || "",
        apartment: primary?.lastApartment || profile?.lastApartment || "",
        floor: primary?.lastFloor || profile?.lastFloor || "",
        intercom: primary?.lastIntercom || profile?.lastIntercom || "",
        lat: primary?.lastLat ?? profile?.lastLat ?? null,
        lng: primary?.lastLng ?? profile?.lastLng ?? null,
        isPrimary: true,
      });
    }

    (profile?.additionalAddresses || []).forEach((item, index) => {
      list.push({
        id: item.orderId || `extra-${index}`,
        labelKey: "",
        label: item.label || "",
        extraIndex: index + 1,
        street: item.street || "",
        apartment: item.apartment || "",
        floor: item.floor || "",
        intercom: item.intercom || "",
        lat: item.lat ?? null,
        lng: item.lng ?? null,
        isPrimary: false,
      });
    });

    return list;
  }, [profile]);

  function openAddressModal(entry = null) {
    if (entry) {
      setAddressTitleKey("profile.editAddress");
      setAddressForm({
        street: entry.street,
        apartment: entry.apartment,
        floor: entry.floor,
        intercom: entry.intercom,
        lat: entry.lat,
        lng: entry.lng,
      });
    } else {
      setAddressTitleKey("profile.newAddress");
      setAddressForm(EMPTY_ADDRESS_FORM);
    }
    setAddressModalOpen(true);
  }

  async function handleSaveSettings(event) {
    event.preventDefault();
    if (!user?.phone) return;

    if (!displayName(settingsName)) {
      setMessage(t("profile.enterName"));
      return;
    }

    setSavingSettings(true);
    setMessage("");

    try {
      const updated = await customerService.updateProfile({
        phone: user.phone,
        fullName: displayName(settingsName),
        notifyOrders,
      });
      setProfile(updated);
      if (updated?.user) setSession(updated.user);
      setMessage(t("profile.saved"));
    } catch {
      setMessage(t("profile.saveFailed"));
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveAddress(event) {
    event.preventDefault();
    if (!user?.phone || !addressForm.street.trim()) return;

    setSavingAddress(true);
    setMessage("");

    try {
      await Promise.all([
        customerService.updateProfile({
          phone: user.phone,
          fullName: settingsName || user.name,
          lastStreet: addressForm.street.trim(),
          lastApartment: addressForm.apartment.trim(),
          lastFloor: addressForm.floor.trim(),
          lastIntercom: addressForm.intercom.trim(),
          lastLat: addressForm.lat,
          lastLng: addressForm.lng,
        }),
        customerService.saveAddress({
          phone: user.phone,
          fullName: settingsName || user.name,
          street: addressForm.street.trim(),
          apartment: addressForm.apartment.trim(),
          floor: addressForm.floor.trim(),
          intercom: addressForm.intercom.trim(),
          lat: addressForm.lat,
          lng: addressForm.lng,
        }),
      ]);

      setSavedAddress({
        street: addressForm.street.trim(),
        apartment: addressForm.apartment.trim(),
        floor: addressForm.floor.trim(),
        intercom: addressForm.intercom.trim(),
        lat: addressForm.lat,
        lng: addressForm.lng,
      });

      setAddressModalOpen(false);
      await loadProfileData({ quiet: true });
      setMessage(t("profile.addressSaved"));
    } catch {
      setMessage(t("profile.addressFailed"));
    } finally {
      setSavingAddress(false);
    }
  }

  function handleLogout() {
    clearSession();
    logout();
    usePharmacistAuth.getState().logout();
    useAdminAuth.getState().logout();
    setProfile(null);
    setOrders([]);
    setPrescriptions([]);
    setLoginOpen(false);
  }

  function handleLoginSuccess(loggedInUser) {
    setLoginOpen(false);
    if (displayName(loggedInUser?.name)) {
      setSettingsName(displayName(loggedInUser.name));
    }
  }

  if (!isAuthenticated) {
    if (telegramAuthPending) {
      return <p className="text-sm font-semibold text-slate-600">{t("common.signingIn")}</p>;
    }
    return (
      <>
        <EmptyState
          Icon={User}
          title={t("profile.loginTitle")}
          description={t("profile.loginText")}
          actionLabel={t("profile.loginAction")}
          onAction={() => setLoginOpen(true)}
        />
        <AuthLoginModal
          open={loginOpen}
          onClose={() => setLoginOpen(false)}
          onSuccess={handleLoginSuccess}
        />
      </>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6">
      <header className="min-w-0 lg:col-span-2">
        {loading && !profile ? (
          <ProfileHeaderSkeleton />
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
              <User className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-brand">{t("profile.kicker")}</p>
              <h1 className="truncate text-lg font-extrabold text-slate-900">
                {displayName(profile?.fullName || user?.name) ? (
                  displayName(profile?.fullName || user?.name)
                ) : (
                  <button type="button" onClick={() => setTab("settings")} className="text-[#087B51]">
                    {t("profile.enterName")}
                  </button>
                )}
              </h1>
              <p className="flex min-w-0 items-center gap-1.5 text-sm text-slate-500">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{formatPhoneDisplay(user?.phone)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 px-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 sm:px-3"
            >
              <LogOut className="h-4 w-4" />
              {t("profile.logout")}
            </button>
          </div>
        )}
      </header>

      <aside className="hidden min-w-0 lg:block">
        <nav className="sticky top-24 grid gap-1 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
          {TABS.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              onClick={setTab}
              className="w-full"
            />
          ))}
        </nav>
      </aside>

      <div className="min-w-0 max-w-full lg:hidden">
        <div className="no-scrollbar flex gap-2 overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
          {TABS.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              onClick={setTab}
              className="shrink-0 whitespace-nowrap"
            />
          ))}
        </div>
      </div>

      <section className="min-w-0 lg:col-start-2">
        {message && (
          <p className="mb-3 rounded-xl border border-brand/20 bg-brand-soft px-3 py-2 text-sm font-medium text-brand">
            {message}
          </p>
        )}

        {loadError ? (
          <ErrorState title={loadError} onRetry={() => loadProfileData()} />
        ) : loading ? (
          <ProfileTabSkeleton tab={activeTab} />
        ) : (
          <>
            {activeTab === "orders" && (
              <div className="grid gap-3">
                <h2 className="text-base font-extrabold text-slate-900 lg:sr-only">{t("profile.ordersTitle")}</h2>
                {orders.length === 0 ? (
                  <EmptyState
                    Icon={Package}
                    title={t("profile.ordersEmpty")}
                    description={t("profile.ordersEmptyText")}
                    actionLabel={t("favorites.browse")}
                    actionTo="/catalog"
                  />
                ) : (
                  <CustomerOrderList orders={orders} onOrders={setOrders} />
                )}
              </div>
            )}

            {activeTab === "prescriptions" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <h2 className="text-base font-extrabold text-slate-900 sm:col-span-2 lg:sr-only">
                  {t("profile.rxTitle")}
                </h2>
                {prescriptions.length === 0 ? (
                  <div className="sm:col-span-2">
                    <EmptyState
                      Icon={FileText}
                      title={t("profile.rxEmpty")}
                      description={t("profile.rxEmptyText")}
                      actionLabel={t("profile.toCart")}
                      actionTo="/cart"
                    />
                  </div>
                ) : (
                  prescriptions.map((item) => {
                    const badge = PRESCRIPTION_BADGE[item.status] || PRESCRIPTION_BADGE.PENDING;
                    const BadgeIcon = badge.Icon;
                    return (
                      <article
                        key={item.id}
                        className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                      >
                        <div className="aspect-4/3 overflow-hidden rounded-xl">
                          <PrescriptionPreview fileUrl={item.fileUrl} fileName={item.fileName} />
                        </div>
                        <p className="mt-3 truncate text-sm font-bold text-slate-900">
                          {item.fileName || t("common.rx")}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {formatDate(item.createdAt)}
                        </p>
                        {item.orderNumber && (
                          <p className="mt-1 text-xs font-semibold text-slate-600">
                            {formatOrderNumber(item.orderNumber)}
                          </p>
                        )}
                        <span
                          className={`mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${badge.className}`}
                        >
                          <BadgeIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {item.status === "REJECTED" && item.rejectNote
                              ? t("profile.rx.rejectedNote", { note: item.rejectNote })
                              : t(badge.labelKey)}
                          </span>
                        </span>
                      </article>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === "addresses" && (
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-extrabold text-slate-900">{t("profile.addresses")}</h2>
                  <button
                    type="button"
                    onClick={() => openAddressModal()}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-bold text-white hover:bg-brand-dark"
                  >
                    <Plus className="h-4 w-4" />
                    {t("profile.newAddress")}
                  </button>
                </div>

                {savedAddresses.length === 0 ? (
                  <EmptyState
                    Icon={MapPin}
                    title={t("profile.noAddress")}
                    description={t("profile.noAddressText")}
                    actionLabel={t("profile.addAddress")}
                    onAction={() => openAddressModal()}
                  />
                ) : (
                  savedAddresses.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wide text-brand">
                            {entry.labelKey ? t(entry.labelKey) : entry.label || t("profile.extra", { n: entry.extraIndex })}
                          </p>
                          <p className="mt-1 flex items-start gap-2 text-sm font-semibold text-slate-900">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                            <span>{entry.street}</span>
                          </p>
                          {(entry.apartment || entry.floor || entry.intercom) && (
                            <p className="mt-1 text-xs text-slate-500">
                              {[
                                entry.apartment && t("profile.aptShort", { value: entry.apartment }),
                                entry.floor && t("profile.floorShort", { value: entry.floor }),
                                entry.intercom && t("profile.intercomShort", { value: entry.intercom }),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                          {!entry.isPrimary && (
                            <p className="mt-2 text-[11px] font-medium text-slate-400">
                              {t("profile.fromOrder")}
                            </p>
                          )}
                        </div>
                        {entry.isPrimary && (
                          <button
                            type="button"
                            onClick={() => openAddressModal(entry)}
                            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-brand hover:bg-slate-50"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            {t("profile.edit")}
                          </button>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}

            {activeTab === "settings" && (
              <form
                onSubmit={handleSaveSettings}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5"
              >
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-brand" />
                  <h2 className="text-base font-extrabold text-slate-900">{t("profile.settings")}</h2>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="grid gap-1.5">
                    <span className="text-xs font-semibold text-slate-600">{t("settings.language")}</span>
                    <LanguageSwitcher full />
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold text-slate-600">{t("auth.name")}</span>
                    <span className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand" />
                      <input
                        type="text"
                        value={settingsName}
                        onChange={(event) => setSettingsName(event.target.value)}
                        placeholder={t("profile.enterName")}
                        className="h-12 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-base outline-none ring-brand/30 focus:ring-2 md:text-sm"
                      />
                    </span>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold text-slate-600">{t("profile.phone")}</span>
                    <span className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel"
                        readOnly
                        value={formatPhoneDisplay(user?.phone || "")}
                        className="h-12 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-base text-slate-500 md:text-sm"
                      />
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={notifyOrders}
                      onChange={(event) => setNotifyOrders(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#087B51]"
                    />
                    <span>
                      <span className="block text-sm font-bold text-slate-800">{t("settings.notifyOrders")}</span>
                      <span className="block text-xs text-slate-500">{t("settings.notifyHint")}</span>
                    </span>
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="mt-4 h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  {savingSettings ? t("common.saving") : t("common.save")}
                </button>
              </form>
            )}
          </>
        )}
      </section>

      {logoutOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onClick={() => setLogoutOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-sm" onClick={(event) => event.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-800">{t("profile.logoutConfirm")}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setLogoutOpen(false)} className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-bold text-slate-700">
                {t("common.cancel")}
              </button>
              <button type="button" onClick={handleLogout} className="h-11 flex-1 rounded-xl bg-red-600 text-sm font-bold text-white">
                {t("profile.logout")}
              </button>
            </div>
          </div>
        </div>
      )}

      <AddressModal
        open={addressModalOpen}
        title={t(addressTitleKey)}
        form={addressForm}
        saving={savingAddress}
        onChange={setAddressForm}
        onClose={() => setAddressModalOpen(false)}
        onSubmit={handleSaveAddress}
      />

      <AuthLoginModal
        open={loginOpen && !isAuthenticated}
        onClose={() => setLoginOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </div>
  );
}
