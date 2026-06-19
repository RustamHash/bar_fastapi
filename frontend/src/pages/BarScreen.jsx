import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Typography, Button, Modal, Input, Space, Badge, Popover, Card, Row, Col,
  message, InputNumber, Switch, Tooltip, Divider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, CheckOutlined, PrinterOutlined,
  MinusOutlined, SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { tablesApi, ordersApi, productsApi, receiptApi } from '../api';
import ReceiptModal from '../components/ReceiptModal';

const { Title, Text } = Typography;

const STATUS_COLORS = {
  empty: '#52c41a',
  occupied: '#ff4d4f',
  reserved: '#8c8c8c',
};

const SECTION_LABELS = {
  main: 'Основной зал',
  terrace: 'Терраса',
  vip: 'VIP',
};

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export default function BarScreen() {
  const [plan, setPlan] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [comment, setComment] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const dragRef = useRef({ tableId: null, startX: 0, startY: 0, origX: 0, origY: 0 });
  const isAdmin = getUser()?.role === 'admin';

  const fetchPlan = useCallback(async () => {
    try {
      const res = await tablesApi.plan();
      setPlan(res.data.tables);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
    productsApi.getSellable().then((res) => setProducts(res.data));
    const interval = setInterval(fetchPlan, 15000);
    return () => clearInterval(interval);
  }, [fetchPlan]);

  const popularProducts = products.filter((p) =>
    p.is_kit || p.category === 'snack'
  ).slice(0, 12);

  const filteredProducts = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const openNewOrder = (table) => {
    setSelectedTable(table);
    setCurrentOrder(null);
    setComment('');
    setOrderModalOpen(true);
  };

  const openExistingOrder = async (table, orderId) => {
    setSelectedTable(table);
    const res = await ordersApi.get(orderId);
    setCurrentOrder(res.data);
    setComment(res.data.comment || '');
    setOrderModalOpen(true);
  };

  const handleTableClick = (table) => {
    if (editMode) return;
    if (table.open_orders_count === 0) {
      openNewOrder(table);
    }
  };

  const createOrder = async () => {
    setSaving(true);
    try {
      const res = await ordersApi.create({
        table_num: selectedTable.number,
        comment: comment.trim() || null,
        items: [],
      });
      setCurrentOrder(res.data);
      message.success('Счёт открыт');
      fetchPlan();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка создания заказа');
    } finally {
      setSaving(false);
    }
  };

  const addProduct = async (productId) => {
    if (!currentOrder) {
      message.warning('Сначала откройте счёт');
      return;
    }
    try {
      const res = await ordersApi.addItem(currentOrder.id, { product_id: productId, quantity: 1 });
      setCurrentOrder(res.data);
      fetchPlan();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка добавления');
    }
  };

  const changeQuantity = async (item, delta) => {
    const newQty = item.quantity + delta;
    try {
      const res = await ordersApi.updateItem(currentOrder.id, item.id, { quantity: newQty });
      setCurrentOrder(res.data);
      fetchPlan();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    }
  };

  const handlePay = async () => {
    try {
      await ordersApi.pay(currentOrder.id);
      message.success('Заказ оплачен');
      setOrderModalOpen(false);
      setCurrentOrder(null);
      fetchPlan();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка оплаты');
    }
  };

  const handlePrint = async () => {
    setReceiptOpen(true);
    setReceiptLoading(true);
    try {
      const res = await receiptApi.get(currentOrder.id);
      setReceipt(res.data);
    } catch {
      message.error('Ошибка загрузки чека');
    } finally {
      setReceiptLoading(false);
    }
  };

  const handleDragStart = (e, table) => {
    if (!editMode) return;
    e.preventDefault();
    dragRef.current = {
      tableId: table.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: table.position_x,
      origY: table.position_y,
    };
  };

  const handleDragMove = (e) => {
    const drag = dragRef.current;
    if (!drag.tableId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setPlan((prev) => prev.map((t) =>
      t.id === drag.tableId
        ? { ...t, position_x: Math.max(0, drag.origX + dx), position_y: Math.max(0, drag.origY + dy) }
        : t
    ));
  };

  const handleDragEnd = async () => {
    const drag = dragRef.current;
    if (!drag.tableId) return;
    const table = plan.find((t) => t.id === drag.tableId);
    dragRef.current = { tableId: null };
    if (!table) return;
    try {
      await tablesApi.update(table.id, {
        position_x: table.position_x,
        position_y: table.position_y,
      });
    } catch {
      message.error('Ошибка сохранения позиции');
      fetchPlan();
    }
  };

  useEffect(() => {
    if (!editMode) return undefined;
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  });

  const renderOrdersPopover = (table) => (
    <div style={{ width: 280 }}>
      {table.open_orders.map((order) => (
        <Card
          key={order.id}
          size="small"
          style={{ marginBottom: 8, cursor: 'pointer' }}
          onClick={() => openExistingOrder(table, order.id)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text strong>#{order.id}</Text>
            <Text>{order.total.toFixed(0)} ₽</Text>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(order.created_at).format('HH:mm')}
          </Text>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {order.comment || 'Без комментария'}
          </div>
        </Card>
      ))}
      <Button type="dashed" block icon={<PlusOutlined />} onClick={() => openNewOrder(table)}>
        Новый счёт
      </Button>
    </div>
  );

  const mainItems = currentOrder?.items?.filter((i) => !i.is_kit_component) || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>План зала</Title>
        <Space>
        {isAdmin && editMode && (
            <Button
              icon={<PlusOutlined />}
              onClick={async () => {
                const number = Math.max(0, ...plan.map((t) => t.number)) + 1;
                try {
                  await tablesApi.create({
                    number,
                    label: String(number),
                    position_x: 50,
                    position_y: 50,
                    section: 'main',
                  });
                  fetchPlan();
                } catch (err) {
                  message.error(err.response?.data?.detail || 'Ошибка');
                }
              }}
            >
              Добавить стол
            </Button>
          )}
          {isAdmin && (
            <Space>
              <Text>Редактирование</Text>
              <Switch checked={editMode} onChange={setEditMode} />
            </Space>
          )}
          <Button onClick={fetchPlan} loading={loading}>Обновить</Button>
        </Space>
      </div>

      <div style={{
        position: 'relative',
        minHeight: 500,
        background: '#f5f5f5',
        borderRadius: 8,
        border: '1px solid #d9d9d9',
        overflow: 'auto',
      }}>
        {Object.entries(SECTION_LABELS).map(([key, label]) => {
          const sectionTables = plan.filter((t) => t.section === key);
          if (!sectionTables.length) return null;
          return (
            <div key={key} style={{ padding: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
            </div>
          );
        })}

        {plan.map((table) => {
          const tableEl = (
            <div
              key={table.id}
              onMouseDown={(e) => handleDragStart(e, table)}
              onClick={() => handleTableClick(table)}
              style={{
                position: 'absolute',
                left: table.position_x,
                top: table.position_y + 24,
                width: table.width,
                height: table.height,
                background: STATUS_COLORS[table.status] || '#52c41a',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                cursor: editMode ? 'move' : 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                userSelect: 'none',
                border: editMode ? '2px dashed #fff' : 'none',
              }}
            >
              <Text strong style={{ color: '#fff', fontSize: 16 }}>
                {table.label || table.number}
              </Text>
              {table.open_orders_count > 0 && (
                <Badge
                  count={table.open_orders_count}
                  style={{ marginTop: 4 }}
                  color="#fff"
                  styles={{ indicator: { color: STATUS_COLORS.occupied, boxShadow: 'none' } }}
                />
              )}
            </div>
          );

          if (table.open_orders_count > 0 && !editMode) {
            return (
              <Popover
                key={table.id}
                content={renderOrdersPopover(table)}
                title={`Стол ${table.label || table.number}`}
                trigger="click"
              >
                {tableEl}
              </Popover>
            );
          }
          return tableEl;
        })}
      </div>

      <Modal
        title={
          currentOrder
            ? `Стол №${selectedTable?.number} — Заказ №${currentOrder.id}`
            : `Стол №${selectedTable?.number} — Новый счёт`
        }
        open={orderModalOpen}
        onCancel={() => { setOrderModalOpen(false); setCurrentOrder(null); }}
        footer={null}
        width={720}
        destroyOnClose
      >
        {!currentOrder ? (
          <>
            <Input.TextArea
              placeholder="Комментарий: парень в кепке, девушка у окна..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              style={{ marginBottom: 16 }}
            />
            <Button type="primary" onClick={createOrder} loading={saving} block>
              Открыть счёт
            </Button>
          </>
        ) : (
          <>
            {currentOrder.comment && (
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                {currentOrder.comment}
              </Text>
            )}

            <Title level={5}>Позиции</Title>
            {mainItems.length === 0 ? (
              <Text type="secondary">Пока пусто — добавьте товары ниже</Text>
            ) : (
              mainItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <span>{item.product_name}</span>
                  <Space>
                    <Button
                      size="small"
                      icon={<MinusOutlined />}
                      onClick={() => changeQuantity(item, -1)}
                      disabled={item.product_id && item.quantity <= 0}
                    />
                    <Text>{item.quantity}</Text>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => changeQuantity(item, 1)} />
                    <Text strong>{item.total.toFixed(0)} ₽</Text>
                  </Space>
                </div>
              ))
            )}

            <Divider />

            <Title level={5}>Быстрое добавление</Title>
            <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
              {popularProducts.map((p) => (
                <Col key={p.id} span={8}>
                  <Button block onClick={() => addProduct(p.id)} style={{ height: 'auto', padding: '8px 4px' }}>
                    <div style={{ fontSize: 12, whiteSpace: 'normal', lineHeight: 1.3 }}>{p.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{p.retail_price} ₽</div>
                  </Button>
                </Col>
              ))}
            </Row>

            <Input
              prefix={<SearchOutlined />}
              placeholder="Поиск товара..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            {search && (
              <div style={{ maxHeight: 120, overflow: 'auto', marginBottom: 16 }}>
                {filteredProducts.slice(0, 8).map((p) => (
                  <Button
                    key={p.id}
                    type="link"
                    block
                    style={{ textAlign: 'left' }}
                    onClick={() => { addProduct(p.id); setSearch(''); }}
                  >
                    {p.name} — {p.retail_price} ₽
                  </Button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title level={4} style={{ margin: 0 }}>
                Итого: {currentOrder.total.toFixed(0)} ₽
              </Title>
              <Space>
                <Button icon={<PrinterOutlined />} onClick={handlePrint}>Чек</Button>
                <Button type="primary" icon={<CheckOutlined />} onClick={handlePay}>
                  Оплатить
                </Button>
              </Space>
            </div>
          </>
        )}
      </Modal>

      <ReceiptModal
        open={receiptOpen}
        receipt={receipt}
        loading={receiptLoading}
        onClose={() => { setReceiptOpen(false); setReceipt(null); }}
      />
    </div>
  );
}
