import { cashApi, ordersApi } from '../api';

export async function payOrderWithCashCheck(orderId) {
  const { data: status } = await cashApi.status();
  if (!status.is_open) {
    return { paid: false, needsCash: true };
  }
  await ordersApi.pay(orderId);
  return { paid: true, needsCash: false };
}
