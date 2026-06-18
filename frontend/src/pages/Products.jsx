import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Tag, Space, Typography, Select, Badge, Modal, message, Popconfirm,
} from 'antd';
import {
  PlusOutlined, EditOutlined, HistoryOutlined, StopOutlined,
} from '@ant-design/icons';
import { productsApi } from '../api';
import ProductForm from '../components/ProductForm';

const { Title } = Typography;

const CATEGORY_LABELS = {
  beer: 'Пиво',
  snack: 'Закуски',
  packaging: 'Тара',
  kit: 'Комплект',
  other: 'Прочее',
};

const UNIT_LABELS = { liter: 'л', piece: 'шт', kg: 'кг' };

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);
  const [priceHistory, setPriceHistory] = useState([]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = categoryFilter ? { category: categoryFilter } : {};
      const res = await productsApi.list(params);
      setProducts(res.data);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleEdit = (product) => {
    setEditProduct(product);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditProduct(null);
    setFormOpen(true);
  };

  const handleDeactivate = async (id) => {
    try {
      await productsApi.delete(id);
      message.success('Товар деактивирован');
      fetchProducts();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    }
  };

  const showPriceHistory = async (id) => {
    const res = await productsApi.priceHistory(id);
    setPriceHistory(res.data);
    setPriceHistoryOpen(true);
  };

  const expandedRowRender = (record) => {
    if (!record.is_kit || !record.components?.length) return null;
    return (
      <Table
        size="small"
        pagination={false}
        dataSource={record.components}
        rowKey="id"
        columns={[
          { title: 'Компонент', dataIndex: 'component_name' },
          {
            title: 'Кол-во',
            render: (_, r) => `${r.quantity} ${UNIT_LABELS[r.component_unit] || r.component_unit}`,
          },
          {
            title: 'Цена',
            render: (_, r) => `${r.price_override ?? r.component_price} ₽`,
          },
          {
            title: 'В чеке',
            render: (_, r) => (r.show_in_receipt ? <Tag color="green">Да</Tag> : <Tag>Нет</Tag>),
          },
        ]}
      />
    );
  };

  const columns = [
    { title: 'Название', dataIndex: 'name', key: 'name' },
    {
      title: 'Категория',
      dataIndex: 'category',
      render: (cat) => CATEGORY_LABELS[cat] || cat,
    },
    {
      title: 'Тип',
      render: (_, r) => (
        r.is_kit ? <Tag color="purple">Комплект</Tag> : <Tag>Простой</Tag>
      ),
    },
    {
      title: 'Цена',
      dataIndex: 'retail_price',
      render: (v) => `${v} ₽`,
    },
    {
      title: 'Штрихкод',
      dataIndex: 'barcode',
      render: (v) => v || '—',
    },
    {
      title: 'Остаток',
      dataIndex: 'stock',
      render: (val, record) => {
        const unit = UNIT_LABELS[record.unit] || record.unit;
        const low = !record.is_kit && val <= record.min_stock;
        return (
          <Tag color={low ? 'red' : 'green'}>
            {record.is_kit ? '—' : `${val} ${unit}`}
          </Tag>
        );
      },
    },
    {
      title: 'Компонентов',
      render: (_, r) =>
        r.is_kit ? <Badge count={r.components?.length || 0} showZero color="purple" /> : '—',
    },
    {
      title: 'Действия',
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Редактировать
          </Button>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => showPriceHistory(record.id)}>
            История цены
          </Button>
          <Popconfirm title="Деактивировать товар?" onConfirm={() => handleDeactivate(record.id)}>
            <Button size="small" danger icon={<StopOutlined />}>
              Деактивировать
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Товары</Title>
        <Space>
          <Select
            allowClear
            placeholder="Фильтр по категории"
            style={{ width: 200 }}
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Создать товар
          </Button>
        </Space>
      </div>

      <Table
        dataSource={products}
        columns={columns}
        rowKey="id"
        loading={loading}
        expandable={{
          expandedRowRender,
          rowExpandable: (record) => record.is_kit && record.components?.length > 0,
        }}
      />

      <ProductForm
        open={formOpen}
        product={editProduct}
        onClose={() => setFormOpen(false)}
        onSuccess={fetchProducts}
      />

      <Modal
        title="История изменения цены"
        open={priceHistoryOpen}
        onCancel={() => setPriceHistoryOpen(false)}
        footer={null}
      >
        <Table
          dataSource={priceHistory}
          rowKey="id"
          pagination={false}
          columns={[
            { title: 'Было', dataIndex: 'old_price', render: (v) => `${v} ₽` },
            { title: 'Стало', dataIndex: 'new_price', render: (v) => `${v} ₽` },
            {
              title: 'Дата',
              dataIndex: 'changed_at',
              render: (v) => new Date(v).toLocaleString('ru-RU'),
            },
          ]}
          locale={{ emptyText: 'Изменений не было' }}
        />
      </Modal>
    </div>
  );
}
