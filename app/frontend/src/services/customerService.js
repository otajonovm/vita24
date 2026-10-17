import {
  fetchCustomerOrders,
  fetchCustomerPrescriptions,
  fetchCustomerProfile,
  saveCustomerAddress,
  updateCustomerProfile,
} from "./api";

export const customerService = {
  getProfile(phone) {
    return fetchCustomerProfile(phone);
  },

  updateProfile(payload) {
    return updateCustomerProfile(payload);
  },

  getOrders(phone) {
    return fetchCustomerOrders(phone);
  },

  getPrescriptions(phone) {
    return fetchCustomerPrescriptions(phone);
  },

  saveAddress(payload) {
    return saveCustomerAddress(payload);
  },

  async loadDashboard(phone) {
    const [profile, orders, prescriptions] = await Promise.all([
      fetchCustomerProfile(phone),
      fetchCustomerOrders(phone),
      fetchCustomerPrescriptions(phone),
    ]);

    return { profile, orders, prescriptions };
  },
};

export default customerService;
