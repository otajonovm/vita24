const TRANSITIONS = {
  PENDING_PRESCRIPTION: {
    // Keyingi holat faqat retsept tasdiqlash orqali (verify-prescription)
    CANCELLED: ["BRANCH_ADMIN", "SUPER_ADMIN", "CUSTOMER"],
  },
  PENDING_BRANCH: {
    CANCELLED: ["BRANCH_ADMIN", "SUPER_ADMIN", "CUSTOMER"],
  },
  WAITING_PAYMENT: {
    CANCELLED: ["BRANCH_ADMIN", "SUPER_ADMIN", "CUSTOMER"],
  },
  PAID: {
    PREPARING: ["BRANCH_ADMIN"],
    CANCELLED: ["BRANCH_ADMIN", "SUPER_ADMIN", "CUSTOMER"],
  },
  PREPARING: {
    READY: ["BRANCH_ADMIN"],
    CANCELLED: ["BRANCH_ADMIN", "SUPER_ADMIN"],
  },
  READY: {
    DELIVERING: ["BRANCH_ADMIN", "COURIER"],
    COMPLETED: ["BRANCH_ADMIN"],
    CANCELLED: ["BRANCH_ADMIN", "SUPER_ADMIN"],
  },
  DELIVERING: {
    COMPLETED: ["BRANCH_ADMIN", "COURIER"],
    CANCELLED: ["BRANCH_ADMIN", "SUPER_ADMIN"],
  },
};

const TERMINAL = new Set(["COMPLETED", "CANCELLED"]);

function resolveNextStatus(from, requested) {
  if (
    requested === "REJECTED" &&
    (from === "PENDING_PRESCRIPTION" || from === "PENDING_BRANCH")
  ) {
    return "CANCELLED";
  }
  return requested;
}

function unpaidCash(payment) {
  const provider = String(payment?.provider || "").toUpperCase();
  if (provider !== "CASH" && provider !== "CARD_TERMINAL") return false;
  return String(payment?.status || "").toUpperCase() !== "COMPLETED";
}

function canTransition({ from, to, role, deliveryType, payment, userId, courierId, collected }) {
  const next = resolveNextStatus(from, to);

  // Super admin: faqat yakunlanmagan holatdan CANCELLED. Kuryerlar bilan ishlamaydi.
  if (role === "SUPER_ADMIN") {
    if (next !== "CANCELLED") return false;
    if (TERMINAL.has(from)) return false;
    return true;
  }

  if (next === "COMPLETED" && unpaidCash(payment) && !collected) return false;
  if (from === "READY" && next === "COMPLETED" && deliveryType !== "PICKUP") return false;
  if (from === "READY" && next === "DELIVERING" && deliveryType === "PICKUP") return false;
  if (role === "COURIER") {
    if (deliveryType === "PICKUP") return false;
    if (!userId || !courierId || userId !== courierId) return false;
  }
  const roles = TRANSITIONS[from]?.[next];
  return Boolean(roles && roles.includes(role));
}

function allowedTransitions({ from, role, deliveryType, payment, userId, courierId, collected }) {
  if (role === "SUPER_ADMIN") {
    return canTransition({ from, to: "CANCELLED", role, deliveryType, payment }) ? ["CANCELLED"] : [];
  }
  const requested = Object.keys(TRANSITIONS[from] || {});
  if (from === "PENDING_PRESCRIPTION" || from === "PENDING_BRANCH") requested.push("REJECTED");
  return requested.filter((to) => canTransition({ from, to, role, deliveryType, payment, userId, courierId, collected }));
}

function customerCanCancel(from) {
  return canTransition({
    from,
    to: "CANCELLED",
    role: "CUSTOMER",
    deliveryType: "DELIVERY",
  });
}

function describeTransition(from, requested) {
  const next = resolveNextStatus(from, requested);
  const rejected =
    requested === "REJECTED" ||
    (next === "CANCELLED" &&
      (from === "PENDING_PRESCRIPTION" || from === "PENDING_BRANCH"));
  return { status: next, rejected };
}

function statusSuccessMessage(status) {
  switch (status) {
    case "WAITING_PAYMENT":
      return "Buyurtma tasdiqlandi, to'lov kutilmoqda";
    case "PAID":
      return "To'lov qabul qilindi";
    case "PREPARING":
      return "Yig'ish boshlandi";
    case "READY":
      return "Buyurtma tayyor";
    case "DELIVERING":
      return "Buyurtma yetkazilmoqda";
    case "COMPLETED":
      return "Buyurtma yakunlandi";
    case "CANCELLED":
      return "Buyurtma bekor qilindi";
    default:
      return "Holat yangilandi";
  }
}

module.exports = {
  TRANSITIONS,
  resolveNextStatus,
  unpaidCash,
  canTransition,
  customerCanCancel,
  allowedTransitions,
  describeTransition,
  statusSuccessMessage,
};
