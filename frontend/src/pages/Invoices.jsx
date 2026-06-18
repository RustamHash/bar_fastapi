import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Typography, Modal, Input, DatePicker, Select, InputNumber, Space, message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { invoicesApi, productsApi } from '../api';

const { Title } = Typography;

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(dayjs());
  const [comment, setComment] = useState('');
  const [items, setItems] = useState([{ key: 1, product_id: null, quantity: 1, purchase_price: 0 }]);
  const [creating, setCreating] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoicesApi.list();
      setInvoices(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    productsApi.availableComponents().then((res) => setProducts(res.data));
  }, [fetchInvoices]);

  const addItem = () => {
    setItems([...items, { key: Date.now(), product_id: null, quantity: 1, purchase_price: 0 }]);
  };

  const removeItem = (key) => {
    if (items.length > 1) setItems(items.filter((i) => i.key !== key));
  };

  const updateItem = (key, field, value) => {
    setItems(items.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  };

  const calcTotal = () =>
    items.reduce((sum, i) => sum + (i.quantity || 0) * (i.purchase_price || 0), 0);

  const handleCreate = async () => {
    if (!supplier) {
      message.error('Укажите поставщика');
      return;
    }
    const validItems = items.filter((i) => i.product_id && i.quantity > 0);
    if (!validItems.length) {
      message.error('Добавьте позиции');
      return;
    }
    setCreating(true);
    try {
      await invoicesApi.create({
        supplier,
        date: date.format('YYYY-MM-DD'),
        comment: comment || null,
        items: validItems.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          purchase_price: i.purchase_price,
        })),
      });
      message.success('Накладная создана');
      setModalOpen(false);
      setSupplier('');
      setComment('');
      setItems([{ key: 1, product_id: null, quantity: 1, purchase_price: 0 }]);
      fetchInvoices();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    } finally {
      setCreating(false);
    }
  };

  const columns = [
    { title: '№', dataIndex: 'id', width: 60 },
    { title: 'Поставщик', dataIndex: 'supplier' },
    {
      title: 'Дата',
      dataIndex: 'date',
      render: (v) => dayjs(v).format('DD.MM.YYYY'),
    },
    {
      title: 'Сумма',
      dataIndex: 'total_amount',
      render: (v) => `${v.toFixed(2)} ₽`,
    },
    { title: 'Комментарий', dataIndex: 'comment', ellipsis: true },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Накладные</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Новая накладная
        </Button>
      </div>

      <Table dataSource={invoices} columns={columns} rowKey="id" loading={loading} />

      <Modal
        title="Новая накладная"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        width={700}
        okText="Создать"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <span style={{ marginRight: 8 }}>Поставщик:</span>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={{ width: 300 }} />
          </div>
          <div>
            <span style={{ marginRight: 8 }}>Дата:</span>
            <DatePicker value={date} onChange={setDate} format="DD.MM.YYYY" />
          </div>
          <div>
            <span style={{ marginRight: 8 }}>Комментарий:</span>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} style={{ width: 400 }} />
          </div>
          {items.map((item) => (
            <Space key={item.key}>
              <Select
                showSearch
                style={{ width: 250 }}
                placeholder="Товар"
                optionFilterProp="label"
                value={item.product_id}
                onChange={(v) => updateItem(item.key, 'product_id', v)}
                options={products.map((p) => ({ value: p.id, label: p.name }))}
              />
              <InputNumber
                min={0.01}
                placeholder="Кол-во"
                value={item.quantity}
                onChange={(v) => updateItem(item.key, 'quantity', v)}
              />
              <InputNumber
                min={0}
                placeholder="Цена"
                value={item.purchase_price}
                onChange={(v) => updateItem(item.key, 'purchase_price', v)}
                addonAfter="₽"
              />
              <span>= {((item.quantity || 0) * (item.purchase_price || 0)).toFixed(2)} ₽</span>
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeItem(item.key)} />
            </Space>
          ))}
          <Button type="dashed" icon={<PlusOutlined />} onClick={addItem}>
            Добавить позицию
          </Button>
          <div style={{ textAlign: 'right', fontWeight: 'bold' }}>
            Итого: {calcTotal().toFixed(2)} ₽
          </div>
        </Space>
      </Modal>
    </div>
  );
}
