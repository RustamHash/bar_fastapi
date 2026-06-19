import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Tag, Space, Typography, Modal, Input, InputNumber,
  Progress, notification, message, Popconfirm, Select,
} from 'antd';
import {
  PlusOutlined, ScanOutlined, CheckOutlined, ArrowLeftOutlined, LinkOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { receivingApi, productsApi } from '../api';
import { caseInsensitiveFilterOption } from '../utils/selectFilter';
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

const productLabel = (p) => `${p.name} (${p.primary_barcode || 'без штрихкода'})`;

const formatBarcode = (barcode, manual) => {
  if (manual || !barcode) return 'вручную';
  return barcode;
};

export default function Receiving() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [activeSession, setActiveSession] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [draftItems, setDraftItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkItem, setLinkItem] = useState(null);
  const [linkProductId, setLinkProductId] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchProductId, setSearchProductId] = useState(null);
  const [unknownBarcode, setUnknownBarcode] = useState(null);
  const [draftLinkOpen, setDraftLinkOpen] = useState(false);

  const nonKitProducts = products.filter((p) => !p.is_kit);

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
    productsApi.getAll().then((res) => setProducts(res.data));
  }, [fetchSessions]);

  const loadSession = async (id) => {
    const res = await receivingApi.getSession(id);
    setActiveSession(res.data);
    setView('scanning');
  };

  const addDraftProduct = (product, { barcode = '', manual = false } = {}) => {
    const existing = draftItems.find((i) => i.product_id === product.id && i.manual === manual);
    if (existing) {
      setDraftItems(draftItems.map((i) =>
        i.product_id === product.id && i.manual === manual
          ? { ...i, quantity: i.quantity + 1 }
          : i
      ));
    } else {
      setDraftItems([...draftItems, {
        key: Date.now(),
        product_id: product.id,
        barcode,
        manual,
        product_name: product.name,
        quantity: 1,
        purchase_price: null,
      }]);
    }
    playSound('success');
  };

  const handleDraftScan = async (barcode) => {
    try {
      const res = await productsApi.byBarcode(barcode);
      addDraftProduct(res.data, { barcode });
    } catch {
      setUnknownBarcode(barcode);
      Modal.confirm({
        title: 'Товар не найден',
        content: `Штрихкод ${barcode} не найден в системе.`,
        okText: 'Связать с товаром',
        cancelText: 'Пропустить',
        onOk: () => {
          setDraftLinkOpen(true);
        },
        onCancel: () => playSound('error'),
      });
      playSound('error');
    }
  };

  const handleDraftLink = async () => {
    if (!linkProductId && !searchProductId) return;
    const productId = linkProductId || searchProductId;
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    if (unknownBarcode) {
      try {
        await productsApi.addBarcode(productId, { barcode: unknownBarcode, is_primary: false });
        addDraftProduct(product, { barcode: unknownBarcode });
        setUnknownBarcode(null);
        setDraftLinkOpen(false);
        setLinkProductId(null);
        message.success('Штрихкод привязан к товару');
      } catch (err) {
        message.error(err.response?.data?.detail || 'Ошибка привязки');
      }
      return;
    }

    addDraftProduct(product, { manual: true });
    setSearchOpen(false);
    setSearchProductId(null);
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
        invoice_number: invoiceNumber.trim() || null,
        items: draftItems.map((i) => ({
          barcode: i.manual ? null : (i.barcode || null),
          product_id: i.product_id,
          quantity: i.quantity,
          purchase_price: i.purchase_price,
        })),
      });
      setCreateOpen(false);
      setDraftItems([]);
      setSupplier('');
      setInvoiceNumber('');
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

  const handleScanManualAdd = async (productId) => {
    if (!activeSession || !productId) return;
    try {
      await receivingApi.addItem(activeSession.id, {
        product_id: productId,
        quantity: 1,
        purchase_price: null,
      });
      playSound('success');
      const sessionRes = await receivingApi.getSession(activeSession.id);
      setActiveSession(sessionRes.data);
      setSearchOpen(false);
      setSearchProductId(null);
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка добавления');
    }
  };

  const handleUpdateSessionItem = async (itemId, data) => {
    try {
      await receivingApi.updateItem(activeSession.id, itemId, data);
      const sessionRes = await receivingApi.getSession(activeSession.id);
      setActiveSession(sessionRes.data);
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка обновления');
    }
  };

  const handleDeleteSessionItem = async (itemId) => {
    try {
      await receivingApi.deleteItem(activeSession.id, itemId);
      const sessionRes = await receivingApi.getSession(activeSession.id);
      setActiveSession(sessionRes.data);
    } catch (err) {
      message.error(err.response?.data?.detail || 'Ошибка удаления');
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
      if (linkItem.barcode) {
        await productsApi.addBarcode(linkProductId, {
          barcode: linkItem.barcode,
          is_primary: false,
        });
      }
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
      title: 'Накладная',
      dataIndex: 'invoice_number',
      render: (v) => v || '—',
    },
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

  const scanningItemColumns = (isActive) => [
    { title: 'Название', dataIndex: 'product_name' },
    {
      title: 'Штрихкод',
      dataIndex: 'barcode',
      render: (v) => formatBarcode(v),
    },
    {
      title: 'Количество',
      dataIndex: 'scanned_quantity',
      render: (v, r) => isActive ? (
        <InputNumber
          min={0}
          value={v}
          onChange={(val) => handleUpdateSessionItem(r.id, { scanned_quantity: val })}
        />
      ) : v,
    },
    {
      title: 'Закупочная цена',
      dataIndex: 'purchase_price',
      render: (v, r) => isActive ? (
        <InputNumber
          min={0}
          placeholder="—"
          value={v}
          onChange={(val) => handleUpdateSessionItem(r.id, { purchase_price: val })}
        />
      ) : (v ?? '—'),
    },
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
      render: (_, r) => (
        <Space>
          {r.status === 'unknown' && isActive && (
            <Button
              size="small"
              icon={<LinkOutlined />}
              onClick={() => { setLinkItem(r); setLinkProductId(null); setLinkModalOpen(true); }}
            >
              Связать
            </Button>
          )}
          {isActive && (
            <Button type="text" danger onClick={() => handleDeleteSessionItem(r.id)}>
              Удалить
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const productSearchModal = (
    <Modal
      title="Поиск товара"
      open={searchOpen}
      onCancel={() => { setSearchOpen(false); setSearchProductId(null); }}
      onOk={() => {
        if (view === 'scanning') {
          handleScanManualAdd(searchProductId);
        } else {
          const product = products.find((p) => p.id === searchProductId);
          if (product) {
            addDraftProduct(product, { manual: true });
            setSearchOpen(false);
            setSearchProductId(null);
          }
        }
      }}
      okText="Добавить"
      okButtonProps={{ disabled: !searchProductId }}
    >
      <Select
        showSearch
        style={{ width: '100%' }}
        placeholder="Выберите товар"
        filterOption={caseInsensitiveFilterOption}
        value={searchProductId}
        onChange={setSearchProductId}
        options={nonKitProducts.map((p) => ({
          value: p.id,
          label: productLabel(p),
        }))}
      />
    </Modal>
  );

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
            {activeSession.invoice_number && (
              <Text type="secondary" style={{ fontSize: 16, marginLeft: 12 }}>
                № {activeSession.invoice_number}
              </Text>
            )}
          </Title>
        </Space>

        {isActive && (
          <Space style={{ marginBottom: 24, width: '100%' }} align="start">
            <BarcodeInput
              onScan={handleScan}
              style={{ fontSize: 24, padding: '12px 16px', flex: 1 }}
            />
            <Button
              icon={<SearchOutlined />}
              size="large"
              onClick={() => setSearchOpen(true)}
            >
              Поиск товара
            </Button>
          </Space>
        )}

        <Progress percent={progress} style={{ marginBottom: 16 }} />

        <Table
          dataSource={activeSession.items}
          columns={scanningItemColumns(isActive)}
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
            filterOption={caseInsensitiveFilterOption}
            value={linkProductId}
            onChange={setLinkProductId}
            options={nonKitProducts.map((p) => ({
              value: p.id,
              label: productLabel(p),
            }))}
          />
        </Modal>

        {productSearchModal}
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
        onCancel={() => {
          setCreateOpen(false);
          setDraftItems([]);
          setSupplier('');
          setInvoiceNumber('');
        }}
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
          <Text strong>Номер накладной</Text>
          <Input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="ПК-2024-001 (необязательно)"
            style={{ marginTop: 8 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Text strong>Штрихкод</Text>
          <Space style={{ marginTop: 8, width: '100%' }}>
            <BarcodeInput onScan={handleDraftScan} style={{ flex: 1 }} />
            <Button icon={<SearchOutlined />} onClick={() => setSearchOpen(true)}>
              Поиск товара
            </Button>
          </Space>
        </div>

        <Table
          dataSource={draftItems}
          rowKey="key"
          pagination={false}
          size="small"
          columns={[
            { title: 'Название', dataIndex: 'product_name' },
            {
              title: 'Штрихкод',
              render: (_, r) => formatBarcode(r.barcode, r.manual),
            },
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

      <Modal
        title="Связать штрихкод с товаром"
        open={draftLinkOpen}
        onCancel={() => { setDraftLinkOpen(false); setLinkProductId(null); setUnknownBarcode(null); }}
        onOk={handleDraftLink}
        okText="Связать и добавить"
        okButtonProps={{ disabled: !linkProductId }}
      >
        <Text>Штрихкод: <strong>{unknownBarcode}</strong></Text>
        <Select
          showSearch
          style={{ width: '100%', marginTop: 12 }}
          placeholder="Выберите товар"
          filterOption={caseInsensitiveFilterOption}
          value={linkProductId}
          onChange={setLinkProductId}
          options={nonKitProducts.map((p) => ({
            value: p.id,
            label: productLabel(p),
          }))}
        />
      </Modal>

      {productSearchModal}
    </div>
  );
}
