import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css'; 

const Register = () => {
  const navigate = useNavigate();
  
  // SỬA 1: Thêm email và full_name vào state
  const [formData, setFormData] = useState({
    username: '',
    email: '',      // Mới thêm
    full_name: '',  // Mới thêm
    password: '',
    confirm_password: ''
  });
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirm_password) {
      setError("Mật khẩu xác nhận không khớp!");
      return;
    }

    try {
      // Endpoint chính xác từ ảnh Swagger
      const API_URL = 'http://localhost:8000/api/v1/auth/register'; 
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // SỬA 2: Gửi đủ 4 trường backend yêu cầu
          username: formData.username,
          email: formData.email,
          full_name: formData.full_name,
          password: formData.password
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Xử lý lỗi validation từ FastAPI (thường là mảng object)
        let msg = "Đăng ký thất bại";
        if (data.detail) {
            msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
        }
        setError(msg);
      } else {
        alert("Đăng ký thành công! Hãy đăng nhập ngay.");
        navigate('/login');
      }
    } catch (err) {
      console.error(err);
      setError("Không thể kết nối đến Server!");
    }
  };

  return (
    <div className="login-box" style={{height: 'auto', padding: '30px 20px'}}> 
      {/* Tăng chiều cao box vì form dài hơn */}
      <div className="form-title">
        <h3>Create Account</h3>
      </div>
      
      <form onSubmit={handleRegister}>
        {error && <p style={{color: '#ff6b6b', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9em'}}>{error}</p>}

        {/* 1. USERNAME */}
        <div className="input-group">
          <i className="fas fa-user icon"></i>
          <input 
            type="text"
            name="username"
            placeholder="Username" 
            required 
            onChange={handleChange}
            value={formData.username}
          />
        </div>

        {/* 2. EMAIL (MỚI) */}
        <div className="input-group">
          <i className="fas fa-envelope icon"></i>
          <input 
            type="email"
            name="email"
            placeholder="Email Address" 
            required 
            onChange={handleChange}
            value={formData.email}
          />
        </div>

        {/* 3. FULL NAME (MỚI) */}
        <div className="input-group">
          <i className="fas fa-id-card icon"></i>
          <input 
            type="text"
            name="full_name"
            placeholder="Full Name" 
            required 
            onChange={handleChange}
            value={formData.full_name}
          />
        </div>

        {/* 4. PASSWORD */}
        <div className="input-group">
          <i className="fas fa-lock icon"></i>
          <input 
            type="password" 
            name="password" 
            placeholder="Password" 
            required 
            onChange={handleChange}
            value={formData.password}
          />
        </div>

        {/* 5. CONFIRM PASSWORD */}
        <div className="input-group">
          <i className="fas fa-check-circle icon"></i>
          <input 
            type="password" 
            name="confirm_password" 
            placeholder="Confirm Password" 
            required 
            onChange={handleChange}
            value={formData.confirm_password}
          />
        </div>
        
        <button type="submit" style={{marginTop: '10px'}}>Register Now</button>

        <div className="register-section">
            <p>Already have an account?</p>
            <span 
                style={{cursor: 'pointer', marginLeft: '5px', fontWeight: 'bold', color: '#fff'}} 
                onClick={() => navigate('/login')} 
                className="register-link"
            >
                Login here
            </span>
        </div>
      </form>
    </div>
  );
};

export default Register;