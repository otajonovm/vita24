import axios from "axios";
import {
  getMockCategories,
  MOCK_BRANCHES,
} from "../lib/mockData";
import { useAdminAuth, useAuthStore, useCourierAuth, usePharmacistAuth } from "../store/useAuthStore";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 20000,
});

export function invalidPayloadError(message = "Server kutilgan javobni bermadi. Keyinroq urinib ko'ring.") {
  const error = new Error(message);
  error.code = "INVALID_RESPONSE";
  return error;
}

export function looksLikeHtml(data) {
  if (typeof data !== "string") return false;
  const trimmed = data.trim().slice(0, 48).toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || trimmed.startsWith("<?xml");
}

export function asList(value) {
  return Array.isArray(value) ? value : [];
}

function readStoredToken(key) {
  try {
    const raw =
      localStorage.getItem(key) ||
      (key === "vita24-pharmacist" ? sessionStorage.getItem(key) : null);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.state?.token || null;
  } catch {
    return null;
  }
}

client.interceptors.request.use((config) => {
  const url = String(config.url || "");
  const audience =
    config.audience ||
    (url.startsWith("/courier") ? "courier" : url.includes("branch-admin") ? "pharmacist" : url.startsWith("/admin") ? "admin" : "customer");
  const key =
    audience === "admin"
      ? "vita24-admin"
      : audience === "pharmacist"
        ? "vita24-pharmacist"
        : audience === "courier"
          ? "vita24-courier"
          : "vita24-customer";
  const store =
    audience === "admin"
      ? useAdminAuth
      : audience === "pharmacist"
        ? usePharmacistAuth
        : audience === "courier"
          ? useCourierAuth
          : useAuthStore;
  let token = store.getState().token || readStoredToken(key);
  if (
    !token &&
    (audience === "pharmacist" || url.includes("branch-admin")) &&
    useAdminAuth.getState().user?.role === "SUPER_ADMIN"
  ) {
    token = useAdminAuth.getState().token || readStoredToken("vita24-admin");
  }
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let adminRefresh = null;

function refreshAdminToken() {
  const refreshToken = useAdminAuth.getState().refreshToken;
  if (!refreshToken) {
    useAdminAuth.getState().logout();
    return Promise.resolve(null);
  }
  if (!adminRefresh) {
    adminRefresh = axios
      .post(`${import.meta.env.VITE_API_URL || "/api"}/auth/refresh`, { refreshToken })
      .then((response) => {
        const data = response.data?.data || {};
        if (!data.token || !data.refreshToken) throw new Error("refresh");
        const current = useAdminAuth.getState();
        current.setSession(data.user || current.user, data.token, { refreshToken: data.refreshToken });
        return data.token;
      })
      .catch(() => {
        useAdminAuth.getState().logout();
        return null;
      })
      .finally(() => {
        adminRefresh = null;
      });
  }
  return adminRefresh;
}

client.interceptors.response.use(
  (response) => {
    const type = String(response.headers?.["content-type"] || "");
    if (type.includes("text/html") || looksLikeHtml(response.data)) {
      return Promise.reject(invalidPayloadError());
    }
    return response;
  },
  async (error) => {
    const url = String(error.config?.url || "");
    const status = error.response?.status;
    const audience = error.config?.audience;
    const adminCall =
      audience === "admin" ||
      (url.startsWith("/admin") && audience !== "pharmacist" && audience !== "customer");
    if (
      status === 401 &&
      adminCall &&
      !error.config?._retry &&
      !url.includes("/auth/refresh") &&
      !url.includes("/auth/login")
    ) {
      error.config._retry = true;
      const token = await refreshAdminToken();
      if (token) {
        error.config.headers = error.config.headers || {};
        error.config.headers.Authorization = `Bearer ${token}`;
        return client(error.config);
      }
    }
    if (error.response?.data?.error?.code === "PASSWORD_CHANGE_REQUIRED") {
      const store = adminCall ? useAdminAuth : usePharmacistAuth;
      const current = store.getState().user;
      if (current) store.getState().setSession({ ...current, mustChangePassword: true });
    }
    if (status === 401 && audience !== "admin" && (audience === "pharmacist" || url.includes("branch-admin"))) {
      usePharmacistAuth.getState().logout();
    }
    if (status === 401 && (audience === "courier" || url.startsWith("/courier"))) {
      useCourierAuth.getState().logout();
    }
    const customerCall =
      audience === "customer" ||
      (!audience && !url.startsWith("/admin") && !url.includes("branch-admin") && url.startsWith("/customers"));
    if (status === 401 && customerCall && !url.includes("/auth/")) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

const mockOrders = [];

function unwrap(response) {
  const payload = response.data?.data ?? response.data;
  if (looksLikeHtml(payload)) throw invalidPayloadError();
  return payload;
}

function normalizeMedicine(raw, branchId) {
  const dosageMatch = String(raw.name || "").match(/(\d+\s?(mg|ml|iu|IU)?)/i);
  return {
    id: raw.id,
    slug: raw.slug || "",
    name: raw.name,
    description: raw.description || "",
    dosage: raw.dosage || raw.dosageForm || dosageMatch?.[0] || "",
    dosageUnit: raw.dosageUnit || "tabletka",
    manufacturer: raw.manufacturer || "",
    barcode: raw.barcode || "",
    ikpuCode: raw.ikpuCode || "",
    quantityInPack: Number(raw.quantityInPack) || 1,
    categoryName: raw.category?.name || raw.categoryName || "",
    isPrescription: Boolean(raw.isPrescription ?? raw.requiresPrescription),
    imageUrl: raw.imageUrl || "",
    showOnHome: Boolean(raw.showOnHome),
    matchReason: raw.matchReason || "",
    matchGroup: raw.matchGroup || "",
    categoryId: raw.categoryId || raw.category?.id || "",
    price: Number(raw.price) || 0,
    stockCount: Number(raw.stockCount ?? raw.available ?? 0),
    available: Number(raw.available ?? raw.stockCount ?? 0),
    branchId,
  };
}

function normalizeOrder(raw) {
  return {
    id: raw.id,
    orderNumber: raw.orderNumber,
    branchId: raw.branchId || raw.branch?.id,
    branch: raw.branch,
    items: raw.items || [],
    subtotal: Number(raw.subtotal || 0),
    deliveryFee: Number(raw.deliveryFee || 0),
    discount: Number(raw.discount || 0),
    totalAmount: Number(raw.totalAmount ?? (Number(raw.subtotal || 0) + Number(raw.deliveryFee || 0))),
    status: raw.status,
    deliveryType: raw.deliveryType || "DELIVERY",
    promoCode: raw.promoCode || null,
    deliveryAddress: raw.deliveryAddress,
    prescriptionUrl: raw.prescription?.fileUrl || raw.prescriptionUrl || null,
    prescription: raw.prescription || null,
    cancelReason: raw.cancelReason || null,
    createdAt: raw.createdAt,
    reservedUntil: raw.reservedUntil,
    customerName: raw.customerName,
    customerPhone: raw.customerPhone,
    payment: raw.payment,
    notes: raw.notes || "",
    pharmacistNote: raw.pharmacistNote || "",
    adminNote: raw.adminNote || "",
    refundStatus: raw.refundStatus || "NONE",
    history: raw.history || [],
    allowedStatuses: raw.allowedStatuses || [],
    undoUntil: raw.undoUntil || null,
    statusChangedAt: raw.statusChangedAt || null,
    deliveryLat: raw.deliveryLat ?? null,
    deliveryLng: raw.deliveryLng ?? null,
    courierId: raw.courierId || null,
    courierStage: raw.courierStage || null,
    courier: raw.courier || null,
    deliveryFailReason: raw.deliveryFailReason || null,
    amountDue: raw.amountDue,
    paymentMethod: raw.paymentMethod,
    prepaid: raw.prepaid,
  };
}

const useMock = import.meta.env.VITE_USE_MOCKS === "true";

async function withFallback(request, fallback, { treatEmptyAsMiss = false } = {}) {
  if (!useMock) return request();
  try {
    const data = await request();
    if (data == null) return fallback();
    if (treatEmptyAsMiss && Array.isArray(data) && data.length === 0) return fallback();
    return data;
  } catch {
    return fallback();
  }
}

function attachBranchCoords(branch) {
  const mock = MOCK_BRANCHES.find(
    (item) =>
      item.id === branch.id ||
      item.district === branch.district ||
      item.name === branch.name
  );

  return {
    ...branch,
    latitude: Number(branch.latitude ?? mock?.latitude) || null,
    longitude: Number(branch.longitude ?? mock?.longitude) || null,
    shortLabel: branch.shortLabel || mock?.shortLabel || branch.district,
    city: branch.city || mock?.city || "Toshkent",
  };
}

export async function fetchBranches() {
  const branches = await withFallback(
    async () => unwrap(await client.get("/branches")),
    () => MOCK_BRANCHES.filter((branch) => branch.isActive),
    { treatEmptyAsMiss: true }
  );

  return asList(branches).map(attachBranchCoords);
}

export async function fetchCategories(branchId = "") {
  const rows = await withFallback(
    async () =>
      unwrap(
        await client.get("/medicines/categories", {
          params: branchId ? { branchId } : {},
        })
      ),
    () => getMockCategories()
  );
  return asList(rows);
}

export async function getMedicines({
  branchId,
  search = "",
  categoryId = "",
  inStockOnly = false,
  featured = false,
  page = 1,
  limit = 48,
  sort = "default",
  signal,
} = {}) {
  const data = unwrap(
    await client.get("/medicines", {
      params: {
        ...(branchId ? { branchId } : {}),
        search,
        categoryId,
        page,
        limit,
        sort,
        inStockOnly: inStockOnly ? "true" : "false",
        ...(featured ? { featured: "true" } : {}),
      },
      timeout: 20000,
      signal,
    })
  );
  if (data == null || (typeof data !== "object" && !Array.isArray(data))) {
    throw invalidPayloadError();
  }
  const rows = asList(Array.isArray(data) ? data : data.items);
  const resolvedBranchId = branchId || data?.branchId || "";
  const items = rows.map((item) => normalizeMedicine(item, resolvedBranchId));
  items.suggestion = typeof data?.suggestion === "string" ? data.suggestion : "";
  items.suggestions = Array.isArray(data?.suggestions)
    ? data.suggestions.filter((item) => typeof item === "string" && item)
    : items.suggestion
      ? [items.suggestion]
      : [];
  items.popular = Array.isArray(data?.popular)
    ? data.popular.map((item) => normalizeMedicine(item, resolvedBranchId))
    : [];
  items.categories = Array.isArray(data?.categories) ? data.categories : [];
  items.total = Number(data?.total || items.length);
  return items;
}

export async function setMedicineHome(medicineId, showOnHome) {
  const response = await client.patch(`/admin/medicines/${medicineId}/home`, { showOnHome });
  return unwrap(response);
}

export async function fetchShowcase(branchId) {
  return unwrap(await client.get("/admin/medicines/home", { params: branchId ? { branchId } : {} }));
}

export async function reorderShowcase(ids) {
  return unwrap(await client.patch("/admin/medicines/home/order", { ids }));
}

export async function fetchMedicines(params = {}) {
  return getMedicines(params);
}

export async function suggestMedicines({ branchId, search = "", signal } = {}) {
  const data = unwrap(
    await client.get("/medicines/suggest", {
      params: { q: search, ...(branchId ? { branchId } : {}) },
      timeout: 8000,
      signal,
    })
  );
  const branch = branchId || "";
  const mapList = (rows) => (Array.isArray(rows) ? rows.map((item) => normalizeMedicine(item, branch)) : []);
  return {
    medicines: mapList(data?.medicines),
    ingredients: mapList(data?.ingredients),
    symptoms: mapList(data?.symptoms),
    suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
    popularQueries: Array.isArray(data?.popularQueries) ? data.popularQueries : [],
    popular: mapList(data?.popular),
  };
}

export async function logSearchClick({ query, medicineId, branchId }) {
  if (!query || !medicineId) return;
  await client.post("/medicines/search-click", {
    query,
    medicineId,
    ...(branchId ? { branchId } : {}),
  });
}

export async function fetchSearchAdmin() {
  return unwrap(await client.get("/admin/search", { audience: "admin" }));
}

export async function createSearchSynonym(body) {
  return unwrap(await client.post("/admin/search/synonyms", body, { audience: "admin" }));
}

export async function updateSearchSynonym(id, body) {
  return unwrap(await client.patch(`/admin/search/synonyms/${id}`, body, { audience: "admin" }));
}

export async function deleteSearchSynonym(id) {
  return unwrap(await client.delete(`/admin/search/synonyms/${id}`, { audience: "admin" }));
}

function unwrapOrderResult(data, payload) {
  const orderRaw = data?.order || data;
  const user =
    data?.user ||
    (payload
      ? {
          id: orderRaw.userId,
          name: payload.fullName || orderRaw.customerName,
          phone: payload.phone || orderRaw.customerPhone,
          role: "CUSTOMER",
        }
      : null);

  return {
    order: normalizeOrder(orderRaw),
    user,
  };
}

export async function fetchCartAvailability(branchId, ids) {
  const data = unwrap(await client.get("/medicines/availability", { params: { branchId, ids: ids.join(",") } }));
  return asList(data);
}

export async function checkPromo(code, subtotal, branchId) {
  return unwrap(await client.post("/orders/promo", { code, subtotal, branchId: branchId || null }, { audience: "customer" }));
}

export async function fetchAdminPromos() {
  return unwrap(await client.get("/admin/promos"));
}

export async function createAdminPromo(payload) {
  return unwrap(await client.post("/admin/promos", payload));
}

export async function updateAdminPromo(id, payload) {
  return unwrap(await client.patch(`/admin/promos/${id}`, payload));
}

export async function setAdminPromoActive(id, active) {
  return unwrap(await client.patch(`/admin/promos/${id}/active`, { active }));
}

export async function deleteAdminPromo(id) {
  return unwrap(await client.delete(`/admin/promos/${id}`));
}

export async function createOrder(payload) {
  try {
    return unwrapOrderResult(unwrap(await client.post("/orders", payload, { audience: "customer" })), payload);
  } catch (error) {
    const message =
      error.response?.data?.error?.message || "Buyurtma yaratilmadi. Qayta urinib ko'ring.";
    const wrapped = new Error(message);
    wrapped.response = error.response;
    throw wrapped;
  }
}

export async function cancelCustomerOrder(orderId, cancelReason) {
  return normalizeOrder(
    unwrap(
      await client.patch(
        `/orders/${orderId}/status`,
        { status: "CANCELLED", cancelReason },
        { audience: "customer" }
      )
    )
  );
}

export async function fetchSavedAddress(phone) {
  return withFallback(
    async () => unwrap(await client.get("/customers/address", { params: { phone } })),
    () => null
  );
}

export async function saveCustomerAddress(payload) {
  return withFallback(
    async () => unwrap(await client.put("/customers/address", payload)),
    () => payload
  );
}

export async function fetchNotifications() {
  return unwrap(await client.get("/customers/notifications", { audience: "customer" }));
}

export async function markNotificationsRead(id) {
  return unwrap(
    await client.post("/customers/notifications/read", id ? { id } : {}, { audience: "customer" })
  );
}

export async function fetchCustomerProfile(phone) {
  const response = await client.get("/customers/profile", { params: { phone } });
  return unwrap(response);
}

export async function updateCustomerProfile(payload) {
  const response = await client.put("/customers/profile", payload);
  return unwrap(response);
}

export async function fetchCustomerOrders(phone) {
  return withFallback(
    async () => {
      const data = unwrap(await client.get("/customers/orders", { params: { phone } }));
      return (data?.orders || []).map((order) => normalizeOrder(order));
    },
    () => []
  );
}

export async function fetchCustomerPrescriptions(phone) {
  return withFallback(
    async () => {
      const data = unwrap(await client.get("/customers/prescriptions", { params: { phone } }));
      return data?.prescriptions || [];
    },
    () => []
  );
}

function cleanParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value != null)
  );
}

export async function fetchBranchAdminOrders(branchId, params = {}) {
  const data = unwrap(
    await client.get("/branch-admin/orders", { params: cleanParams({ branchId, ...params }) })
  );
  return {
    branch: data?.branch || null,
    total: data?.total || 0,
    page: data?.page || 1,
    hasMore: Boolean(data?.hasMore),
    counts: data?.counts || {},
    orders: (data?.orders || []).map(normalizeOrder),
  };
}

export async function fetchBranchOrder(orderId, { signal } = {}) {
  return normalizeOrder(unwrap(await client.get(`/branch-admin/orders/${orderId}`, { signal })));
}

export async function fetchBranchCouriers() {
  const data = unwrap(await client.get("/branch-admin/couriers", { audience: "pharmacist" }));
  return data?.couriers || [];
}

export async function createBranchCourier(payload) {
  return unwrap(await client.post("/branch-admin/couriers", payload, { audience: "pharmacist" }));
}

export async function updateBranchCourier(id, payload) {
  return unwrap(await client.patch(`/branch-admin/couriers/${id}`, payload, { audience: "pharmacist" }));
}

export async function assignOrderCourier(orderId, courierId) {
  return normalizeOrder(unwrap(await client.patch(`/branch-admin/orders/${orderId}/courier`, { courierId }, { audience: "pharmacist" })));
}

export async function fetchHandovers() {
  const data = unwrap(await client.get("/branch-admin/handovers", { audience: "pharmacist" }));
  return data?.handovers || [];
}

export async function confirmHandover(id, note) {
  return unwrap(await client.post(`/branch-admin/handovers/${id}/confirm`, { note }, { audience: "pharmacist" }));
}

export async function disputeHandover(id, note) {
  return unwrap(await client.post(`/branch-admin/handovers/${id}/dispute`, { note }, { audience: "pharmacist" }));
}

export async function fetchCourierOrders(scope) {
  const data = unwrap(await client.get("/courier/orders", { params: { scope }, audience: "courier" }));
  return data?.orders || [];
}

export async function fetchCourierShift() {
  return unwrap(await client.get("/courier/shift", { audience: "courier" }));
}

export async function pickupCourierOrder(id) {
  return unwrap(await client.post(`/courier/orders/${id}/pickup`, {}, { audience: "courier" }));
}

export async function deliverCourierOrder(id, payload) {
  const body = new FormData();
  if (payload.method) body.append("method", payload.method);
  if (payload.collectedAmount != null && payload.collectedAmount !== "") body.append("collectedAmount", String(payload.collectedAmount));
  body.append("receiptGiven", payload.receiptGiven ? "true" : "false");
  if (payload.photo) body.append("photo", payload.photo);
  return unwrap(await client.post(`/courier/orders/${id}/deliver`, body, { audience: "courier" }));
}

export async function failCourierOrder(id, payload) {
  return unwrap(await client.post(`/courier/orders/${id}/fail`, payload, { audience: "courier" }));
}

export async function submitCourierHandover(payload) {
  return unwrap(await client.post("/courier/handover", payload, { audience: "courier" }));
}

export async function updateBranchOrderStatus(orderId, payload) {
  return normalizeOrder(unwrap(await client.patch(`/branch-admin/orders/${orderId}/status`, payload)));
}

export async function undoOrderStatus(orderId) {
  return normalizeOrder(unwrap(await client.post(`/branch-admin/orders/${orderId}/undo`)));
}

export async function markCashReceived(orderId) {
  return normalizeOrder(unwrap(await client.patch(`/branch-admin/orders/${orderId}/cash`)));
}

export async function markRefundDone(orderId, note, extra = {}) {
  const payload = typeof note === "object" && note ? note : { note, ...extra };
  const audience = payload.audience;
  return normalizeOrder(
    unwrap(
      await client.patch(
        `/branch-admin/orders/${orderId}/refund`,
        { status: "DONE", note: payload.note, transactionId: payload.transactionId },
        audience ? { audience } : {}
      )
    )
  );
}

export async function savePharmacistNote(orderId, pharmacistNote, audience) {
  return normalizeOrder(
    unwrap(
      await client.patch(
        `/branch-admin/orders/${orderId}/note`,
        { pharmacistNote },
        audience ? { audience } : {}
      )
    )
  );
}

export async function saveAdminNote(orderId, adminNote) {
  return normalizeOrder(
    unwrap(await client.patch(`/orders/${orderId}/admin-note`, { adminNote }, { audience: "admin" }))
  );
}

export async function verifyPrescription(orderId, payload, audience) {
  return normalizeOrder(
    unwrap(
      await client.patch(
        `/branch-admin/orders/${orderId}/verify-prescription`,
        payload,
        audience ? { audience } : {}
      )
    )
  );
}

export async function fetchAdminBranches() {
  return unwrap(await client.get("/admin/branches"));
}

export async function fetchAdminDashboard({ from, to, branchId } = {}) {
  return unwrap(await client.get("/admin/dashboard", { params: cleanParams({ from, to, branchId }), audience: "admin" }));
}

export async function downloadAdminReport({ kind, format, from, to, branchId }) {
  try {
    const response = await client.get(`/admin/reports/${kind}`, {
      params: cleanParams({ format, from, to, branchId }),
      audience: "admin",
      responseType: "blob",
    });
    const blob = response.data;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const match = /filename="([^"]+)"/.exec(response.headers?.["content-disposition"] || "");
    link.href = url;
    link.download = match?.[1] || `vita24-${kind}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    if (error.response?.data instanceof Blob) {
      const text = await error.response.data.text();
      try {
        error.response.data = JSON.parse(text);
      } catch {
        /* blob qoladi */
      }
    }
    throw error;
  }
}

export async function createAdminBranch(payload) {
  return unwrap(await client.post("/admin/branches", payload));
}

export async function updateAdminBranch(branchId, payload) {
  return unwrap(await client.patch(`/admin/branches/${branchId}`, payload));
}

export async function toggleAdminBranch(branchId) {
  return unwrap(await client.patch(`/admin/branches/${branchId}/toggle`));
}

export async function deleteAdminBranch(branchId) {
  return unwrap(await client.delete(`/admin/branches/${branchId}`));
}

export async function archiveAdminBranch(branchId) {
  return unwrap(await client.post(`/admin/branches/${branchId}/archive`, { confirm: true }));
}

export async function unarchiveAdminBranch(branchId) {
  return unwrap(await client.post(`/admin/branches/${branchId}/unarchive`));
}

export async function fetchPublicSettings() {
  return unwrap(await client.get("/settings"));
}

export async function fetchShopSettings() {
  return unwrap(await client.get("/admin/shop-settings"));
}

export async function saveShopSettings(payload) {
  return unwrap(await client.patch("/admin/shop-settings", payload));
}

export async function fetchLekkoSettings() {
  return unwrap(await client.get("/admin/lekko/settings"));
}

export async function saveLekkoSettings(intervalMinutes) {
  return unwrap(await client.patch("/admin/lekko/settings", { intervalMinutes }));
}

export async function fetchLekkoLogs(params = {}) {
  return unwrap(await client.get("/admin/lekko/logs", { params }));
}

export async function checkAdminLekkoKey(branchId) {
  return unwrap(await client.post(`/admin/lekko/${branchId}/check`, {}, { timeout: 30000 }));
}

export async function syncAdminLekko(branchId) {
  return unwrap(await client.post(`/admin/lekko/${branchId}/sync`, {}, { timeout: 180000 }));
}

export async function clearAdminLekkoKey(branchId) {
  return unwrap(await client.delete(`/admin/branches/${branchId}/lekko-key`, { data: { confirm: true } }));
}

export async function fetchAdminSessions() {
  return unwrap(await client.get("/auth/sessions", { audience: "admin" }));
}

export async function revokeAdminSession(sessionId) {
  return unwrap(await client.delete(`/auth/sessions/${sessionId}`, { audience: "admin" }));
}

export async function revokeAllAdminSessions() {
  return unwrap(await client.delete("/auth/sessions", { audience: "admin" }));
}

export async function logoutAdminSession() {
  try {
    await client.post("/auth/logout", {}, { audience: "admin" });
  } catch {
    /* local sessiya baribir yopiladi */
  }
}

export async function setupAdmin2fa() {
  return unwrap(await client.post("/auth/2fa/setup", {}, { audience: "admin" }));
}

export async function enableAdmin2fa(code) {
  return unwrap(await client.post("/auth/2fa/enable", { code }, { audience: "admin" }));
}

export async function disableAdmin2fa({ password, code }) {
  return unwrap(await client.post("/auth/2fa/disable", { password, code }, { audience: "admin" }));
}

export async function fetchAdminCustomers() {
  return unwrap(await client.get("/admin/customers"));
}

export async function fetchAdminCustomer(userId) {
  return unwrap(await client.get(`/admin/customers/${userId}`));
}

export async function setCustomerBlock(userId, payload) {
  return unwrap(await client.patch(`/admin/customers/${userId}/block`, payload));
}

export async function fetchPharmacists() {
  return unwrap(await client.get("/admin/pharmacists"));
}

export async function createPharmacist(payload) {
  return unwrap(await client.post("/admin/pharmacists", payload));
}

export async function updatePharmacist(userId, payload) {
  return unwrap(await client.patch(`/admin/pharmacists/${userId}`, payload));
}

export async function deletePharmacist(userId) {
  return unwrap(await client.delete(`/admin/pharmacists/${userId}`));
}

export async function setPharmacistStatus(userId, status) {
  return unwrap(await client.patch(`/admin/pharmacists/${userId}/status`, { status }));
}

export async function changeOwnPassword(payload, audience) {
  return unwrap(await client.post("/auth/change-password", payload, { audience }));
}

export async function fetchBranchStock(branchId, params = {}) {
  const search = typeof params === "string" ? params : params.search || "";
  const extra = typeof params === "string" ? {} : { ...params };
  const audience = extra.audience;
  delete extra.audience;
  delete extra.search;
  const data = unwrap(
    await client.get("/branch-admin/stock", {
      params: cleanParams({ branchId, search, ...extra }),
      ...(audience ? { audience } : {}),
    })
  );
  return {
    branch: data?.branch || null,
    total: data?.total || 0,
    page: data?.page || 1,
    hasMore: Boolean(data?.hasMore),
    lowStockCount: data?.lowStockCount || 0,
    outCount: data?.outCount || 0,
    rxCount: data?.rxCount || 0,
    stocks: data?.stocks || [],
  };
}

export async function updateBranchStock(stockId, payload) {
  const body = typeof payload === "number" ? { stockCount: payload, reason: "inventarizatsiya" } : payload;
  return unwrap(await client.patch(`/branch-admin/stock/${stockId}`, body));
}

export async function bulkUpdateBranchStock(items) {
  return unwrap(await client.patch("/branch-admin/stock/bulk", { items }));
}

export async function fetchStockMovements(stockId) {
  return unwrap(await client.get(`/branch-admin/stock/${stockId}/movements`));
}

export async function fetchPanelSummary(branchId) {
  return unwrap(await client.get("/branch-admin/summary", { params: { branchId } }));
}

export async function fetchPanelStats(branchId, range = "today") {
  return unwrap(await client.get("/branch-admin/stats", { params: { branchId, range } }));
}

export async function fetchShiftReport(branchId, since) {
  return unwrap(await client.get("/branch-admin/shift", { params: { branchId, since } }));
}

export async function setBranchOpen(branchId, isOpen) {
  return unwrap(await client.patch("/branch-admin/branch", { branchId, isOpen }));
}

export async function syncLekkoStock(branchId, { fullSync = false } = {}) {
  const response = await client.post(
    "/branch-admin/sync-lekko",
    { branchId, fullSync },
    { timeout: 120000 }
  );
  const data = unwrap(response) || {};
  return {
    ...data,
    message:
      response.data?.message ||
      "Sinxronizatsiya orqa fonda boshlandi. 1-2 daqiqadan so'ng yangilang",
  };
}

export async function uploadMedicineImage(medicineId, file, onProgress) {
  const formData = new FormData();
  formData.append("image", file);
  const response = await client.patch(`/admin/medicines/${medicineId}/image`, formData, {
    timeout: 30000,
    onUploadProgress: (event) => {
      if (!onProgress || !event.total) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    },
  });
  return unwrap(response);
}

export async function fetchAdminCatalog(params) {
  return unwrap(await client.get("/admin/medicines", { params }));
}

export async function createAdminMedicine(payload) {
  return unwrap(await client.post("/admin/medicines", payload));
}

export async function updateAdminMedicine(id, payload) {
  return unwrap(await client.patch(`/admin/medicines/${id}`, payload));
}

export async function setAdminMedicineActive(id, isActive) {
  return unwrap(await client.patch(`/admin/medicines/${id}/active`, { isActive }));
}

export async function setAdminMedicineRx(id, isPrescription) {
  return unwrap(await client.patch(`/admin/medicines/${id}/rx`, { isPrescription }));
}

export async function setAdminMedicineRxBulk(ids, isPrescription) {
  return unwrap(await client.post("/admin/medicines/rx/bulk", { ids, isPrescription }));
}

export async function fetchAdminCategories() {
  return unwrap(await client.get("/admin/medicines/categories"));
}

export async function createAdminCategory(payload) {
  return unwrap(await client.post("/admin/medicines/categories", payload));
}

export async function updateAdminCategory(id, payload) {
  return unwrap(await client.patch(`/admin/medicines/categories/${id}`, payload));
}

export async function deleteAdminCategory(id) {
  return unwrap(await client.delete(`/admin/medicines/categories/${id}`));
}

export async function previewMedicineImport(file) {
  const formData = new FormData();
  formData.append("file", file);
  return unwrap(await client.post("/admin/medicines/import/preview", formData));
}

export async function confirmMedicineImport(rows) {
  return unwrap(await client.post("/admin/medicines/import/confirm", { rows }));
}

export async function downloadMedicineExport(format) {
  const response = await client.get("/admin/medicines/export", { params: { format }, responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dorilar.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function fetchNetworkStock(params) {
  return unwrap(await client.get("/admin/stock/network", { params }));
}

export async function fetchAdminStockMovements(params) {
  return unwrap(await client.get("/admin/stock/movements", { params }));
}

export async function mockPay(orderId) {
  return normalizeOrder(
    unwrap(await client.post(`/orders/${orderId}/mock-pay`, {}, { audience: "customer" }))
  );
}

export async function requestCustomerOtp(phone) {
  return unwrap(await client.post("/auth/otp/request", { phone }));
}

export async function verifyCustomerOtp({ phone, code, fullName }) {
  return unwrap(await client.post("/auth/otp/verify", { phone, code, fullName }));
}

export async function loginWithTelegramWebApp(initData) {
  return unwrap(await client.post("/auth/telegram-webapp", { initData }));
}

export async function fetchPrescriptionLink(prescriptionId, audience = "admin") {
  return unwrap(await client.get(`/prescriptions/${prescriptionId}/link`, { audience }));
}

export async function loadPrescriptionObjectUrl(prescriptionId, audience = "customer") {
  const response = await client.get(`/prescriptions/${prescriptionId}/file`, {
    responseType: "blob",
    audience,
  });
  const blob = response.data;
  return { url: URL.createObjectURL(blob), type: blob.type || "" };
}

export async function replaceOrderPrescription(orderId, payload) {
  return normalizeOrder(
    unwrap(await client.post(`/orders/${orderId}/prescription`, payload, { audience: "customer" }))
  );
}

export async function uploadPrescription(file, onProgress) {
  const formData = new FormData();
  formData.append("file", file);
  return unwrap(
    await client.post("/prescriptions/upload", formData, {
      audience: "customer",
      timeout: 30000,
      onUploadProgress: onProgress
        ? (event) => {
            const total = Number(event.total) || 0;
            if (total > 0) onProgress(Math.round((event.loaded / total) * 100));
          }
        : undefined,
    })
  );
}

export async function fetchMedicineBySlug(slug, branchId) {
  const data = unwrap(
    await client.get(`/medicines/${encodeURIComponent(slug)}`, {
      params: branchId ? { branchId } : {},
    })
  );
  return data;
}

export async function fetchStaffOrders({ audience = "admin", ...query } = {}) {
  const data = unwrap(await client.get("/orders", { params: cleanParams(query), audience }));
  const items = Array.isArray(data) ? data : data?.items || [];
  return {
    items: items.map(normalizeOrder),
    total: Array.isArray(data) ? items.length : Number(data?.total || 0),
    page: Number(data?.page || 1),
    limit: Number(data?.limit || items.length || 20),
  };
}

export async function fetchStaffOrder(orderId) {
  return normalizeOrder(unwrap(await client.get(`/orders/${orderId}`, { audience: "admin" })));
}

export async function fetchAdminAudit(params = {}) {
  return unwrap(await client.get("/admin/audit", { params: { page: 1, limit: 20, ...params }, audience: "admin" }));
}

export async function staffUpdateOrderStatus(orderId, status, cancelReason = "", audience = "admin") {
  return normalizeOrder(
    unwrap(
      await client.patch(
        `/orders/${orderId}/status`,
        { status, reason: cancelReason, cancelReason },
        { audience }
      )
    )
  );
}

export async function staffLogin({ phone, password, totp }) {
  const data = unwrap(await client.post("/auth/login", { phone, password, ...(totp ? { totp } : {}) }));
  return {
    token: data?.token || null,
    refreshToken: data?.refreshToken || null,
    requires2fa: Boolean(data?.requires2fa),
    tokenType: data?.tokenType || "Bearer",
    expiresIn: data?.expiresIn || null,
    user: data?.user || null,
  };
}

export default client;
