import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css'; 

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    userName: '',
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

    // Kiểm tra mật khẩu nhập lại
    if (formData.password !== formData.confirm_password) {
      setError("Mật khẩu xác nhận không khớp!");
      return;
    }

    try {
      const response = await fetch('http://127.0.0.1:8000/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: formData.userName,
          password: formData.password,
          // role: "USER" // Backend đã để mặc định, không cần gửi cũng được
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Lỗi do Server trả về (VD: Tài khoản trùng, mật khẩu yếu...)
        setError(data.detail || "Đăng ký thất bại");
      } else {
        alert("Đăng ký thành công! Hãy đăng nhập ngay.");
        navigate('/login'); // Sửa thành /login cho rõ ràng hơn /
      }
    } catch (err) {
      // Lỗi do mất mạng hoặc Server chưa bật
      console.error(err);
      setError("Không thể kết nối đến Server! Vui lòng kiểm tra lại.");
    }
  };

  return (
    <div className="login-box">
      <div className="form-title">
        <img src="/logo.svg" alt="AURA Logo" style={{ width: '80px', marginBottom: '10px' }} />
        <h3>Đăng Ký Tài Khoản</h3>
      </div>
      
      <form onSubmit={handleRegister}>
        {error && <p style={{color: 'red', textAlign: 'center'}}>{error}</p>}

        <div className="input-group">
          <i className="fas fa-user icon"></i> {/* Đổi icon thành User */}
          <input 
            type="text" // --- SỬA LẠI: type="text" mới đúng HTML ---
            name="userName" 
            placeholder="Tên tài khoản" 
            required 
            onChange={handleChange}
          />
        </div>

        <div className="input-group">
          <i className="fas fa-lock icon"></i>
          <input 
            type="password" 
            name="password" 
            placeholder="Mật khẩu" 
            required 
            onChange={handleChange}
          />
        </div>

        <div className="input-group">
          <i className="fas fa-check-circle icon"></i> {/* Đổi icon check cho đẹp */}
          <input 
            type="password" 
            name="confirm_password" 
            placeholder="Xác nhận mật khẩu" 
            required 
            onChange={handleChange}
          />
        </div>
        
        <button type="submit">Đăng Ký Ngay</button>

        <div className="register-section">
            <p>Đã có tài khoản?</p>
            <span 
                style={{cursor: 'pointer', color: 'blue', fontWeight: 'bold'}} 
                onClick={() => navigate('/login')} 
                className="register-link"
            >
                Quay lại Đăng Nhập
            </span>
        </div>
      </form>
    </div>
  );
};

export default Register;