import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Typography, Input, DatePicker, Select, InputNumber, Space, message, Card, Table,
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { invoicesApi, productsApi } from '../api';
import { caseInsensitiveFilterOption } from '../utils/selectFilter';

const { Title } = Typography;

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [date, setDate] = useState(dayjs());
  const [comment, setComment] = useState('');
  const [items, setItems] = useState([]);
  const [createdAt, setCreatedAt] = useState(null);

  const loadInvoice = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoicesApi.get(id);
      const inv = res.data;
      setSupplier(inv.supplier);
      setInvoiceNumber(inv.invoice_number || '');
      setDate(dayjs(inv.date));
      setComment(inv.comment || '');
      setCreatedAt(inv.created_at);
      setItems(
        inv.items.map((item) => ({
          key: item.id,
          id: item.id,
          product_id: item.product_id,
          quantity: item.quantity,
          purchase_price: item.purchase_price,
        })),
      );
    } catch {
      message.error('Не удалось загрузить накладную');
      navigate('/invoices');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadInvoice();
    productsApi.getAll().then((res) => setProducts(res.data));
  }, [loadInvoice]);

  const addItem = () => {
    setItems([
      ...items,
      { key: `new-${Date.now()}`, id: null, product_id: null, quantity: 1, purchase_price: 0 },
    ]);
  };

  const removeItem = (key) => {
    if (items.length > 1) setItems(items.filter((i) => i.key !== key));
  };

  const updateItem = (key, field, value) => {
    setItems(items.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  };

  const calcTotal = () =>
    items.reduce((sum, i) => sum + (i.quantity || 0) * (i.purchase_price || 0), 0);

  const handleSave = async () => {
    if (!supplier) {
      message.error('Укажите поставщика');
      return;
    }
    const validItems = items.filter((i) => i.product_id && i.quantity > 0);
    if (!validItems.length) {
      message.error('Добавьте позиции');
      return;
    }
    setSaving(true);
    try {
      await invoicesApi.update(id, {
        supplier,
        invoice_number: invoiceNumber || null,
        date: date.format('YYYY-MM-DD'),
        comment: comment || null,
        items: validItems.map((i) => ({
          id: i.id,
          product_id: i.product_id,
          quantity: i.quantity,
          purchase_price: i.purchase_price,
        })),
      });
      message.success('Накладная сохранена');
      loadInvoice();
    } catch (err) {
      const detail = err.response?.data?.detail;
      message.error(typeof detail === 'string' ? detail : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

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
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/invoices')}>
            К списку
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            Накладная №{id}
          </Title>
        </Space>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
          Сохранить
        </Button>
      </div>

      <Card loading={loading}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap size="large">
            <div>
              <div style={{ marginBottom: 4, color: '#666' }}>Поставщик</div>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                style={{ width: 280 }}
              />
            </div>
            <div>
              <div style={{ marginBottom: 4, color: '#666' }}>Номер накладной</div>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                style={{ width: 200 }}
                placeholder="Номер от поставщика"
              />
            </div>
            <div>
              <div style={{ marginBottom: 4, color: '#666' }}>Дата</div>
              <DatePicker value={date} onChange={setDate} format="DD.MM.YYYY" />
            </div>
            {createdAt && (
              <div>
                <div style={{ marginBottom: 4, color: '#666' }}>Создана</div>
                <Input
                  value={dayjs(createdAt).format('DD.MM.YYYY HH:mm')}
                  disabled
                  style={{ width: 180 }}
                />
              </div>
            )}
          </Space>

          <div>
            <div style={{ marginBottom: 4, color: '#666' }}>Комментарий</div>
            <Input.TextArea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              style={{ maxWidth: 600 }}
            />
          </div>

          <Title level={5} style={{ marginTop: 8, marginBottom: 0 }}>Позиции</Title>

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
              <span style={{ minWidth: 80, whiteSpace: 'nowrap' }}>
                = {((item.quantity || 0) * (item.purchase_price || 0)).toFixed(2)} ₽
              </span>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeItem(item.key)}
                disabled={items.length <= 1}
              />
            </div>
          ))}

          <Button type="dashed" icon={<PlusOutlined />} onClick={addItem}>
            Добавить позицию
          </Button>

          <Table
            dataSource={items.filter((i) => i.product_id)}
            rowKey="key"
            pagination={false}
            size="small"
            style={{ marginTop: 8 }}
            columns={[
              {
                title: 'Товар',
                dataIndex: 'product_id',
                render: (pid) => products.find((p) => p.id === pid)?.name || '—',
              },
              { title: 'Кол-во', dataIndex: 'quantity' },
              {
                title: 'Цена',
                dataIndex: 'purchase_price',
                render: (v) => `${(v || 0).toFixed(2)} ₽`,
              },
              {
                title: 'Сумма',
                render: (_, row) =>
                  `${((row.quantity || 0) * (row.purchase_price || 0)).toFixed(2)} ₽`,
              },
            ]}
          />

          <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 16 }}>
            Итого: {calcTotal().toFixed(2)} ₽
          </div>
        </Space>
      </Card>
    </div>
  );
}
