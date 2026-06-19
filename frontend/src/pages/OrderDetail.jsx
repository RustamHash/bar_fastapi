import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Typography, Space, message, Card, Table, Tag, Descriptions, Modal, Input,
  Divider, Statistic, Row, Col,
} from 'antd';
import {
  ArrowLeftOutlined, PrinterOutlined, EditOutlined, CloseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { ordersApi, receiptApi } from '../api';
import {
  formatOrderItemLine, formatOrderItemPrice, formatOrderItemTotal, productUnitLabel,
} from '../utils/productPrice';
import ReceiptModal from '../components/ReceiptModal';
import OrderModal from '../components/OrderModal';

const { Title, Text } = Typography;

const STATUS_LABELS = {
  open: { text: 'Открыт', color: 'blue' },
  paid: { text: 'Оплачен', color: 'green' },
  cancelled: { text: 'Отменён', color: 'red' },
};

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelComment, setCancelComment] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ordersApi.get(id);
      setOrder(res.data);
    } catch {
      message.error('Не удалось загрузить заказ');
      navigate('/orders');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handlePrint = async () => {
    setReceiptOpen(true);
    setReceiptLoading(true);
    try {
      const res = await receiptApi.get(order.id);
      setReceipt(res.data);
    } catch {
      message.error('Ошибка загрузки чека');
    } finally {
      setReceiptLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelComment.trim()) {
      message.error('Укажите причину отмены');
      return;
    }
    setCancelling(true);
    try {
      await ordersApi.cancel(order.id, { comment: cancelComment.trim() });
      message.success('Заказ отменён');
      setCancelModalOpen(false);
      setCancelComment('');
      loadOrder();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка отмены');
    } finally {
      setCancelling(false);
    }
  };

  if (loading && !order) {
    return <Card loading />;
  }

  if (!order) return null;

  const status = STATUS_LABELS[order.status] || { text: order.status, color: 'default' };
  const mainItems = order.items
    .filter((i) => !i.is_kit_component)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const kitComponents = order.items.filter((i) => i.is_kit_component);
  const margin = order.total - order.total_cost;
  const displayTotal = mainItems.reduce((sum, i) => sum + i.total, 0) || order.total;

  const itemColumns = [
    {
      title: 'Время',
      dataIndex: 'created_at',
      width: 90,
      render: (v) => dayjs(v).format('HH:mm:ss'),
    },
    {
      title: 'Товар',
      render: (_, item) => formatOrderItemLine(item),
    },
    {
      title: 'Кол-во',
      dataIndex: 'quantity',
      width: 80,
      render: (v, item) => (
        item.is_kit_component && item.kit_component_qty != null
          ? `${item.kit_component_qty} × ${item.kit_order_quantity ?? 1}`
          : `${v} ${productUnitLabel(item.unit)}`
      ),
    },
    {
      title: 'Цена',
      width: 100,
      render: (_, item) => formatOrderItemPrice(item),
    },
    {
      title: 'Сумма',
      width: 100,
      align: 'right',
      render: (_, item) => formatOrderItemTotal(item),
    },
  ];

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/orders')}>
            К списку
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            Заказ №{order.id}
          </Title>
          <Tag color={status.color} style={{ fontSize: 14, padding: '2px 10px' }}>
            {status.text}
          </Tag>
        </Space>
        <Space wrap>
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>
            Чек
          </Button>
          {order.status === 'open' && (
            <>
              <Button type="primary" icon={<EditOutlined />} onClick={() => setEditModalOpen(true)}>
                Редактировать
              </Button>
              <Button danger icon={<CloseOutlined />} onClick={() => setCancelModalOpen(true)}>
                Отменить
              </Button>
            </>
          )}
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="Информация о заказе" size="small">
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Стол">{order.table_num}</Descriptions.Item>
              <Descriptions.Item label="Статус">
                <Tag color={status.color}>{status.text}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Создан">
                {dayjs(order.created_at).format('DD.MM.YYYY HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="Оплачен">
                {order.paid_at
                  ? dayjs(order.paid_at).format('DD.MM.YYYY HH:mm:ss')
                  : '—'}
              </Descriptions.Item>
              {order.cash_session_id && (
                <Descriptions.Item label="Кассовая смена">
                  №{order.cash_session_id}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Комментарий" span={2}>
                {order.comment || <Text type="secondary">Без комментария</Text>}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Финансы" size="small">
            <Row gutter={16}>
              <Col span={12}>
                <Statistic title="Подытог" value={order.subtotal} precision={2} suffix="₽" />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Скидка"
                  value={order.discount}
                  precision={2}
                  suffix="₽"
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Итого"
                  value={displayTotal}
                  precision={2}
                  suffix="₽"
                  valueStyle={{ color: '#8B5E3C', fontWeight: 'bold' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Себестоимость"
                  value={order.total_cost}
                  precision={2}
                  suffix="₽"
                />
              </Col>
              <Col span={24}>
                <Divider style={{ margin: '12px 0' }} />
                <Statistic
                  title="Маржа"
                  value={margin}
                  precision={2}
                  suffix="₽"
                  valueStyle={{ color: margin >= 0 ? '#3f8600' : '#cf1322' }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Card
        title={`Позиции (${mainItems.length})`}
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Table
          dataSource={mainItems}
          rowKey="id"
          pagination={false}
          size="small"
          loading={loading}
          columns={itemColumns}
          scroll={{ x: 600 }}
          locale={{ emptyText: 'Нет позиций' }}
          summary={() => mainItems.length > 0 ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4} align="right">
                <Text strong>Итого:</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <Text strong>{displayTotal.toFixed(2)} ₽</Text>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null}
        />
      </Card>

      {kitComponents.length > 0 && (
        <Card title={`Состав комплектов (${kitComponents.length})`} size="small">
          <Table
            dataSource={kitComponents}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 500 }}
            columns={[
              {
                title: 'Комплект',
                dataIndex: 'kit_name',
                render: (v) => v || '—',
              },
              { title: 'Компонент', dataIndex: 'product_name' },
              {
                title: 'Кол-во',
                render: (_, item) => (
                  item.kit_component_qty != null
                    ? `${item.kit_component_qty} ${productUnitLabel(item.unit)} × ${item.kit_order_quantity ?? 1}`
                    : `${item.quantity} ${productUnitLabel(item.unit)}`
                ),
              },
              {
                title: 'Себест.',
                dataIndex: 'cost_price',
                align: 'right',
                render: (v) => `${v.toFixed(2)} ₽`,
              },
              {
                title: 'В чеке',
                dataIndex: 'show_in_receipt',
                width: 80,
                render: (v) => (v ? 'Да' : 'Нет'),
              },
            ]}
          />
        </Card>
      )}

      <ReceiptModal
        open={receiptOpen}
        receipt={receipt}
        loading={receiptLoading}
        onClose={() => { setReceiptOpen(false); setReceipt(null); }}
      />

      <OrderModal
        open={editModalOpen}
        table={{ number: order.table_num }}
        order={order}
        onClose={() => setEditModalOpen(false)}
        onUpdated={loadOrder}
      />

      <Modal
        title="Отмена заказа"
        open={cancelModalOpen}
        onCancel={() => { setCancelModalOpen(false); setCancelComment(''); }}
        onOk={handleCancel}
        okText="Отменить заказ"
        okButtonProps={{ danger: true, loading: cancelling }}
        cancelText="Назад"
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          Укажите причину отмены
        </Text>
        <Input.TextArea
          value={cancelComment}
          onChange={(e) => setCancelComment(e.target.value)}
          rows={3}
          placeholder="Например: гость передумал, ошибка в заказе..."
        />
      </Modal>
    </div>
  );
}
