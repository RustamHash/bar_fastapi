import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Tag, Space, Typography, Select, Modal, InputNumber, message, Tooltip,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, PrinterOutlined, EyeOutlined, EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { ordersApi, productsApi, receiptApi } from '../api';
import { caseInsensitiveFilterOption } from '../utils/selectFilter';
import { getProductSalePrice } from '../utils/productPrice';
import ReceiptModal from '../components/ReceiptModal';
import OrderModal from '../components/OrderModal';

const { Title } = Typography;

const STATUS_LABELS = {
  open: { text: 'Открыт', color: 'blue' },
  paid: { text: 'Оплачен', color: 'green' },
  cancelled: { text: 'Отменён', color: 'red' },
};

export default function Orders() {
  const navigate = useNavigate();
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
  const [editModal, setEditModal] = useState({ open: false, order: null, table: null });

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
      return sum + (product ? getProductSalePrice(product) * item.quantity : 0);
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

  const openEdit = async (orderId, tableNumValue) => {
    try {
      const res = await ordersApi.get(orderId);
      setEditModal({
        open: true,
        order: res.data,
        table: { number: tableNumValue },
      });
    } catch {
      message.error('Ошибка загрузки заказа');
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

  const columns = [
    { title: '№', dataIndex: 'id', width: 60 },
    { title: 'Стол', dataIndex: 'table_num', width: 60 },
    { title: 'Позиций', dataIndex: 'items_count', width: 80 },
    {
      title: 'Сумма',
      dataIndex: 'total',
      width: 100,
      render: (v) => `${v.toFixed(2)} ₽`,
    },
    {
      title: 'Себест.',
      dataIndex: 'total_cost',
      width: 100,
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
      title: 'Комментарий',
      dataIndex: 'comment',
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Создан',
      dataIndex: 'created_at',
      width: 130,
      render: (v) => dayjs(v).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: '',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          {record.status === 'open' && (
            <Tooltip title="Редактировать">
              <Button
                size="small"
                type="primary"
                icon={<EditOutlined />}
                onClick={() => openEdit(record.id, record.table_num)}
              />
            </Tooltip>
          )}
          <Tooltip title="Чек">
            <Button
              size="small"
              icon={<PrinterOutlined />}
              onClick={() => handlePrint(record.id)}
            />
          </Tooltip>
          <Tooltip title="Просмотр">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/orders/${record.id}`)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
      }}>
        <Title level={3} style={{ margin: 0 }}>Заказы</Title>
        <Space wrap>
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

      <Table
        dataSource={orders}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1000 }}
      />

      <Modal
        title="Новый заказ"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        width={600}
        okText="Создать заказ"
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span>Стол:</span>
          <InputNumber min={1} value={tableNum} onChange={setTableNum} />
        </div>
        {orderItems.map((item) => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              marginBottom: 8,
              width: '100%',
            }}
          >
            <Select
              showSearch
              style={{ flex: '1 1 200px', minWidth: 180, maxWidth: 320 }}
              placeholder="Выберите товар"
              filterOption={caseInsensitiveFilterOption}
              value={item.product_id}
              onChange={(v) => updateItem(item.key, 'product_id', v)}
              options={products.map((p) => ({
                value: p.id,
                label: `${p.name} — ${getProductSalePrice(p)} ₽`,
              }))}
            />
            <InputNumber
              min={0.01}
              step={1}
              value={item.quantity}
              onChange={(v) => updateItem(item.key, 'quantity', v)}
              style={{ width: 90 }}
            />
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeItem(item.key)}
            />
          </div>
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

      <OrderModal
        open={editModal.open}
        table={editModal.table}
        order={editModal.order}
        onClose={() => setEditModal({ open: false, order: null, table: null })}
        onUpdated={fetchOrders}
      />
    </div>
  );
}
