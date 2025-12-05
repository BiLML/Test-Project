import React from 'react';
import './Home.css';  // Đảm bảo bạn có tệp CSS riêng cho trang này

const Home = () => {
  return (
    <div className="home-container">
      <div className="home-content">
        <h1>Chào Mừng Đến Với Aura App</h1>
        <p>
          Chúng tôi cung cấp những dịch vụ tuyệt vời với chất lượng hàng đầu. Aura giúp bạn
          dễ dàng quản lý các công việc và phát triển bản thân một cách hiệu quả và thông minh.
        </p>
        <button className="cta-button">Khám Phá Ngay</button>
      </div>
      <div className="home-image">
        <img src="/images/landing-image.svg" alt="Aura App" />
      </div>
    </div>
  );
};

export default Home;
