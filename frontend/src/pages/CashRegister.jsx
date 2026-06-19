import { useState, useEffect, useCallback } from 'react';
import {
  Card, Button, Statistic, Row, Col, Typography, InputNumber, Modal, message, Spin, Descriptions,
} from 'antd';
import {
  DollarOutlined, UnlockOutlined, LockOutlined, ShoppingOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { cashApi } from '../api';

const { Title } = Typography;

export default function CashRegister() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openBalance, setOpenBalance] = useState(0);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [cashAmount, setCashAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await cashApi.status();
      setStatus(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleOpen = async () => {
    setActionLoading(true);
    try {
      const res = await cashApi.open(openBalance);
      setStatus(res.data);
      await fetchStatus();
      message.success('Смена открыта');
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async () => {
    setActionLoading(true);
    try {
      await cashApi.close({ cash_amount: cashAmount, card_amount: cardAmount });
      message.success('Смена закрыта');
      setCloseModalOpen(false);
      fetchStatus();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Spin size="large" />;

  const expectedRevenue = status?.total_revenue || 0;
  const actualTotal = (cashAmount || 0) + (cardAmount || 0);
  const discrepancy = actualTotal - expectedRevenue;

  if (!status?.is_open) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 60 }}>
        <Title level={3}>Касса закрыта</Title>
        <Card style={{ maxWidth: 400, margin: '24px auto' }}>
          <div style={{ marginBottom: 16 }}>
            <span>Начальный остаток: </span>
            <InputNumber
              min={0}
              value={openBalance}
              onChange={setOpenBalance}
              addonAfter="₽"
              style={{ width: 200 }}
            />
          </div>
          <Button
            type="primary"
            size="large"
            icon={<UnlockOutlined />}
            onClick={handleOpen}
            loading={actionLoading}
            block
          >
            Открыть смену
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Title level={3}>Касса — смена открыта</Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="Выручка"
              value={status.total_revenue}
              precision={2}
              suffix="₽"
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="Заказов"
              value={status.orders_count}
              prefix={<ShoppingOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="Наличные"
              value={status.cash_total}
              precision={2}
              suffix="₽"
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic
              title="Безнал"
              value={status.card_total}
              precision={2}
              suffix="₽"
            />
          </Card>
        </Col>
      </Row>

      <Descriptions bordered column={2} style={{ marginBottom: 24 }}>
        <Descriptions.Item label="Открыта">
          {dayjs(status.opened_at).format('DD.MM.YYYY HH:mm')}
        </Descriptions.Item>
        <Descriptions.Item label="Начальный остаток">
          {status.opening_balance.toFixed(2)} ₽
        </Descriptions.Item>
      </Descriptions>

      <Button
        type="primary"
        danger
        size="large"
        icon={<LockOutlined />}
        onClick={() => {
          setCashAmount(status.total_revenue);
          setCardAmount(0);
          setCloseModalOpen(true);
        }}
      >
        Закрыть смену
      </Button>

      <Modal
        title="Закрытие смены"
        open={closeModalOpen}
        onCancel={() => setCloseModalOpen(false)}
        onOk={handleClose}
        confirmLoading={actionLoading}
        okText="Закрыть смену"
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>Наличные:</div>
          <InputNumber
            min={0}
            value={cashAmount}
            onChange={setCashAmount}
            style={{ width: '100%' }}
            addonAfter="₽"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>Безналичные:</div>
          <InputNumber
            min={0}
            value={cardAmount}
            onChange={setCardAmount}
            style={{ width: '100%' }}
            addonAfter="₽"
          />
        </div>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Итого">{actualTotal.toFixed(2)} ₽</Descriptions.Item>
          <Descriptions.Item label="Ожидаемая выручка">{expectedRevenue.toFixed(2)} ₽</Descriptions.Item>
          <Descriptions.Item label="Расхождение">
            <span style={{ color: discrepancy !== 0 ? '#cf1322' : '#3f8600' }}>
              {discrepancy >= 0 ? '+' : ''}{discrepancy.toFixed(2)} ₽
            </span>
          </Descriptions.Item>
        </Descriptions>
      </Modal>
    </div>
  );
}
