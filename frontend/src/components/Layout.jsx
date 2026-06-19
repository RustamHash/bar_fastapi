import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Button, theme } from 'antd';
import {
  DashboardOutlined,
  ShoppingCartOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  DollarOutlined,
  BarChartOutlined,
  LogoutOutlined,
  CoffeeOutlined,
  InboxOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = AntLayout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Дашборд' },
  { key: '/orders', icon: <ShoppingCartOutlined />, label: 'Заказы' },
  { key: '/products', icon: <AppstoreOutlined />, label: 'Товары' },
  { key: '/invoices', icon: <FileTextOutlined />, label: 'Накладные' },
  { key: '/receiving', icon: <InboxOutlined />, label: 'Приёмка' },
  { key: '/cash', icon: <DollarOutlined />, label: 'Касса' },
  { key: '/reports', icon: <BarChartOutlined />, label: 'Отчёты' },
];

function getCurrentUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token: { colorBgContainer } } = theme.useToken();
  const currentUser = getCurrentUser();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" theme="dark">
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 20,
          fontWeight: 'bold',
          gap: 8,
        }}>
          <CoffeeOutlined style={{ fontSize: 24 }} />
          BeerPub
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <AntLayout>
        <Header style={{
          padding: '0 24px',
          background: colorBgContainer,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 16,
        }}>
          {currentUser?.display_name && (
            <span style={{ color: 'rgba(0, 0, 0, 0.65)' }}>
              {currentUser.display_name}
            </span>
          )}
          <Button icon={<LogoutOutlined />} onClick={handleLogout}>
            Выход
          </Button>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: colorBgContainer, borderRadius: 8 }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
