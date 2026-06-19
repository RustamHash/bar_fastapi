import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Typography, Modal, Input, DatePicker, Select, InputNumber, Space, message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { invoicesApi, productsApi } from '../api';
import { caseInsensitiveFilterOption } from '../utils/selectFilter';

const { Title } = Typography;

export default function Invoices() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
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
    productsApi.getAll().then((res) => setProducts(res.data));
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
      const res = await invoicesApi.create({
        supplier,
        invoice_number: invoiceNumber || null,
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
      setInvoiceNumber('');
      setComment('');
      setItems([{ key: 1, product_id: null, quantity: 1, purchase_price: 0 }]);
      fetchInvoices();
      navigate(`/invoices/${res.data.id}`);
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    } finally {
      setCreating(false);
    }
  };

  const columns = [
    { title: '№', dataIndex: 'id', width: 60 },
    {
      title: 'Номер',
      dataIndex: 'invoice_number',
      render: (v) => v || '—',
    },
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
    {
      title: '',
      width: 90,
      fixed: 'right',
      render: (_, record) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => { e.stopPropagation(); navigate(`/invoices/${record.id}`); }}
        />
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
        <Title level={3} style={{ margin: 0 }}>Накладные</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Новая накладная
        </Button>
      </div>

      <Table
        dataSource={invoices}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 800 }}
        onRow={(record) => ({
          onClick: () => navigate(`/invoices/${record.id}`),
          style: { cursor: 'pointer' },
        })}
      />

      <Modal
        title="Новая накладная"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        width={700}
        okText="Создать"
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <span>Поставщик:</span>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={{ flex: '1 1 200px', maxWidth: 300 }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <span>Номер накладной:</span>
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              style={{ flex: '1 1 160px', maxWidth: 200 }}
              placeholder="Номер от поставщика"
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <span>Дата:</span>
            <DatePicker value={date} onChange={setDate} format="DD.MM.YYYY" />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <span>Комментарий:</span>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} style={{ flex: '1 1 200px', maxWidth: 400 }} />
          </div>
          {items.map((item) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
                width: '100%',
              }}
            >
              <Select
                showSearch
                style={{ flex: '1 1 200px', minWidth: 180, maxWidth: 280 }}
                placeholder="Товар"
                filterOption={caseInsensitiveFilterOption}
                value={item.product_id}
                onChange={(v) => updateItem(item.key, 'product_id', v)}
                options={products.map((p) => ({ value: p.id, label: p.name }))}
              />
              <InputNumber
                min={0.01}
                placeholder="Кол-во"
                value={item.quantity}
                onChange={(v) => updateItem(item.key, 'quantity', v)}
                style={{ width: 90 }}
              />
              <InputNumber
                min={0}
                placeholder="Цена"
                value={item.purchase_price}
                onChange={(v) => updateItem(item.key, 'purchase_price', v)}
                addonAfter="₽"
                style={{ width: 120 }}
              />
              <span style={{ whiteSpace: 'nowrap' }}>
                = {((item.quantity || 0) * (item.purchase_price || 0)).toFixed(2)} ₽
              </span>
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeItem(item.key)} />
            </div>
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
