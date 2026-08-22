export function formatSom(value) {
  const amount = Math.round(Number(value) || 0);
  const grouped = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped} so'm`;
}

export function formatReservation(msLeft) {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export const STATUS_LABELS = {
  PENDING_PRESCRIPTION: "Retsept kutilmoqda",
  PENDING_BRANCH: "Filial ko'rigida",
  WAITING_PAYMENT: "To'lov kutilmoqda",
  PAID: "To'langan",
  DELIVERING: "Yetkazilmoqda",
  COMPLETED: "Yakunlangan",
  CANCELLED: "Bekor qilingan",
};
