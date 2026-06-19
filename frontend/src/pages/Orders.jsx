import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Tag, Space, Typography, Select, Modal, InputNumber, message, Popconfirm,
  Progress, Drawer,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, PrinterOutlined,
  ScanOutlined, EyeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { ordersApi, productsApi, receiptApi } from '../api';
import ReceiptModal from '../components/ReceiptModal';
import { BarcodeInput } from '../components/BarcodeInput';
import { playSound } from '../utils/sounds';

const { Title } = Typography;

const STATUS_LABELS = {
  open: { text: 'Открыт', color: 'blue' },
  paid: { text: 'Оплачен', color: 'green' },
  cancelled: { text: 'Отменён', color: 'red' },
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tableNum, setTableNum] = useState(1);
  const [orderItems, setOrderItems] = useState([{ key: 1, product_id: null, quantity: 1 }]);
  const [creating, setCreating] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [scanStatus, setScanStatus] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const res = await ordersApi.list(params);
      setOrders(res.data);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
    productsApi.getSellable().then((res) => setProducts(res.data));
  }, [fetchOrders]);

  const addItem = () => {
    setOrderItems([...orderItems, { key: Date.now(), product_id: null, quantity: 1 }]);
  };

  const removeItem = (key) => {
    if (orderItems.length > 1) {
      setOrderItems(orderItems.filter((i) => i.key !== key));
    }
  };

  const updateItem = (key, field, value) => {
    setOrderItems(orderItems.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  };

  const calcTotal = () => {
    return orderItems.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.product_id);
      return sum + (product ? product.retail_price * item.quantity : 0);
    }, 0);
  };

  const handleCreate = async () => {
    const items = orderItems.filter((i) => i.product_id && i.quantity > 0);
    if (!items.length) {
      message.error('Добавьте хотя бы одну позицию');
      return;
    }
    setCreating(true);
    try {
      await ordersApi.create({
        table_num: String(tableNum),
        items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      });
      message.success('Заказ создан');
      setModalOpen(false);
      setOrderItems([{ key: 1, product_id: null, quantity: 1 }]);
      fetchOrders();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка создания заказа');
    } finally {
      setCreating(false);
    }
  };

  const handlePay = async (id) => {
    try {
      await ordersApi.pay(id);
      message.success('Заказ оплачен');
      fetchOrders();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    }
  };

  const handleCancel = async (id) => {
    try {
      await ordersApi.cancel(id);
      message.success('Заказ отменён');
      fetchOrders();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    }
  };

  const handlePrint = async (orderId) => {
    setReceiptOpen(true);
    setReceiptLoading(true);
    try {
      const res = await receiptApi.get(orderId);
      setReceipt(res.data);
    } catch {
      message.error('Ошибка загрузки чека');
    } finally {
      setReceiptLoading(false);
    }
  };

  const openOrderView = async (orderId) => {
    setViewLoading(true);
    setPickMode(false);
    try {
      const res = await ordersApi.get(orderId);
      setViewOrder(res.data);
      const statusRes = await ordersApi.scanStatus(orderId);
      setScanStatus(statusRes.data);
    } catch {
      message.error('Ошибка загрузки заказа');
    } finally {
      setViewLoading(false);
    }
  };

  const startPickMode = async () => {
    if (!viewOrder) return;
    setPickMode(true);
    const statusRes = await ordersApi.scanStatus(viewOrder.id);
    setScanStatus(statusRes.data);
  };

  const handleOrderScan = async (barcode) => {
    if (!viewOrder) return;
    try {
      const res = await ordersApi.scan({ order_id: viewOrder.id, barcode });
      const data = res.data;
      if (!data.in_order) {
        playSound('error');
        message.warning(`${data.product_name} — не в заказе`);
      } else if (data.order_complete) {
        playSound('success');
        message.success('Заказ полностью собран!');
      } else {
        playSound('success');
        message.info(`${data.product_name}: ${data.scanned} / ${data.scanned + data.need}`);
      }
      const statusRes = await ordersApi.scanStatus(viewOrder.id);
      setScanStatus(statusRes.data);
      const orderRes = await ordersApi.get(viewOrder.id);
      setViewOrder(orderRes.data);
      fetchOrders();
    } catch (err) {
      playSound('error');
      message.error(err.response?.data?.detail || 'Ошибка сканирования');
    }
  };

  const calcPickProgress = () => {
    if (!scanStatus?.items?.length) return 0;
    const complete = scanStatus.items.filter((i) => i.complete).length;
    return Math.round(complete / scanStatus.items.length * 100);
  };

  const columns = [
    { title: '№', dataIndex: 'id', width: 60 },
    { title: 'Стол', dataIndex: 'table_num', width: 60 },
    { title: 'Позиций', dataIndex: 'items_count', width: 80 },
    {
      title: 'Сумма',
      dataIndex: 'total',
      render: (v) => `${v.toFixed(2)} ₽`,
    },
    {
      title: 'Себестоимость',
      dataIndex: 'total_cost',
      render: (v) => `${v.toFixed(2)} ₽`,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      render: (s) => {
        const st = STATUS_LABELS[s] || { text: s, color: 'default' };
        return <Tag color={st.color}>{st.text}</Tag>;
      },
    },
    {
      title: 'Создан',
      dataIndex: 'created_at',
      render: (v) => dayjs(v).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: 'Действия',
      render: (_, record) => (
        <Space>
          {record.status === 'open' && (
            <>
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => handlePay(record.id)}
              >
                Оплатить
              </Button>
              <Popconfirm title="Отменить заказ?" onConfirm={() => handleCancel(record.id)}>
                <Button size="small" danger icon={<CloseOutlined />}>
                  Отменить
                </Button>
              </Popconfirm>
            </>
          )}
          <Button
            size="small"
            icon={<PrinterOutlined />}
            onClick={() => handlePrint(record.id)}
          >
            Чек
          </Button>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => openOrderView(record.id)}
          >
            Просмотр
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Заказы</Title>
        <Space>
          <Select
            allowClear
            placeholder="Статус"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'open', label: 'Открытые' },
              { value: 'paid', label: 'Оплаченные' },
              { value: 'cancelled', label: 'Отменённые' },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Новый заказ
          </Button>
        </Space>
      </div>

      <Table dataSource={orders} columns={columns} rowKey="id" loading={loading} />

      <Modal
        title="Новый заказ"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        width={600}
        okText="Создать заказ"
      >
        <div style={{ marginBottom: 16 }}>
          <span style={{ marginRight: 8 }}>Стол:</span>
          <InputNumber min={1} value={tableNum} onChange={setTableNum} />
        </div>
        {orderItems.map((item) => (
          <Space key={item.key} style={{ display: 'flex', marginBottom: 8 }}>
            <Select
              showSearch
              style={{ width: 280 }}
              placeholder="Выберите товар"
              optionFilterProp="label"
              value={item.product_id}
              onChange={(v) => updateItem(item.key, 'product_id', v)}
              options={products.map((p) => ({
                value: p.id,
                label: `${p.name} — ${p.retail_price} ₽`,
              }))}
            />
            <InputNumber
              min={0.01}
              step={1}
              value={item.quantity}
              onChange={(v) => updateItem(item.key, 'quantity', v)}
            />
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeItem(item.key)}
            />
          </Space>
        ))}
        <Button type="dashed" icon={<PlusOutlined />} onClick={addItem} block>
          Добавить позицию
        </Button>
        <div style={{ marginTop: 16, textAlign: 'right', fontSize: 16, fontWeight: 'bold' }}>
          Итого: {calcTotal().toFixed(2)} ₽
        </div>
      </Modal>

      <ReceiptModal
        open={receiptOpen}
        receipt={receipt}
        loading={receiptLoading}
        onClose={() => { setReceiptOpen(false); setReceipt(null); }}
      />

      <Drawer
        title={viewOrder ? `Заказ #${viewOrder.id} — стол ${viewOrder.table_num}` : 'Заказ'}
        open={!!viewOrder}
        onClose={() => { setViewOrder(null); setPickMode(false); setScanStatus(null); }}
        width={600}
        loading={viewLoading}
        extra={
          viewOrder?.status === 'open' && !pickMode ? (
            <Button type="primary" icon={<ScanOutlined />} onClick={startPickMode}>
              Режим сборки
            </Button>
          ) : null
        }
      >
        {viewOrder && (
          <>
            {pickMode && (
              <div style={{ marginBottom: 16 }}>
                <BarcodeInput onScan={handleOrderScan} />
                <Progress percent={calcPickProgress()} style={{ marginTop: 12 }} />
              </div>
            )}

            <Table
              dataSource={(pickMode ? scanStatus?.items : viewOrder.items.filter((i) => !i.is_kit_component || i.show_in_order)) || []}
              rowKey={(r) => r.id || r.product_name}
              pagination={false}
              size="small"
              columns={pickMode ? [
                { title: 'Товар', dataIndex: 'product_name' },
                {
                  title: 'Прогресс',
                  render: (_, r) => {
                    const color = r.complete ? 'green' : r.scanned_quantity > 0 ? 'gold' : 'default';
                    return (
                      <Tag color={color}>
                        {r.scanned_quantity} / {r.quantity}
                      </Tag>
                    );
                  },
                },
              ] : [
                { title: 'Товар', dataIndex: 'product_name' },
                { title: 'Кол-во', dataIndex: 'quantity' },
                { title: 'Цена', dataIndex: 'price', render: (v) => `${v} ₽` },
                { title: 'Сумма', dataIndex: 'total', render: (v) => `${v} ₽` },
              ]}
            />

            {!pickMode && (
              <div style={{ marginTop: 16, textAlign: 'right', fontWeight: 'bold' }}>
                Итого: {viewOrder.total.toFixed(2)} ₽
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
