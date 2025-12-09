import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const AnalysisResult: React.FC = () => {
    const { id } = useParams(); // Lấy ID từ URL
    const navigate = useNavigate();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            const token = localStorage.getItem('token');
            if (!token) return navigate('/login');

            try {
                const res = await fetch(`http://127.0.0.1:8000/api/medical-records/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const result = await res.json();
                    setData(result);
                } else {
                    alert("Không tìm thấy hồ sơ!");
                    navigate('/dashboard');
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id, navigate]);

    if (loading) return <div style={{padding: '50px', textAlign: 'center'}}>Đang tải kết quả phân tích...</div>;

    if (!data) return null;

    // Màu sắc dựa trên kết quả
    const isDanger = data.result.includes("Cao") || data.result.includes("Trung bình");
    const statusColor = isDanger ? '#dc3545' : '#28a745';

    return (
        <div style={styles.container}>
            <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>&larr; Quay lại Dashboard</button>
            
            <div style={styles.card}>
                <div style={styles.header}>
                    <h2 style={{margin: 0}}>👁️ Kết quả Phân tích AI</h2>
                    <span style={styles.dateBadge}>{data.date} - {data.time}</span>
                </div>

                <div style={styles.contentGrid}>
                    {/* Cột Trái: Ảnh */}
                    <div style={styles.imageSection}>
                        <img src={data.image_url} alt="Retina Scan" style={styles.image} />
                    </div>

                    {/* Cột Phải: Kết quả */}
                    <div style={styles.infoSection}>
                        <div style={{marginBottom: '20px'}}>
                            <label style={styles.label}>Trạng thái xử lý:</label>
                            <div style={{...styles.statusTag, backgroundColor: data.status === 'Hoàn thành' ? '#d4edda' : '#fff3cd', color: data.status === 'Hoàn thành' ? '#155724' : '#856404'}}>
                                {data.status}
                            </div>
                        </div>

                        <div style={{marginBottom: '20px'}}>
                            <label style={styles.label}>Kết quả chẩn đoán:</label>
                            <h3 style={{marginTop: '5px', color: statusColor, fontSize: '24px'}}>
                                {data.result}
                            </h3>
                            <p style={{color: '#666', lineHeight: '1.5'}}>
                                {isDanger 
                                    ? "⚠️ Hệ thống phát hiện dấu hiệu bất thường. Vui lòng đặt lịch hẹn với bác sĩ chuyên khoa ngay để được tư vấn chi tiết." 
                                    : "✅ Võng mạc của bạn có vẻ khỏe mạnh. Hãy duy trì thói quen kiểm tra định kỳ 6 tháng/lần."}
                            </p>
                        </div>

                        <div style={styles.doctorNote}>
                            <strong>📝 Ghi chú bác sĩ:</strong>
                            <p style={{margin: '5px 0 0'}}>{data.doctor_note}</p>
                        </div>
                        
                        <button style={styles.actionBtn}>Đặt lịch khám ngay</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: { padding: '40px', backgroundColor: '#f4f6f9', minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif" },
    backBtn: { background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', fontSize: '16px', marginBottom: '20px', fontWeight: 'bold' },
    card: { backgroundColor: 'white', borderRadius: '16px', padding: '40px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', maxWidth: '1000px', margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '1px solid #eee', paddingBottom: '20px' },
    dateBadge: { backgroundColor: '#f1f5f9', padding: '8px 16px', borderRadius: '20px', color: '#64748b', fontWeight: '500' },
    contentGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' },
    imageSection: { display: 'flex', justifyContent: 'center', alignItems: 'start', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden', height: '400px' },
    image: { width: '100%', height: '100%', objectFit: 'contain' },
    infoSection: { display: 'flex', flexDirection: 'column' },
    label: { fontSize: '14px', color: '#999', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' },
    statusTag: { display: 'inline-block', padding: '5px 12px', borderRadius: '15px', fontSize: '14px', fontWeight: 'bold', marginTop: '5px' },
    doctorNote: { backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', border: '1px solid #ffeeba', marginTop: 'auto', marginBottom: '20px', color: '#856404' },
    actionBtn: { width: '100%', padding: '15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }
};

export default AnalysisResult;