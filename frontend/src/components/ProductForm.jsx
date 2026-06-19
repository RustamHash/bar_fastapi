import { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, Switch, Tabs, Table, Button, Space, message, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, BarcodeOutlined } from '@ant-design/icons';
import { productsApi } from '../api';

const CATEGORIES = [
  { value: 'beer', label: 'Пиво' },
  { value: 'snack', label: 'Закуски' },
  { value: 'packaging', label: 'Тара' },
  { value: 'other', label: 'Прочее' },
  { value: 'kit', label: 'Комплект' },
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
        abv: product.abv,
        ibu: product.ibu,
        is_kit: product.is_kit,
        kit_price_type: product.kit_price_type || 'manual',
        barcode: product.barcode || '',
        show_in_search: product.show_in_search ?? true,
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
    } else {
      form.resetFields();
      form.setFieldsValue({ kit_price_type: 'manual', min_stock: 0, barcode: '', show_in_search: true });
      setIsKit(false);
      setComponents([]);
    }
  }, [product, open, form]);

  const handleGenerateBarcode = async () => {
    try {
      const res = await productsApi.generateBarcode();
      form.setFieldsValue({ barcode: res.data.barcode });
      message.success('Штрихкод сгенерирован');
    } catch {
      message.error('Ошибка генерации штрихкода');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const data = {
        ...values,
        barcode: values.barcode?.trim() || null,
        is_kit: isKit,
        kit_price_type: isKit ? values.kit_price_type : null,
        show_in_search: isKit ? true : (values.show_in_search ?? true),
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
        message.success('Товар обновлён');
      } else {
        await productsApi.create(data);
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
          optionFilterProp="label"
          value={record.component_id}
          onChange={(v) => updateComponent(record.key, 'component_id', v)}
          options={availableComponents.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.retail_price} ₽)`,
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
      title: 'Цена',
      dataIndex: 'price_override',
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
          <Form.Item name="retail_price" label="Розничная цена" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} addonAfter="₽" />
          </Form.Item>
          <Form.Item name="min_stock" label="Мин. остаток">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          {!isKit && (
            <>
              <Form.Item
                name="show_in_search"
                label="Показывать при продаже"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: -16, marginBottom: 16 }}>
                Если выключено — товар не виден при создании заказа, используется только как компонент комплекта
              </Typography.Text>
            </>
          )}
          {!isKit && (
            <Form.Item label="Штрихкод">
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item
                  name="barcode"
                  noStyle
                  rules={[
                    {
                      validator: (_, value) => {
                        if (!value || !value.trim()) return Promise.resolve();
                        if (/^\d{8,13}$/.test(value.trim())) return Promise.resolve();
                        return Promise.reject(new Error('Штрихкод: 8–13 цифр (EAN-8/EAN-13)'));
                      },
                    },
                  ]}
                >
                  <Input maxLength={13} placeholder="4601234567890" style={{ width: 'calc(100% - 140px)' }} />
                </Form.Item>
                <Button icon={<BarcodeOutlined />} onClick={handleGenerateBarcode}>
                  Сгенерировать
                </Button>
              </Space.Compact>
            </Form.Item>
          )}
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.category !== cur.category}>
            {({ getFieldValue }) =>
              getFieldValue('category') === 'beer' ? (
                <>
                  <Form.Item name="abv" label="ABV (%)">
                    <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="ibu" label="IBU">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </>
              ) : null
            }
          </Form.Item>
          <Form.Item label="Это комплект">
            <Switch checked={isKit} onChange={setIsKit} />
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
