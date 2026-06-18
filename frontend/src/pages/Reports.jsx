import { useState, useEffect, useCallback } from 'react';
import { Typography, DatePicker, Table, Row, Col, Card, Spin } from 'antd';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import dayjs from 'dayjs';
import { reportsApi } from '../api';

const { Title } = Typography;
const { RangePicker } = DatePicker;

export default function Reports() {
  const [dateRange, setDateRange] = useState([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);
  const [sales, setSales] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [revenueByDay, setRevenueByDay] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const start = dateRange[0]?.format('YYYY-MM-DD');
      const end = dateRange[1]?.format('YYYY-MM-DD');
      const days = dateRange[1]?.diff(dateRange[0], 'day') + 1 || 30;

      const [salesRes, topRes, revenueRes] = await Promise.all([
        reportsApi.sales({ start_date: start, end_date: end }),
        reportsApi.topProducts({ limit: 10, days }),
        reportsApi.revenueByDay({ days }),
      ]);

      setSales(salesRes.data);
      setTopProducts(topRes.data);
      setRevenueByDay(revenueRes.data);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const salesColumns = [
    { title: 'Товар', dataIndex: 'product_name' },
    {
      title: 'Продано',
      dataIndex: 'quantity_sold',
      render: (v) => v.toFixed(2),
    },
    {
      title: 'Выручка',
      dataIndex: 'revenue',
      render: (v) => `${v.toFixed(2)} ₽`,
    },
    {
      title: 'Себестоимость',
      dataIndex: 'cost',
      render: (v) => `${v.toFixed(2)} ₽`,
    },
    {
      title: 'Маржа (₽)',
      dataIndex: 'margin',
      render: (v) => `${v.toFixed(2)} ₽`,
    },
    {
      title: 'Маржинальность (%)',
      dataIndex: 'margin_percent',
      render: (v) => `${v.toFixed(1)}%`,
    },
  ];

  const topColumns = [
    { title: 'Товар', dataIndex: 'product_name' },
    {
      title: 'Продано',
      dataIndex: 'quantity_sold',
      render: (v) => v.toFixed(2),
    },
    {
      title: 'Выручка',
      dataIndex: 'revenue',
      render: (v) => `${v.toFixed(2)} ₽`,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Отчёты</Title>
        <RangePicker
          value={dateRange}
          onChange={setDateRange}
          format="DD.MM.YYYY"
        />
      </div>

      {loading ? (
        <Spin size="large" />
      ) : (
        <>
          <Card title="Выручка по дням" style={{ marginBottom: 24 }}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => dayjs(v).format('DD.MM')}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(v) => dayjs(v).format('DD.MM.YYYY')}
                  formatter={(value) => [`${value.toFixed(2)} ₽`, 'Выручка']}
                />
                <Line type="monotone" dataKey="revenue" stroke="#1890ff" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title="Продажи по товарам">
                <Table
                  dataSource={sales}
                  columns={salesColumns}
                  rowKey="product_id"
                  pagination={{ pageSize: 10 }}
                  size="small"
                />
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="Топ-10 товаров">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topProducts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis
                      type="category"
                      dataKey="product_name"
                      width={120}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(value) => [value.toFixed(2), 'Продано']} />
                    <Bar dataKey="quantity_sold" fill="#52c41a" />
                  </BarChart>
                </ResponsiveContainer>
                <Table
                  dataSource={topProducts}
                  columns={topColumns}
                  rowKey="product_id"
                  pagination={false}
                  size="small"
                  style={{ marginTop: 16 }}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
