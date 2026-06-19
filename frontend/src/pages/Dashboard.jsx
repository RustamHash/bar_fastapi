import { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Typography, Spin } from 'antd';
import {
  DollarOutlined,
  ShoppingCartOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { reportsApi } from '../api';

const { Title } = Typography;

const UNIT_LABELS = { liter: 'л', piece: 'шт', kg: 'кг' };

function stockTagColor(stock, minStock) {
  if (stock <= 0) return 'red';
  if (stock <= minStock) return 'gold';
  return 'green';
}
const CATEGORY_LABELS = {
  beer: 'Пиво',
  snack: 'Закуски',
  packaging: 'Тара',
  kit: 'Комплект',
  other: 'Прочее',
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await reportsApi.dashboard();
      setData(res.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const columns = [
    { title: 'Название', dataIndex: 'name', key: 'name' },
    {
      title: 'Категория',
      dataIndex: 'category',
      key: 'category',
      render: (cat) => CATEGORY_LABELS[cat] || cat,
    },
    {
      title: 'Остаток',
      dataIndex: 'stock',
      key: 'stock',
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
    { title: 'Мин. остаток', dataIndex: 'min_stock', key: 'min_stock' },
  ];

  if (loading && !data) return <Spin size="large" />;

  return (
    <div>
      <Title level={3}>Дашборд</Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Выручка сегодня"
              value={data?.today_revenue || 0}
              precision={2}
              suffix="₽"
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Открытых заказов"
              value={data?.open_orders || 0}
              suffix="шт"
              prefix={<ShoppingCartOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Активная касса"
              value={data?.cash_open ? 'Открыта' : 'Закрыта'}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: data?.cash_open ? '#3f8600' : '#cf1322', fontSize: 20 }}
            />
            {data?.cash_opened_at && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                с {new Date(data.cash_opened_at).toLocaleString('ru-RU')}
              </Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      <Title level={4}>Низкие остатки</Title>
      <Table
        dataSource={data?.low_stock || []}
        columns={columns}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: 'Все остатки в норме' }}
        rowClassName={(record) => (record.stock <= 0 ? 'low-stock-negative' : '')}
      />
      <style>{`
        .low-stock-negative td { background: #fff1f0 !important; }
      `}</style>
    </div>
  );
}
