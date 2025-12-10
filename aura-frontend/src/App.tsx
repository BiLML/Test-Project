import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './dashboard';
import DashboardDr from './dashboarddr';
import './App.css';
import Register from './Register';
import Upload from './Upload'; // <--- Import
import Analysis from './Analysis'; // Chỉnh đường dẫn cho đúng nơi bạn lưu file

const getUserRoleFromStorage = () => {
    try {
        const userInfoString = localStorage.getItem('user_info');
        if (userInfoString) {
            const userInfo = JSON.parse(userInfoString);
            console.log("Vai trò đọc được:", userInfo.role);
            return userInfo.role ? userInfo.role.toLowerCase() : null;
        }
    } catch (e) {
        console.error("Lỗi khi đọc user_info từ localStorage", e);
    }
    return null;
};
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
          {/* 1. Các trang Công khai */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* 2. Các trang Bảo mật (Cần đăng nhập) */}
          <Route path="/dashboard" element={<ProtectedRoute element={<Dashboard />} />} />
          {/* Route cho DashboardDr */ }
          <Route path="/dashboarddr" element={<ProtectedRoute element={<DashboardDr />} />} />
          {/* --- ĐƯA ROUTE UPLOAD LÊN ĐÂY --- */}
          <Route path="/upload" element={<ProtectedRoute element={<Upload />} />} />
          
          {/* 3. Trang mặc định */}
        <Route 
            path="/" 
            element={
              !!localStorage.getItem('token') // Nếu đã đăng nhập
                ? (
                     getUserRoleFromStorage() === 'doctor' // Kiểm tra vai trò
                      ? <Navigate to="/dashboarddr" replace /> // Nếu là BS, chuyển đến /dashboarddr
                      : <Navigate to="/dashboard" replace /> // Nếu là người dùng khác, chuyển đến /dashboard
                  )
                  : <Navigate to="/login" replace /> // Nếu chưa đăng nhập
            } 
          />

          <Route path="/analysis/:id" element={<ProtectedRoute element={<Analysis />} />} />

          {/* 4. Trang 404 (Luôn để cuối cùng) */}
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