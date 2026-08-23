import axios from "axios";
import {
  getMockCategories,
  getMockMedicines,
  MOCK_BRANCHES,
} from "../lib/mockData";

const client = axios.create({
  baseURL: "http://localhost:5000/api",
  timeout: 5000,
});

const mockOrders = [];

function unwrap(response) {
  return response.data?.data ?? response.data;
}

function normalizeMedicine(raw, branchId) {
  const dosageMatch = String(raw.name || "").match(/(\d+\s?(mg|ml|iu|IU)?)/i);
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || "",
    dosage: raw.dosage || dosageMatch?.[0] || "",
    dosageUnit: raw.dosageUnit || "tabletka",
    isPrescription: Boolean(raw.isPrescription ?? raw.requiresPrescription),
    imageUrl: raw.imageUrl || "",
    categoryId: raw.categoryId || raw.category?.id || "",
    price: Number(raw.price) || 0,
    stockCount: Number(raw.stockCount ?? raw.available ?? 0),
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
    totalAmount: Number(raw.totalAmount ?? raw.subtotal ?? 0),
    status: raw.status,
    deliveryAddress: raw.deliveryAddress,
    prescriptionUrl: raw.prescription?.fileUrl || raw.prescriptionUrl || null,
    prescription: raw.prescription || null,
    cancelReason: raw.cancelReason || null,
    createdAt: raw.createdAt,
    reservedUntil: raw.reservedUntil,
    customerName: raw.customerName,
    customerPhone: raw.customerPhone,
    payment: raw.payment,
  };
}

async function withFallback(request, fallback) {
  try {
    const data = await request();
    if (data == null) return fallback();
    return data;
  } catch {
    return fallback();
  }
}

export async function fetchBranches() {
  return withFallback(
    async () => unwrap(await client.get("/branches")),
    () => MOCK_BRANCHES.filter((branch) => branch.isActive)
  );
}

export async function fetchCategories() {
  return withFallback(
    async () => unwrap(await client.get("/medicines/categories")),
    () => getMockCategories()
  );
}

export async function fetchMedicines({ branchId, search = "", categoryId = "" } = {}) {
  return withFallback(
    async () => {
      const data = unwrap(
        await client.get("/medicines", {
          params: { branchId, search, categoryId },
        })
      );
      return (data || []).map((item) => normalizeMedicine(item, branchId));
    },
    () => getMockMedicines(branchId, search, categoryId)
  );
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

export async function createOrder(payload) {
  return withFallback(
    async () => unwrapOrderResult(unwrap(await client.post("/orders", payload)), payload),
    () => {
      const hasRx = payload.items.some(
        (item) => item.isPrescription || item.requiresPrescription
      );
      const prescriptionUrl = payload.prescriptionUrl || payload.prescription?.fileUrl;
      if (hasRx && !prescriptionUrl) {
        throw new Error("Retseptli dorilar uchun retsept yuklash majburiy");
      }

      const totalAmount = payload.items.reduce(
        (sum, item) => sum + (item.unitPrice || 0) * item.quantity,
        0
      );

      const user = {
        id: `user-${String(payload.phone).replace(/\D/g, "")}`,
        name: payload.fullName,
        phone: payload.phone,
        role: "CUSTOMER",
        createdAt: new Date().toISOString(),
      };

      const order = normalizeOrder({
        id: `order-${Date.now()}`,
        orderNumber: `VT-MOCK-${Date.now().toString(36).toUpperCase()}`,
        status: hasRx ? "PENDING_PRESCRIPTION" : "WAITING_PAYMENT",
        customerName: payload.fullName,
        customerPhone: payload.phone,
        deliveryAddress: payload.deliveryAddress,
        lat: payload.lat,
        lng: payload.lng,
        street: payload.street,
        apartment: payload.apartment,
        floor: payload.floor,
        intercom: payload.intercom,
        subtotal: totalAmount,
        reservedUntil: new Date(Date.now() + 10 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        branchId: payload.branchId,
        userId: user.id,
        branch: MOCK_BRANCHES.find((branch) => branch.id === payload.branchId),
        items: payload.items.map((item, index) => ({
          id: `item-${index}`,
          ...item,
        })),
        prescription: prescriptionUrl
          ? { fileUrl: prescriptionUrl, fileName: payload.prescription?.fileName || "retsept" }
          : null,
        cancelReason: null,
        payment: {
          id: `pay-${Date.now()}`,
          amount: totalAmount,
          provider: "MOCK",
          status: "PENDING",
        },
      });

      mockOrders.unshift(order);
      return { order, user };
    }
  );
}

export async function fetchOrders(branchId) {
  return withFallback(
    async () => {
      const data = unwrap(await client.get("/orders", { params: { branchId } }));
      return (data || []).map(normalizeOrder);
    },
    () =>
      mockOrders.filter((order) => !branchId || order.branchId === branchId)
  );
}

export async function updateOrderStatus(orderId, status, cancelReason = "") {
  return withFallback(
    async () =>
      normalizeOrder(
        unwrap(
          await client.patch(`/orders/${orderId}/status`, { status, cancelReason })
        )
      ),
    () => {
      const order = mockOrders.find((item) => item.id === orderId);
      if (!order) throw new Error("Buyurtma topilmadi");
      order.status = status;
      order.cancelReason = cancelReason || null;
      if (status === "CANCELLED" && order.prescription) {
        order.prescription.status = "REJECTED";
      }
      if (status === "WAITING_PAYMENT" && order.prescription) {
        order.prescription.status = "APPROVED";
      }
      return { ...order };
    }
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

export async function mockPay(orderId) {
  return withFallback(
    async () => normalizeOrder(unwrap(await client.post(`/orders/${orderId}/mock-pay`))),
    () => {
      const order = mockOrders.find((item) => item.id === orderId);
      if (!order) throw new Error("Buyurtma topilmadi");
      if (order.status === "PAID") return { ...order };
      if (!["WAITING_PAYMENT", "PENDING_BRANCH"].includes(order.status)) {
        throw new Error("To'lov faqat tasdiqlangan buyurtmalar uchun");
      }
      order.status = "PAID";
      if (order.payment) order.payment.status = "COMPLETED";
      return { ...order };
    }
  );
}

export default client;
