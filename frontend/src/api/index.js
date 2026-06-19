import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username, password) => {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    return api.post('/auth/login', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  },
};

export const productsApi = {
  list: (params) => api.get('/products', { params }),
  get: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
  batches: (id) => api.get(`/products/${id}/batches`),
  priceHistory: (id) => api.get(`/products/${id}/price-history`),
  availableComponents: () => api.get('/products/available-components'),
  getSellable: () => api.get('/products/sellable'),
  byBarcode: (barcode) => api.get(`/products/by-barcode/${encodeURIComponent(barcode)}`),
  addBarcode: (id, data) => api.post(`/products/${id}/barcodes`, data),
  deleteBarcode: (id, barcodeId) => api.delete(`/products/${id}/barcodes/${barcodeId}`),
  setPrimaryBarcode: (id, barcodeId) => api.post(`/products/${id}/barcodes/${barcodeId}/primary`),
  generateBarcode: () => api.get('/products/generate-barcode'),
};

export const invoicesApi = {
  list: () => api.get('/invoices'),
  get: (id) => api.get(`/invoices/${id}`),
  create: (data) => api.post('/invoices', data),
};

export const ordersApi = {
  list: (params) => api.get('/orders', { params }),
  get: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data),
  pay: (id) => api.post(`/orders/${id}/pay`),
  cancel: (id) => api.post(`/orders/${id}/cancel`),
  scan: (data) => api.post('/orders/scan', data),
  scanStatus: (id) => api.get(`/orders/${id}/scan-status`),
  addItem: (orderId, data) => api.post(`/orders/${orderId}/items`, data),
  updateItem: (orderId, itemId, data) => api.patch(`/orders/${orderId}/items/${itemId}`, data),
};

export const tablesApi = {
  list: () => api.get('/tables'),
  getOrders: (id) => api.get(`/tables/${id}/orders`),
  create: (data) => api.post('/tables', data),
  update: (id, data) => api.put(`/tables/${id}`, data),
  delete: (id) => api.delete(`/tables/${id}`),
};

export const receivingApi = {
  listSessions: () => api.get('/receiving/sessions'),
  getSession: (id) => api.get(`/receiving/sessions/${id}`),
  createSession: (data) => api.post('/receiving/sessions', data),
  scan: (data) => api.post('/receiving/scan', data),
  addItem: (sessionId, data) => api.post(`/receiving/sessions/${sessionId}/add-item`, data),
  updateItem: (sessionId, itemId, data) => api.patch(`/receiving/sessions/${sessionId}/items/${itemId}`, data),
  deleteItem: (sessionId, itemId) => api.delete(`/receiving/sessions/${sessionId}/items/${itemId}`),
  linkItem: (sessionId, data) => api.post(`/receiving/sessions/${sessionId}/link-item`, data),
  confirm: (sessionId) => api.post(`/receiving/sessions/${sessionId}/confirm`),
};

export const receiptApi = {
  get: (orderId) => api.get(`/receipt/order/${orderId}`),
  getFull: (orderId) => api.get(`/receipt/order/${orderId}/full`),
};

export const cashApi = {
  status: () => api.get('/cash/status'),
  open: (balance) => api.post('/cash/open', { balance }),
  close: (data) => api.post('/cash/close', data),
};

export const reportsApi = {
  sales: (params) => api.get('/reports/sales', { params }),
  topProducts: (params) => api.get('/reports/top-products', { params }),
  revenueByDay: (params) => api.get('/reports/revenue-by-day', { params }),
  dashboard: () => api.get('/reports/dashboard'),
};

export default api;
