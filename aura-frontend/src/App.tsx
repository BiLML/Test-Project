import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './dashboard';
import './App.css';

// 🛡️ Component Bảo Vệ Tuyến Đường
// Nhiệm vụ: Kiểm tra token trong localStorage. Nếu có, cho phép truy cập, nếu không, chuyển hướng về /login.
const ProtectedRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
    // Kiểm tra xem token có tồn tại trong localStorage không
    const isAuthenticated = !!localStorage.getItem('token');
    
    // Nếu chưa đăng nhập, chuyển hướng về /login
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
    
    // Nếu đã đăng nhập, hiển thị component yêu cầu
    return element;
};

const App: React.FC = () => {
  return (
    <Router>
      <div className="app-container">
        <Routes>
          {/* 1. Tuyến đường Đăng nhập (Công khai) */}
          <Route path="/login" element={<Login />} />
          
          {/* 2. Tuyến đường Trang Chủ (Bảo vệ) */}
          {/* Khi truy cập /dashboard, ProtectedRoute sẽ kiểm tra trạng thái đăng nhập */}
          <Route path="/dashboard" element={<ProtectedRoute element={<Dashboard />} />} />
          
          {/* 3. Tuyến đường Mặc định (/) */}
          {/* Nếu người dùng truy cập / mà đã có token thì vào /dashboard, ngược lại vào /login */}
          <Route 
            path="/" 
            element={
                !!localStorage.getItem('token') 
                ? <Navigate to="/dashboard" replace /> 
                : <Navigate to="/login" replace />
            } 
          />

          {/* Xử lý 404 */}
          <Route path="*" element={
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <h1>404</h1>
              <p>Không tìm thấy trang. <a href="/">Quay về trang chính</a></p>
            </div>
          } />
        </Routes>
      </div>
    </Router>
  );
};

export default App;