import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Button } from 'antd';
import {
  DashboardOutlined,
  ShoppingCartOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  DollarOutlined,
  BarChartOutlined,
  LogoutOutlined,
  InboxOutlined,
  TableOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = AntLayout;

const primaryColor = '#8B5E3C';
const headerBackground = '#3c2415';
const sidebarBackground = '#2c1810';
const bodyBackground = '#fdfaf5';
const accentColor = '#D4A574';

const menuItems = [
  { key: '/bar', icon: <TableOutlined />, label: 'План зала' },
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Дашборд' },
  { key: '/orders', icon: <ShoppingCartOutlined />, label: 'Заказы' },
  { key: '/products', icon: <AppstoreOutlined />, label: 'Товары' },
  { key: '/stock', icon: <DatabaseOutlined />, label: 'Остатки' },
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
  const currentUser = getCurrentUser();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const selectedKey = menuItems.find((item) => location.pathname.startsWith(item.key))?.key
    || location.pathname;

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsedWidth="0"
        theme="dark"
        style={{ background: sidebarBackground }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: accentColor,
          fontSize: 20,
          fontWeight: 'bold',
          gap: 8,
          background: sidebarBackground,
          borderBottom: `1px solid ${primaryColor}`,
        }}>
          <span style={{ fontSize: 28, lineHeight: 1 }} role="img" aria-label="медведь">🐻</span>
          Берлога
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: sidebarBackground }}
        />
      </Sider>
      <AntLayout>
        <Header style={{
          padding: '0 24px',
          background: headerBackground,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 16,
          borderBottom: `1px solid ${primaryColor}`,
        }}>
          {currentUser?.display_name && (
            <span style={{ color: accentColor }}>
              {currentUser.display_name}
            </span>
          )}
          <Button
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            style={{ color: accentColor, borderColor: primaryColor }}
          >
            Выход
          </Button>
        </Header>
        <Content style={{
          margin: 24,
          padding: 24,
          background: bodyBackground,
          borderRadius: 8,
          border: `1px solid ${primaryColor}22`,
        }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
