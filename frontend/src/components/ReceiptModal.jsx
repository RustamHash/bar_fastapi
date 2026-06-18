import { Modal, Button, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const UNIT_LABELS = { liter: 'л', piece: 'шт', kg: 'кг' };

export default function ReceiptModal({ open, receipt, loading, onClose }) {
  if (!receipt && !loading) return null;

  return (
    <Modal
      title="Чек"
      open={open}
      onCancel={onClose}
      width={400}
      footer={[
        <Button key="close" onClick={onClose} className="no-print">
          Закрыть
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          onClick={() => window.print()}
          className="no-print"
        >
          Печать
        </Button>,
      ]}
    >
      {loading ? (
        <Spin />
      ) : (
        <div className="receipt-print-area receipt-content">
          <div className="receipt-header">
            <h2>BEERPUB</h2>
            <div>{dayjs(receipt.created_at).format('DD.MM.YYYY HH:mm')}</div>
            <div>Заказ №{receipt.order_id}</div>
            <div>Стол: {receipt.table_num}</div>
          </div>
          <div className="receipt-divider" />
          {receipt.items.map((item, idx) => (
            <div key={idx}>
              <div className="receipt-item">
                <span>{item.name}</span>
              </div>
              <div className="receipt-item">
                <span>
                  {item.quantity} {UNIT_LABELS[item.unit] || item.unit} × {item.price.toFixed(2)} ₽
                </span>
                <span>{item.total.toFixed(2)} ₽</span>
              </div>
            </div>
          ))}
          <div className="receipt-divider" />
          {receipt.discount > 0 && (
            <div className="receipt-item">
              <span>Скидка</span>
              <span>-{receipt.discount.toFixed(2)} ₽</span>
            </div>
          )}
          <div className="receipt-total">ИТОГО: {receipt.total.toFixed(2)} ₽</div>
          <div className="receipt-footer">Спасибо за заказ!</div>
        </div>
      )}
    </Modal>
  );
}
