import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './dashboard';
import DashboardDr from './dashboarddr';
import './App.css';
import Register from './Register';
import Upload from './Upload';
import Analysis from './Analysis'; // Component hiển thị kết quả

const getUserRoleFromStorage = () => {
    try {
        const userInfoString = localStorage.getItem('user_info');
        if (userInfoString) {
            const userInfo = JSON.parse(userInfoString);
            return userInfo.role ? userInfo.role.toLowerCase() : null;
        }
    } catch (e) {
        console.error("Lỗi khi đọc user_info từ localStorage", e);
    }
    return null;
};

// 🛡️ Component Bảo Vệ Tuyến Đường
const ProtectedRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
    const isAuthenticated = !!localStorage.getItem('token');
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
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
          
          {/* 2. Các trang Bảo mật */}
          <Route path="/dashboard" element={<ProtectedRoute element={<Dashboard />} />} />
          <Route path="/dashboarddr" element={<ProtectedRoute element={<DashboardDr />} />} />
          <Route path="/upload" element={<ProtectedRoute element={<Upload />} />} />
          
          {/* --- SỬA DÒNG NÀY ĐỂ KHỚP VỚI DASHBOARD --- */}
          {/* Dashboard gọi /result/:id nên ở đây phải khai báo là /result/:id */}
          <Route path="/result/:id" element={<ProtectedRoute element={<Analysis />} />} />
          
          {/* 3. Trang mặc định */}
          <Route 
            path="/" 
            element={
              !!localStorage.getItem('token') 
                ? (
                     getUserRoleFromStorage() === 'doctor' 
                      ? <Navigate to="/dashboarddr" replace /> 
                      : <Navigate to="/dashboard" replace />
                  )
                  : <Navigate to="/login" replace />
            } 
          />

          {/* 4. Trang 404 */}
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