import { useState, useEffect } from 'react';
import { Modal, InputNumber, message } from 'antd';
import { cashApi, ordersApi } from '../api';

export default function OpenCashGateModal({
  open,
  orderId,
  onSuccess,
  onCancel,
}) {
  const [step, setStep] = useState('confirm');
  const [openBalance, setOpenBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('confirm');
      setOpenBalance(0);
    }
  }, [open, orderId]);

  const handleOpenAndPay = async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      await cashApi.open(openBalance);
      await ordersApi.pay(orderId);
      message.success('Смена открыта, заказ оплачен');
      onSuccess?.();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'confirm') {
    return (
      <Modal
        title="Касса закрыта"
        open={open}
        onCancel={onCancel}
        onOk={() => setStep('open')}
        okText="Открыть кассу"
        cancelText="Отмена"
        destroyOnClose
      >
        Касса закрыта. Открыть смену?
      </Modal>
    );
  }

  return (
    <Modal
      title="Открыть кассовую смену"
      open={open}
      onCancel={onCancel}
      onOk={handleOpenAndPay}
      okText="Открыть и оплатить"
      cancelText="Отмена"
      confirmLoading={loading}
      destroyOnClose
    >
      <div style={{ marginBottom: 8 }}>Начальный остаток в кассе:</div>
      <InputNumber
        min={0}
        value={openBalance}
        onChange={setOpenBalance}
        addonAfter="₽"
        style={{ width: '100%' }}
      />
    </Modal>
  );
}
