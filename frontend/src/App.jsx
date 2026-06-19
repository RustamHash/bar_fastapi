import { Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import BarScreen from './pages/BarScreen';
import Products from './pages/Products';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import Stock from './pages/Stock';
import CashRegister from './pages/CashRegister';
import Reports from './pages/Reports';
import Receiving from './pages/Receiving';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

const berlogaTheme = {
  token: {
    colorPrimary: '#8B5E3C',
    colorBgBase: '#fdfaf5',
    colorTextBase: '#2c1810',
    colorBgContainer: '#ffffff',
    borderRadius: 6,
  },
  components: {
    Layout: {
      headerBg: '#3c2415',
      siderBg: '#2c1810',
      bodyBg: '#fdfaf5',
    },
    Menu: {
      darkItemBg: '#2c1810',
      darkItemSelectedBg: '#8B5E3C',
      darkItemColor: '#D4A574',
    },
    Card: {
      colorBgContainer: '#ffffff',
    },
    Table: {
      headerBg: '#f5f0e8',
      colorBgContainer: '#ffffff',
    },
  },
};

export default function App() {
  return (
    <ConfigProvider locale={ruRU} theme={berlogaTheme}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/bar" replace />} />
          <Route path="bar" element={<BarScreen />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="products" element={<Products />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="stock" element={<Stock />} />
          <Route path="receiving" element={<Receiving />} />
          <Route path="cash" element={<CashRegister />} />
          <Route path="reports" element={<Reports />} />
        </Route>
      </Routes>
    </ConfigProvider>
  );
}
