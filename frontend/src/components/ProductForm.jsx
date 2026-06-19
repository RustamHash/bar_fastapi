import { useState, useEffect } from 'react';
import {
  Modal, Form, Input, InputNumber, Select, Switch, Tabs, Table, Button,
  Space, message, Typography,
} from 'antd';
import { PlusOutlined, DeleteOutlined, BarcodeOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { productsApi } from '../api';
import { caseInsensitiveFilterOption } from '../utils/selectFilter';
import { formatComponentUnitPrice, formatProductPrice } from '../utils/productPrice';

const CATEGORIES = [
  { value: 'beer', label: 'Пиво' },
  { value: 'snack', label: 'Закуски' },
  { value: 'packaging', label: 'Тара' },
  { value: 'other', label: 'Прочее' },
];

const UNITS = [
  { value: 'liter', label: 'Литр' },
  { value: 'piece', label: 'Штука' },
  { value: 'kg', label: 'Килограмм' },
];

export default function ProductForm({ open, product, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isKit, setIsKit] = useState(false);
  const [components, setComponents] = useState([]);
  const [availableComponents, setAvailableComponents] = useState([]);
  const [barcodes, setBarcodes] = useState([]);
  const [newBarcode, setNewBarcode] = useState('');

  useEffect(() => {
    if (open) {
      productsApi.availableComponents().then((res) => {
        setAvailableComponents(res.data);
      });
    }
  }, [open]);

  useEffect(() => {
    if (product) {
      form.setFieldsValue({
        name: product.name,
        category: product.category,
        unit: product.unit,
        retail_price: product.retail_price,
        min_stock: product.min_stock,
        is_kit: product.is_kit,
        kit_price_type: product.kit_price_type || 'manual',
        sellable: product.sellable ?? true,
      });
      setIsKit(product.is_kit);
      setComponents(
        (product.components || []).map((c, idx) => ({
          key: idx,
          component_id: c.component_id,
          quantity: c.quantity,
          show_in_receipt: c.show_in_receipt,
          show_in_order: c.show_in_order,
          price_override: c.price_override,
        }))
      );
      setBarcodes(
        (product.barcodes || []).map((bc) => ({
          id: bc.id,
          key: bc.id,
          barcode: bc.barcode,
          is_primary: bc.is_primary,
        }))
      );
    } else {
      form.resetFields();
      form.setFieldsValue({ kit_price_type: 'manual', min_stock: 0, sellable: true });
      setIsKit(false);
      setComponents([]);
      setBarcodes([]);
    }
    setNewBarcode('');
  }, [product, open, form]);

  const validateBarcode = (value) => {
    if (!value || !value.trim()) return null;
    if (!/^\d{8,13}$/.test(value.trim())) {
      return 'Штрихкод: 8–13 цифр (EAN-8/EAN-13)';
    }
    return null;
  };

  const handleGenerateBarcode = async () => {
    try {
      const res = await productsApi.generateBarcode();
      setNewBarcode(res.data.barcode);
      message.success('Штрихкод сгенерирован');
    } catch {
      message.error('Ошибка генерации штрихкода');
    }
  };

  const handleAddBarcode = () => {
    const trimmed = newBarcode.trim();
    const err = validateBarcode(trimmed);
    if (err) {
      message.error(err);
      return;
    }
    if (barcodes.some((bc) => bc.barcode === trimmed)) {
      message.error('Этот штрихкод уже добавлен');
      return;
    }
    setBarcodes([
      ...barcodes,
      {
        key: Date.now(),
        barcode: trimmed,
        is_primary: barcodes.length === 0,
      },
    ]);
    setNewBarcode('');
  };

  const handleRemoveBarcode = (key) => {
    const next = barcodes.filter((bc) => bc.key !== key);
    if (next.length && !next.some((bc) => bc.is_primary)) {
      next[0].is_primary = true;
    }
    setBarcodes(next);
  };

  const handleSetPrimary = (key) => {
    setBarcodes(barcodes.map((bc) => ({ ...bc, is_primary: bc.key === key })));
  };

  const syncBarcodes = async (productId) => {
    const existingIds = new Set(barcodes.filter((bc) => bc.id).map((bc) => bc.id));
    const originalIds = new Set((product?.barcodes || []).map((bc) => bc.id));

    for (const id of originalIds) {
      if (!existingIds.has(id)) {
        await productsApi.deleteBarcode(productId, id);
      }
    }

    for (const bc of barcodes) {
      if (bc.id) {
        const original = (product?.barcodes || []).find((b) => b.id === bc.id);
        if (original?.is_primary !== bc.is_primary && bc.is_primary) {
          await productsApi.setPrimaryBarcode(productId, bc.id);
        }
      } else {
        const res = await productsApi.addBarcode(productId, {
          barcode: bc.barcode,
          is_primary: bc.is_primary,
        });
        if (bc.is_primary && res.data.id) {
          await productsApi.setPrimaryBarcode(productId, res.data.id);
        }
      }
    }
  };

  const handleKitToggle = (checked) => {
    setIsKit(checked);
    if (checked) {
      const currentCategory = form.getFieldValue('category');
      if (!currentCategory || currentCategory === 'packaging') {
        form.setFieldsValue({ category: 'beer', unit: 'piece', sellable: true });
      }
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const data = {
        ...values,
        is_kit: isKit,
        kit_price_type: isKit ? values.kit_price_type : null,
        sellable: isKit ? true : (values.sellable ?? true),
        components: isKit
          ? components.map((c) => ({
              component_id: c.component_id,
              quantity: c.quantity,
              show_in_receipt: c.show_in_receipt ?? true,
              show_in_order: c.show_in_order ?? true,
              price_override: c.price_override || null,
            }))
          : [],
      };

      if (product) {
        await productsApi.update(product.id, data);
        await syncBarcodes(product.id);
        message.success('Товар обновлён');
      } else {
        const res = await productsApi.create(data);
        if (barcodes.length) {
          for (const bc of barcodes) {
            const bcRes = await productsApi.addBarcode(res.data.id, {
              barcode: bc.barcode,
              is_primary: bc.is_primary,
            });
            if (bc.is_primary && bcRes.data.id) {
              await productsApi.setPrimaryBarcode(res.data.id, bcRes.data.id);
            }
          }
        }
        message.success('Товар создан');
      }
      onSuccess();
      onClose();
    } catch (err) {
      if (err.response?.data?.detail) {
        message.error(typeof err.response.data.detail === 'string'
          ? err.response.data.detail
          : 'Ошибка сохранения');
      }
    } finally {
      setLoading(false);
    }
  };

  const addComponent = () => {
    setComponents([
      ...components,
      {
        key: Date.now(),
        component_id: null,
        quantity: 1,
        show_in_receipt: true,
        show_in_order: true,
        price_override: null,
      },
    ]);
  };

  const removeComponent = (key) => {
    setComponents(components.filter((c) => c.key !== key));
  };

  const updateComponent = (key, field, value) => {
    setComponents(components.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  };

  const componentColumns = [
    {
      title: 'Товар',
      dataIndex: 'component_id',
      render: (_, record) => (
        <Select
          showSearch
          style={{ width: 200 }}
          placeholder="Выберите товар"
          filterOption={caseInsensitiveFilterOption}
          value={record.component_id}
          onChange={(v) => updateComponent(record.key, 'component_id', v)}
          options={availableComponents.map((p) => ({
            value: p.id,
            label: `${p.name} (${formatProductPrice(p)})`,
          }))}
        />
      ),
    },
    {
      title: 'Кол-во',
      dataIndex: 'quantity',
      width: 100,
      render: (_, record) => (
        <InputNumber
          min={0.01}
          step={0.1}
          value={record.quantity}
          onChange={(v) => updateComponent(record.key, 'quantity', v)}
        />
      ),
    },
    {
      title: 'Цена/ед.',
      width: 100,
      render: (_, record) => (
        <InputNumber
          placeholder="Авто"
          min={0}
          value={record.price_override}
          onChange={(v) => updateComponent(record.key, 'price_override', v)}
        />
      ),
    },
    {
      title: 'В чеке',
      dataIndex: 'show_in_receipt',
      width: 80,
      render: (_, record) => (
        <Switch
          checked={record.show_in_receipt}
          onChange={(v) => updateComponent(record.key, 'show_in_receipt', v)}
        />
      ),
    },
    {
      title: 'В заказе',
      dataIndex: 'show_in_order',
      width: 80,
      render: (_, record) => (
        <Switch
          checked={record.show_in_order}
          onChange={(v) => updateComponent(record.key, 'show_in_order', v)}
        />
      ),
    },
    {
      title: '',
      width: 50,
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeComponent(record.key)}
        />
      ),
    },
  ];

  const barcodeColumns = [
    {
      title: 'Основной',
      width: 90,
      render: (_, record) => (
        <Button
          type="text"
          icon={record.is_primary ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
          onClick={() => handleSetPrimary(record.key)}
        />
      ),
    },
    { title: 'Штрихкод', dataIndex: 'barcode' },
    {
      title: '',
      width: 50,
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveBarcode(record.key)}
        />
      ),
    },
  ];

  const tabItems = [
    {
      key: 'main',
      label: 'Основное',
      children: (
        <>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label="Категория" rules={[{ required: true }]}>
            <Select options={CATEGORIES} />
          </Form.Item>
          <Form.Item name="unit" label="Ед. изм." rules={[{ required: true }]}>
            <Select options={UNITS} />
          </Form.Item>
          <Form.Item
            name="retail_price"
            label={isKit ? 'Цена продажи' : 'Розничная цена'}
            rules={[{ required: true }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} addonAfter="₽" />
          </Form.Item>
          {!isKit && (
            <Form.Item name="min_stock" label="Мин. остаток">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          )}
          {!isKit && (
            <>
              <Form.Item
                name="sellable"
                label="Доступен для продажи"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: -16, marginBottom: 16 }}>
                Если выключено — товар нельзя добавить в заказ, но можно принять в накладной
              </Typography.Text>
            </>
          )}
          <Form.Item label="Это комплект">
            <Switch checked={isKit} onChange={handleKitToggle} />
          </Form.Item>
          {isKit && (
            <Form.Item name="kit_price_type" label="Тип цены комплекта">
              <Select
                options={[
                  { value: 'manual', label: 'Ручная' },
                  { value: 'auto', label: 'Автоматическая (сумма компонентов)' },
                ]}
              />
            </Form.Item>
          )}
        </>
      ),
    },
  ];

  tabItems.push({
    key: 'barcodes',
    label: 'Штрихкоды',
    children: (
      <>
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input
            maxLength={13}
            placeholder="4601234567890"
            value={newBarcode}
            onChange={(e) => setNewBarcode(e.target.value)}
            onPressEnter={handleAddBarcode}
          />
          <Button icon={<BarcodeOutlined />} onClick={handleGenerateBarcode}>
            Сгенерировать
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddBarcode}>
            Добавить штрихкод
          </Button>
        </Space.Compact>
        <Table
          dataSource={barcodes}
          columns={barcodeColumns}
          pagination={false}
          size="small"
          rowKey="key"
        />
      </>
    ),
  });

  if (isKit) {
    tabItems.push({
      key: 'components',
      label: 'Компоненты',
      children: (
        <>
          <Button type="dashed" icon={<PlusOutlined />} onClick={addComponent} style={{ marginBottom: 16 }}>
            Добавить компонент
          </Button>
          <Table
            dataSource={components}
            columns={componentColumns}
            pagination={false}
            size="small"
          />
        </>
      ),
    });
  }

  return (
    <Modal
      title={product ? 'Редактировать товар' : 'Создать товар'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      width={800}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Tabs items={tabItems} />
      </Form>
    </Modal>
  );
}
