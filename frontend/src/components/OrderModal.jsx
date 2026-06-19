import { useState, useEffect } from 'react';
import {
  Modal, Input, Button, Space, Typography, Row, Col, Divider, message,
} from 'antd';
import {
  PlusOutlined, MinusOutlined, CheckOutlined, PrinterOutlined, SearchOutlined,
} from '@ant-design/icons';
import { ordersApi, productsApi, receiptApi } from '../api';
import { payOrderWithCashCheck } from '../utils/payOrder';
import OpenCashGateModal from './OpenCashGateModal';
import ReceiptModal from './ReceiptModal';

const { Title, Text } = Typography;

export default function OrderModal({
  open,
  table,
  order,
  onClose,
  onUpdated,
}) {
  const [comment, setComment] = useState('');
  const [currentOrder, setCurrentOrder] = useState(null);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [cashGateOpen, setCashGateOpen] = useState(false);

  useEffect(() => {
    if (open) {
      productsApi.getSellable().then((res) => setProducts(res.data));
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setCurrentOrder(order);
      setComment(order?.comment || '');
      setSearch('');
    }
  }, [open, order]);

  const popularProducts = products.filter((p) =>
    p.is_kit || p.category === 'snack'
  ).slice(0, 12);

  const filteredProducts = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const createOrder = async () => {
    setSaving(true);
    try {
      const res = await ordersApi.create({
        table_num: table.number,
        comment: comment.trim() || null,
        items: [],
      });
      setCurrentOrder(res.data);
      message.success('Счёт открыт');
      onUpdated?.();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка создания заказа');
    } finally {
      setSaving(false);
    }
  };

  const addProduct = async (productId) => {
    if (!currentOrder) {
      message.warning('Сначала откройте счёт');
      return;
    }
    try {
      const res = await ordersApi.addItem(currentOrder.id, { product_id: productId, quantity: 1 });
      setCurrentOrder(res.data);
      onUpdated?.();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка добавления');
    }
  };

  const changeQuantity = async (item, delta) => {
    const newQty = item.quantity + delta;
    try {
      const res = await ordersApi.updateItem(currentOrder.id, item.id, { quantity: newQty });
      setCurrentOrder(res.data);
      onUpdated?.();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    }
  };

  const handlePay = async () => {
    try {
      const result = await payOrderWithCashCheck(currentOrder.id);
      if (result.needsCash) {
        setCashGateOpen(true);
        return;
      }
      message.success('Заказ оплачен');
      onClose();
      onUpdated?.();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка оплаты');
    }
  };

  const handleCashGateSuccess = () => {
    setCashGateOpen(false);
    onClose();
    onUpdated?.();
  };

  const handlePrint = async () => {
    setReceiptOpen(true);
    setReceiptLoading(true);
    try {
      const res = await receiptApi.get(currentOrder.id);
      setReceipt(res.data);
    } catch {
      message.error('Ошибка загрузки чека');
    } finally {
      setReceiptLoading(false);
    }
  };

  const mainItems = currentOrder?.items?.filter((i) => !i.is_kit_component) || [];

  return (
    <>
      <Modal
        title={
          currentOrder
            ? `Стол ${table?.number} — Заказ №${currentOrder.id}`
            : `Стол ${table?.number} — Новый счёт`
        }
        open={open}
        onCancel={onClose}
        footer={null}
        width={720}
        destroyOnClose
      >
        {!currentOrder ? (
          <>
            <Input.TextArea
              placeholder="Комментарий: парень в кепке, девушка у окна..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              style={{ marginBottom: 16 }}
            />
            <Button type="primary" onClick={createOrder} loading={saving} block>
              Открыть счёт
            </Button>
          </>
        ) : (
          <>
            {currentOrder.comment && (
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                {currentOrder.comment}
              </Text>
            )}

            <Title level={5}>Позиции</Title>
            {mainItems.length === 0 ? (
              <Text type="secondary">Пока пусто — добавьте товары ниже</Text>
            ) : (
              mainItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <span>{item.product_name}</span>
                  <Space>
                    <Button
                      size="small"
                      icon={<MinusOutlined />}
                      onClick={() => changeQuantity(item, -1)}
                    />
                    <Text>{item.quantity}</Text>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => changeQuantity(item, 1)} />
                    <Text strong>{item.total.toFixed(0)} ₽</Text>
                  </Space>
                </div>
              ))
            )}

            <Divider />

            <Title level={5}>Быстрое добавление</Title>
            <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
              {popularProducts.map((p) => (
                <Col key={p.id} span={8}>
                  <Button block onClick={() => addProduct(p.id)} style={{ height: 'auto', padding: '8px 4px' }}>
                    <div style={{ fontSize: 12, whiteSpace: 'normal', lineHeight: 1.3 }}>{p.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{p.retail_price} ₽</div>
                  </Button>
                </Col>
              ))}
            </Row>

            <Input
              prefix={<SearchOutlined />}
              placeholder="Поиск товара..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            {search && (
              <div style={{ maxHeight: 120, overflow: 'auto', marginBottom: 16 }}>
                {filteredProducts.slice(0, 8).map((p) => (
                  <Button
                    key={p.id}
                    type="link"
                    block
                    style={{ textAlign: 'left' }}
                    onClick={() => { addProduct(p.id); setSearch(''); }}
                  >
                    {p.name} — {p.retail_price} ₽
                  </Button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title level={4} style={{ margin: 0 }}>
                Итого: {currentOrder.total.toFixed(0)} ₽
              </Title>
              <Space>
                <Button icon={<PrinterOutlined />} onClick={handlePrint}>Чек</Button>
                <Button type="primary" icon={<CheckOutlined />} onClick={handlePay}>
                  Оплатить
                </Button>
              </Space>
            </div>
          </>
        )}
      </Modal>

      <ReceiptModal
        open={receiptOpen}
        receipt={receipt}
        loading={receiptLoading}
        onClose={() => { setReceiptOpen(false); setReceipt(null); }}
      />

      <OpenCashGateModal
        open={cashGateOpen}
        orderId={currentOrder?.id}
        onSuccess={handleCashGateSuccess}
        onCancel={() => setCashGateOpen(false)}
      />
    </>
  );
}
