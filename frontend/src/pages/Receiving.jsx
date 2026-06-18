import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Tag, Space, Typography, Modal, Input, InputNumber,
  Progress, notification, message, Popconfirm, Select,
} from 'antd';
import {
  PlusOutlined, ScanOutlined, CheckOutlined, ArrowLeftOutlined, LinkOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { receivingApi, productsApi } from '../api';
import { BarcodeInput } from '../components/BarcodeInput';
import { playSound, getScanSoundType } from '../utils/sounds';

const { Title, Text } = Typography;

const STATUS_LABELS = {
  draft: { text: 'Черновик', color: 'default' },
  scanning: { text: 'Сканирование', color: 'processing' },
  confirmed: { text: 'Завершена', color: 'success' },
  cancelled: { text: 'Отменена', color: 'error' },
};

const ITEM_STATUS_LABELS = {
  pending: { text: 'Ожидает', color: 'default' },
  partial: { text: 'Частично', color: 'warning' },
  complete: { text: 'Готово', color: 'success' },
  over: { text: 'Перескан', color: 'orange' },
  unknown: { text: 'Неизвестный', color: 'error' },
};

export default function Receiving() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [activeSession, setActiveSession] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [draftItems, setDraftItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkItem, setLinkItem] = useState(null);
  const [linkProductId, setLinkProductId] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await receivingApi.listSessions();
      setSessions(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    productsApi.list().then((res) => setProducts(res.data));
  }, [fetchSessions]);

  const loadSession = async (id) => {
    const res = await receivingApi.getSession(id);
    setActiveSession(res.data);
    setView('scanning');
  };

  const handleDraftScan = async (barcode) => {
    try {
      const res = await productsApi.byBarcode(barcode);
      const product = res.data;
      const existing = draftItems.find((i) => i.product_id === product.id);
      if (existing) {
        setDraftItems(draftItems.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        ));
      } else {
        setDraftItems([...draftItems, {
          key: Date.now(),
          product_id: product.id,
          barcode: product.barcode,
          product_name: product.name,
          quantity: 1,
          purchase_price: null,
        }]);
      }
      playSound('success');
    } catch {
      Modal.confirm({
        title: 'Товар не найден',
        content: `Штрихкод ${barcode} не найден в системе. Пропустить?`,
        okText: 'Пропустить',
        cancelText: 'Отмена',
        onOk: () => playSound('error'),
      });
      playSound('error');
    }
  };

  const startReceiving = async () => {
    if (!supplier.trim()) {
      message.error('Укажите поставщика');
      return;
    }
    if (!draftItems.length) {
      message.error('Добавьте хотя бы одну позицию');
      return;
    }
    try {
      const res = await receivingApi.createSession({
        supplier: supplier.trim(),
        items: draftItems.map((i) => ({
          barcode: i.barcode,
          product_id: i.product_id,
          quantity: i.quantity,
          purchase_price: i.purchase_price,
        })),
      });
      setCreateOpen(false);
      setDraftItems([]);
      setSupplier('');
      await loadSession(res.data.session_id);
      fetchSessions();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка создания сессии');
    }
  };

  const handleScan = async (barcode) => {
    if (!activeSession) return;
    try {
      const res = await receivingApi.scan({
        session_id: activeSession.id,
        barcode,
      });
      const data = res.data;
      playSound(getScanSoundType(data.status));
      notification.open({
        message: data.product_name,
        description: `Отсканировано: ${data.scanned_quantity} / ${data.expected_quantity || '—'} (${data.session_progress}%)`,
        duration: 2,
      });
      const sessionRes = await receivingApi.getSession(activeSession.id);
      setActiveSession(sessionRes.data);
    } catch (err) {
      playSound('error');
      message.error(err.response?.data?.detail || 'Ошибка сканирования');
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const res = await receivingApi.confirm(activeSession.id);
      message.success(`Накладная #${res.data.invoice_id} создана`);
      setView('list');
      setActiveSession(null);
      fetchSessions();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка подтверждения');
    } finally {
      setConfirming(false);
    }
  };

  const handleLink = async () => {
    if (!linkProductId || !linkItem) return;
    try {
      await receivingApi.linkItem(activeSession.id, {
        item_id: linkItem.id,
        product_id: linkProductId,
      });
      message.success('Товар связан');
      setLinkModalOpen(false);
      const sessionRes = await receivingApi.getSession(activeSession.id);
      setActiveSession(sessionRes.data);
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка');
    }
  };

  const calcProgress = (session) => {
    if (!session?.items?.length) return 0;
    const complete = session.items.filter((i) => i.status === 'complete').length;
    return Math.round(complete / session.items.length * 100);
  };

  const sessionColumns = [
    { title: 'Поставщик', dataIndex: 'supplier' },
    {
      title: 'Статус',
      dataIndex: 'status',
      render: (s) => {
        const st = STATUS_LABELS[s] || { text: s, color: 'default' };
        return <Tag color={st.color}>{st.text}</Tag>;
      },
    },
    {
      title: 'Прогресс',
      render: (_, r) => `${r.scanned_items_count} / ${r.expected_items_count}`,
    },
    {
      title: 'Дата',
      dataIndex: 'created_at',
      render: (v) => dayjs(v).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: 'Действия',
      render: (_, r) => (
        r.status === 'scanning' || r.status === 'draft' ? (
          <Button size="small" icon={<ScanOutlined />} onClick={() => loadSession(r.id)}>
            Продолжить
          </Button>
        ) : (
          <Button size="small" onClick={() => loadSession(r.id)}>Просмотр</Button>
        )
      ),
    },
  ];

  const itemColumns = [
    { title: 'Название', dataIndex: 'product_name' },
    { title: 'Ожидалось', dataIndex: 'expected_quantity' },
    { title: 'Отсканировано', dataIndex: 'scanned_quantity' },
    {
      title: 'Статус',
      dataIndex: 'status',
      render: (s) => {
        const st = ITEM_STATUS_LABELS[s] || { text: s, color: 'default' };
        return <Tag color={st.color}>{st.text}</Tag>;
      },
    },
    {
      title: '',
      render: (_, r) => r.status === 'unknown' && activeSession?.status === 'scanning' ? (
        <Button
          size="small"
          icon={<LinkOutlined />}
          onClick={() => { setLinkItem(r); setLinkProductId(null); setLinkModalOpen(true); }}
        >
          Связать с товаром
        </Button>
      ) : null,
    },
  ];

  if (view === 'scanning' && activeSession) {
    const progress = calcProgress(activeSession);
    const isActive = activeSession.status === 'scanning' || activeSession.status === 'draft';

    return (
      <div>
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => { setView('list'); setActiveSession(null); }}>
            Назад
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            Приёмка: {activeSession.supplier}
          </Title>
        </Space>

        {isActive && (
          <div style={{ marginBottom: 24 }}>
            <BarcodeInput
              onScan={handleScan}
              style={{ fontSize: 24, padding: '12px 16px' }}
            />
          </div>
        )}

        <Progress percent={progress} style={{ marginBottom: 16 }} />

        <Table
          dataSource={activeSession.items}
          columns={itemColumns}
          rowKey="id"
          pagination={false}
          size="middle"
        />

        {isActive && (
          <Space style={{ marginTop: 24 }}>
            <Popconfirm title="Подтвердить приёмку и создать накладную?" onConfirm={handleConfirm}>
              <Button type="primary" icon={<CheckOutlined />} loading={confirming}>
                Завершить приёмку
              </Button>
            </Popconfirm>
          </Space>
        )}

        <Modal
          title="Связать с товаром"
          open={linkModalOpen}
          onCancel={() => setLinkModalOpen(false)}
          onOk={handleLink}
          okText="Связать"
        >
          <Select
            showSearch
            style={{ width: '100%' }}
            placeholder="Выберите товар"
            optionFilterProp="label"
            value={linkProductId}
            onChange={setLinkProductId}
            options={products.filter((p) => !p.is_kit).map((p) => ({
              value: p.id,
              label: `${p.name} (${p.barcode || 'без штрихкода'})`,
            }))}
          />
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Приёмка товаров</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Новая приёмка
        </Button>
      </div>

      <Table
        dataSource={sessions}
        columns={sessionColumns}
        rowKey="id"
        loading={loading}
      />

      <Modal
        title="Новая приёмка"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); setDraftItems([]); setSupplier(''); }}
        onOk={startReceiving}
        okText="Начать приёмку"
        width={800}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>Поставщик</Text>
          <Input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Название поставщика"
            style={{ marginTop: 8 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Text strong>Штрихкод</Text>
          <div style={{ marginTop: 8 }}>
            <BarcodeInput onScan={handleDraftScan} />
          </div>
        </div>

        <Table
          dataSource={draftItems}
          rowKey="key"
          pagination={false}
          size="small"
          columns={[
            { title: 'Название', dataIndex: 'product_name' },
            { title: 'Штрихкод', dataIndex: 'barcode' },
            {
              title: 'Кол-во',
              dataIndex: 'quantity',
              render: (v, r) => (
                <InputNumber
                  min={1}
                  value={v}
                  onChange={(val) => setDraftItems(draftItems.map((i) =>
                    i.key === r.key ? { ...i, quantity: val } : i
                  ))}
                />
              ),
            },
            {
              title: 'Закупочная цена',
              dataIndex: 'purchase_price',
              render: (v, r) => (
                <InputNumber
                  min={0}
                  placeholder="—"
                  value={v}
                  onChange={(val) => setDraftItems(draftItems.map((i) =>
                    i.key === r.key ? { ...i, purchase_price: val } : i
                  ))}
                />
              ),
            },
            {
              title: '',
              render: (_, r) => (
                <Button
                  type="text"
                  danger
                  onClick={() => setDraftItems(draftItems.filter((i) => i.key !== r.key))}
                >
                  Удалить
                </Button>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
