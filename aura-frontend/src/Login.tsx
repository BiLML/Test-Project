import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // 👈 Bổ sung
import './App.css'; 

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(''); 
  
  // Khởi tạo hook để điều hướng
  const navigate = useNavigate(); 

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); 

    try {
      // 1. Gọi API sang Server Python
      const response = await fetch('http://127.0.0.1:8000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.detail || 'Đăng nhập thất bại');
      } else {
        // alert(`Xin chào ${data.user_info.full_name}! Bạn là: ${data.user_info.role}`);
        
        // 2. Đăng nhập thành công: Lưu token và role
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('role', data.user_info.role);
        
        // 3. 🚀 CHUYỂN HƯỚNG TỚI TRANG CHỦ
        navigate('/dashboard'); 
      }

    } catch (err) {
      setError('Không thể kết nối đến Server Python!');
      console.error(err);
    }
  };

  return (
    <div className="login-box">
      <div className="form-title">
        {/* Giả sử bạn có file logo.svg */}
        <img src="/logo.svg" alt="AURA Logo" style={{ width: '80px', marginBottom: '10px' }} />
        <h3>Đăng Nhập</h3>
      </div>
      
      <form onSubmit={handleLogin}>
        {error && <p style={{color: 'red', marginBottom: '10px'}}>{error}</p>}

        <div className="input-group">
          {/* Font Awesome icon, đảm bảo bạn đã import thư viện này */}
          <i className="fas fa-envelope icon"></i>
          <input 
            type="text" 
            placeholder="Email hoặc Tên người dùng" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="input-group">
          <i className="fas fa-lock icon"></i>
          <input 
            type="password" 
            placeholder="Mật khẩu" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        
        <button type="submit">Đăng Nhập</button>

        <p className="forgot-password"><a href="#">Quên mật khẩu?</a></p>
        <div className="divider">Hoặc</div>
        
        <button type="button" className="social-button google-btn">
              <i className="fab fa-google"></i> Đăng nhập bằng Google
        </button>
        
        <div className="register-section">
            <p>Chưa có tài khoản?</p>
            <a href="#" className="register-link">Đăng Ký Ngay</a>
        </div>
      </form>
    </div>
  );
};

export default Login;