import { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Typography, Select, Input } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { productsApi } from '../api';

const { Title } = Typography;

const CATEGORY_LABELS = {
  beer: 'Пиво',
  snack: 'Закуски',
  packaging: 'Тара',
  kit: 'Комплект',
  other: 'Прочее',
};

const UNIT_LABELS = { liter: 'л', piece: 'шт', kg: 'кг' };

function stockTagColor(stock, minStock) {
  if (stock <= 0) return 'red';
  if (stock <= minStock) return 'gold';
  return 'green';
}

export default function Stock() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

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
    const interval = setInterval(fetchProducts, 30000);
    return () => clearInterval(interval);
  }, [fetchProducts]);

  const filtered = products
    .filter((p) => !p.is_kit)
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => !lowOnly || p.stock <= p.min_stock)
    .sort((a, b) => a.stock - b.stock);

  const columns = [
    { title: 'Название', dataIndex: 'name', ellipsis: true },
    {
      title: 'Категория',
      dataIndex: 'category',
      width: 120,
      render: (cat) => CATEGORY_LABELS[cat] || cat,
    },
    {
      title: 'Остаток',
      dataIndex: 'stock',
      width: 130,
      sorter: (a, b) => a.stock - b.stock,
      defaultSortOrder: 'ascend',
      render: (val, record) => {
        const unit = UNIT_LABELS[record.unit] || record.unit;
        const color = stockTagColor(val, record.min_stock);
        return (
          <Tag color={color} icon={val <= 0 ? <WarningOutlined /> : undefined}>
            {val} {unit}
          </Tag>
        );
      },
    },
    {
      title: 'Мин.',
      dataIndex: 'min_stock',
      width: 80,
      render: (v, record) => `${v} ${UNIT_LABELS[record.unit] || record.unit}`,
    },
    {
      title: 'Статус',
      width: 120,
      render: (_, record) => {
        if (record.stock <= 0) return <Tag color="red">Нет в наличии</Tag>;
        if (record.stock <= record.min_stock) return <Tag color="gold">Мало</Tag>;
        return <Tag color="green">Норма</Tag>;
      },
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Остатки</Title>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
      }}>
        <Input
          placeholder="Поиск..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 220, minWidth: 160 }}
        />
        <Select
          allowClear
          placeholder="Категория"
          style={{ width: 160 }}
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <Select
          style={{ width: 200 }}
          value={lowOnly ? 'low' : 'all'}
          onChange={(v) => setLowOnly(v === 'low')}
          options={[
            { value: 'all', label: 'Все товары' },
            { value: 'low', label: 'Только низкие' },
          ]}
        />
      </div>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: 600 }}
        rowClassName={(record) => (record.stock <= 0 ? 'low-stock-negative' : '')}
        locale={{ emptyText: 'Нет товаров' }}
      />
      <style>{`
        .low-stock-negative td { background: #fff1f0 !important; }
      `}</style>
    </div>
  );
}
