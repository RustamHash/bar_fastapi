import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Typography, Button, Modal, Input, Space, Badge, Popover, Card,
  message, Popconfirm,
} from 'antd';
import { PlusOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { tablesApi, ordersApi } from '../api';
import OrderModal from '../components/OrderModal';

const { Title, Text } = Typography;

const TABLE_SIZE = { width: 80, height: 80 };

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export default function BarScreen() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [tableOrders, setTableOrders] = useState([]);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTable, setRenameTable] = useState(null);
  const [newNumber, setNewNumber] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const dragRef = useRef({ tableId: null, startX: 0, startY: 0, origX: 0, origY: 0 });
  const isAdmin = getUser()?.role === 'admin';

  const fetchTables = useCallback(async () => {
    try {
      const res = await tablesApi.list();
      setTables(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
    const interval = setInterval(fetchTables, 15000);
    return () => clearInterval(interval);
  }, [fetchTables]);

  const loadTableOrders = async (tableId) => {
    const res = await tablesApi.getOrders(tableId);
    setTableOrders(res.data);
  };

  const openNewOrder = (table) => {
    setSelectedTable(table);
    setCurrentOrder(null);
    setOrderModalOpen(true);
  };

  const openExistingOrder = async (table, orderId) => {
    setSelectedTable(table);
    const res = await ordersApi.get(orderId);
    setCurrentOrder(res.data);
    setOrderModalOpen(true);
  };

  const handleTableClick = async (table) => {
    if (editMode) {
      setRenameTable(table);
      setNewNumber(table.number);
      setRenameModalOpen(true);
      return;
    }
    if (!table.has_open_orders) {
      openNewOrder(table);
    } else {
      await loadTableOrders(table.id);
    }
  };

  const handleDeleteTable = async (tableId, e) => {
    e?.stopPropagation();
    try {
      await tablesApi.delete(tableId);
      message.success('Стол удалён');
      fetchTables();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка удаления');
    }
  };

  const handleRename = async () => {
    if (!renameTable || !newNumber.trim()) return;
    try {
      await tablesApi.update(renameTable.id, { number: newNumber.trim() });
      message.success('Номер обновлён');
      setRenameModalOpen(false);
      fetchTables();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    }
  };

  const handleAddTable = async () => {
    if (!newTableNumber.trim()) {
      message.error('Введите номер стола');
      return;
    }
    try {
      await tablesApi.create({
        number: newTableNumber.trim(),
        position_x: 200,
        position_y: 200,
      });
      message.success('Стол добавлен');
      setAddModalOpen(false);
      setNewTableNumber('');
      fetchTables();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    }
  };

  const handleDragStart = (e, table) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      tableId: table.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: table.position_x,
      origY: table.position_y,
    };
  };

  const handleDragMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag.tableId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setTables((prev) => prev.map((t) =>
      t.id === drag.tableId
        ? { ...t, position_x: Math.max(0, drag.origX + dx), position_y: Math.max(0, drag.origY + dy) }
        : t
    ));
  }, []);

  const handleDragEnd = useCallback(async () => {
    const drag = dragRef.current;
    if (!drag.tableId) return;
    const table = tables.find((t) => t.id === drag.tableId);
    dragRef.current = { tableId: null };
    if (!table) return;
    try {
      await tablesApi.update(table.id, {
        position_x: table.position_x,
        position_y: table.position_y,
      });
    } catch {
      message.error('Ошибка сохранения позиции');
      fetchTables();
    }
  }, [tables, fetchTables]);

  useEffect(() => {
    if (!editMode) return undefined;
    const onMove = (e) => handleDragMove(e);
    const onUp = () => handleDragEnd();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [editMode, handleDragMove, handleDragEnd]);

  const renderOrdersPopover = (table) => (
    <div style={{ width: 280 }}>
      {tableOrders.map((order) => (
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

  const renderTable = (table) => {
    const color = table.has_open_orders ? '#ff4d4f' : '#52c41a';
    const tableEl = (
      <div
        onMouseDown={(e) => handleDragStart(e, table)}
        onClick={() => handleTableClick(table)}
        style={{
          position: 'absolute',
          left: table.position_x,
          top: table.position_y,
          width: TABLE_SIZE.width,
          height: TABLE_SIZE.height,
          background: color,
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
        {editMode && (
          <Popconfirm
            title="Удалить стол?"
            onConfirm={(e) => handleDeleteTable(table.id, e)}
            onCancel={(e) => e?.stopPropagation()}
          >
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              style={{ position: 'absolute', top: 2, right: 2, color: '#fff' }}
              onClick={(e) => e.stopPropagation()}
            />
          </Popconfirm>
        )}
        <Text strong style={{ color: '#fff', fontSize: 14, textAlign: 'center', padding: '0 4px' }}>
          {table.number}
        </Text>
        {table.open_orders_count > 0 && (
          <Badge
            count={table.open_orders_count}
            style={{ marginTop: 4 }}
            color="#fff"
            styles={{ indicator: { color: '#ff4d4f', boxShadow: 'none' } }}
          />
        )}
      </div>
    );

    if (table.has_open_orders && !editMode) {
      return (
        <Popover
          key={table.id}
          content={renderOrdersPopover(table)}
          title={`Стол ${table.number}`}
          trigger="click"
          onOpenChange={(visible) => { if (visible) loadTableOrders(table.id); }}
        >
          {tableEl}
        </Popover>
      );
    }

    return <div key={table.id}>{tableEl}</div>;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>План зала</Title>
        <Space>
          {isAdmin && !editMode && (
            <Button icon={<EditOutlined />} onClick={() => setEditMode(true)}>
              Редактировать
            </Button>
          )}
          {isAdmin && editMode && (
            <>
              <Button icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
                Добавить стол
              </Button>
              <Button type="primary" onClick={() => setEditMode(false)}>
                Готово
              </Button>
            </>
          )}
          <Button onClick={fetchTables} loading={loading}>Обновить</Button>
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
        {tables.map(renderTable)}
      </div>

      <OrderModal
        open={orderModalOpen}
        table={selectedTable}
        order={currentOrder}
        onClose={() => { setOrderModalOpen(false); setCurrentOrder(null); }}
        onUpdated={fetchTables}
      />

      <Modal
        title="Изменить номер стола"
        open={renameModalOpen}
        onCancel={() => setRenameModalOpen(false)}
        onOk={handleRename}
        okText="Сохранить"
      >
        <Input
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          placeholder="Номер или название"
        />
      </Modal>

      <Modal
        title="Новый стол"
        open={addModalOpen}
        onCancel={() => { setAddModalOpen(false); setNewTableNumber(''); }}
        onOk={handleAddTable}
        okText="Добавить"
      >
        <Input
          value={newTableNumber}
          onChange={(e) => setNewTableNumber(e.target.value)}
          placeholder='Например: 7, "Бар", "У окна"'
          autoFocus
        />
      </Modal>
    </div>
  );
}
