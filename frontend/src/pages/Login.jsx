import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Select } from 'antd';
import { authApi } from '../api';

const { Title } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const res = await authApi.login(values.username, values.password);
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('user', JSON.stringify({
        username: res.data.username,
        display_name: res.data.display_name,
        role: res.data.role,
      }));
      message.success(`Добро пожаловать, ${res.data.display_name}!`);
      navigate('/bar');
    } catch {
      message.error('Неверный логин или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #2c1810 0%, #4a2c17 50%, #8B5E3C 100%)',
    }}>
      <Card style={{ width: 400, background: '#ffffff', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <span style={{ fontSize: 56, lineHeight: 1 }} role="img" aria-label="медведь">🐻</span>
          <Title level={2} style={{ marginTop: 8, color: '#8B5E3C' }}>Берлога</Title>
          <Typography.Text type="secondary">Система управления баром</Typography.Text>
        </div>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="username" label="Пользователь" rules={[{ required: true }]}>
            <Select placeholder="Выберите пользователя" size="large">
              <Select.Option value="amir">Амир Русланович</Select.Option>
              <Select.Option value="adam">Адам Аскерович</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Введите пароль' }]}>
            <Input.Password size="large" placeholder="Пароль" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Войти
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
