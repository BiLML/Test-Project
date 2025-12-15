import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const AnalysisResult: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    
    // --- MAIN STATE ---
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'original' | 'annotated'>('annotated'); // Mặc định hiển thị ảnh AI trước

    // --- STATE CHO BÁC SĨ ---
    const [isDoctor, setIsDoctor] = useState(false);
    const [doctorNote, setDoctorNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);

    // LOGIC 1: MÀU SẮC CẢNH BÁO
    const getSeverityInfo = (diagnosis: string) => {
        if (!diagnosis) return { color: '#6c757d', label: 'Đang xử lý...', bg: '#f8f9fa' };
        
        // Logic khớp với Backend mới
        if (diagnosis.includes("Nặng") || diagnosis.includes("Severe")) {
            return { color: '#dc3545', label: 'NGUY HIỂM', bg: '#f8d7da', advice: '⚠️ CẢNH BÁO: Phát hiện nhiều tổn thương nghiêm trọng. Cần can thiệp y tế ngay lập tức.' };
        }
        if (diagnosis.includes("Trung bình") || diagnosis.includes("Moderate")) {
            return { color: '#fd7e14', label: 'CẢNH BÁO', bg: '#ffe5d0', advice: '⚠️ Tổn thương mức độ trung bình. Cần khám chuyên sâu để ngăn chặn biến chứng.' };
        }
        if (diagnosis.includes("Nhẹ") || diagnosis.includes("Mild")) {
            return { color: '#ffc107', label: 'LƯU Ý', bg: '#fff3cd', advice: 'ℹ️ Phát hiện dấu hiệu sớm (Vi phình mạch). Cần theo dõi định kỳ 3 tháng/lần.' };
        }
        return { color: '#28a745', label: 'AN TOÀN', bg: '#d4edda', advice: '✅ Võng mạc ổn định. Không phát hiện tổn thương đáng kể.' };
    };

    // LOGIC 2: LOAD DATA
    const fetchData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login');
            return "FAILED";
        }

        try {
            // 1. Check Role
            const userRes = await fetch('http://127.0.0.1:8000/api/users/me', { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            
            let isDoc = false;
            if (userRes.ok) {
                const userData = await userRes.json();
                isDoc = userData.user_info.role === 'DOCTOR';
                setIsDoctor(isDoc);
            }

            // 2. Load Bệnh án
            const res = await fetch(`http://127.0.0.1:8000/api/medical-records/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const result = await res.json();
                setData(result);
                
                // Nếu là bác sĩ, load ghi chú vào ô nhập liệu
                if (isDoc) {
                    setDoctorNote(result.doctor_note || '');
                }
                
                // Nếu đã có ảnh AI, tự động chuyển sang chế độ xem AI
                if (result.annotated_image_url && viewMode === 'original') {
                     setViewMode('annotated');
                }

                return result.status; 
            } else {
                navigate(isDoc ? '/dashboarddr' : '/dashboard');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
        return "FAILED";
    }, [id, navigate]);

    // Polling: Cập nhật trạng thái mỗi 2 giây nếu đang xử lý
    useEffect(() => {
        fetchData();
        const intervalId = setInterval(async () => {
            const status = await fetchData();
            if (status === "Hoàn thành" || status === "FAILED") {
                clearInterval(intervalId); 
            }
        }, 2000);
        return () => clearInterval(intervalId);
    }, [fetchData]);

    // LOGIC 3: LƯU GHI CHÚ
    const handleSaveDoctorNote = async () => {
        if (!doctorNote.trim()) return;
        const token = localStorage.getItem('token');
        setIsSavingNote(true);

        try {
            const res = await fetch(`http://127.0.0.1:8000/api/medical-records/${id}/note`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ doctor_note: doctorNote })
            });

            if (res.ok) {
                alert("Lưu ghi chú thành công!");
                setData((prev: any) => ({ ...prev, doctor_note: doctorNote }));
            } else {
                alert("Lỗi khi lưu.");
            }
        } catch (error) {
            alert("Lỗi kết nối server.");
        } finally {
            setIsSavingNote(false);
        }
    };

    if (loading) return <div style={styles.loadingScreen}><div><div style={styles.spinner}></div><p>Đang tải dữ liệu AURA...</p></div></div>;
    if (!data) return null;

    const severity = getSeverityInfo(data.result);
    
    // Chọn ảnh để hiển thị
    const imageUrl = viewMode === 'annotated' && data.annotated_image_url
        ? data.annotated_image_url 
        : data.image_url;

    return (
        <div style={styles.container}>
            <button onClick={() => navigate(isDoctor ? '/dashboarddr' : '/dashboard')} style={styles.backBtn}>&larr; Quay lại</button>
            
            <div style={styles.card}>
                {/* HEADER */}
                <div style={styles.header}>
                    <div>
                        <h2 style={{margin: 0, fontSize: '24px'}}>👁️ Kết quả Phân tích AURA</h2>
                        <p style={{margin: '5px 0 0 0', color: '#666', fontSize: '14px'}}>Mã hồ sơ: {data.id}</p>
                    </div>
                    <span style={styles.dateBadge}>{data.date} - {data.time}</span>
                </div>

                <div style={styles.contentGrid}>
                    {/* CỘT TRÁI: ẢNH & VISUALIZATION */}
                    <div style={styles.leftColumn}>
                        <div style={styles.imageContainer}>
                            <img 
                                src={imageUrl} 
                                alt="Retina Scan" 
                                style={styles.image} 
                            />
                            
                            {/* Nút chuyển đổi chế độ xem */}
                            {data.annotated_image_url && (
                                <div style={styles.toggleContainer}>
                                    <button 
                                        onClick={() => setViewMode('original')}
                                        style={viewMode === 'original' ? styles.toggleActive : styles.toggleBtn}
                                    >
                                        Ảnh Gốc
                                    </button>
                                    <button 
                                        onClick={() => setViewMode('annotated')}
                                        style={viewMode === 'annotated' ? styles.toggleActive : styles.toggleBtn}
                                    >
                                        ✨ AI Quét (Scan)
                                    </button>
                                </div>
                            )}

                            {/* Loading Overlay */}
                            {data.status !== 'Hoàn thành' && (
                                <div style={styles.processingOverlay}>
                                    <div style={styles.spinner}></div>
                                    <p style={{color: 'white', marginTop: '15px', fontWeight: '500'}}>AI đang vẽ bản đồ tổn thương...</p>
                                </div>
                            )}
                        </div>

                        {/* CHÚ THÍCH MÀU SẮC (LEGEND) - QUAN TRỌNG CHO BẢN ĐỒ MỚI */}
                        {viewMode === 'annotated' && data.status === 'Hoàn thành' && (
                            <div style={styles.legendBox}>
                                <h4 style={{margin: '0 0 10px 0', fontSize: '13px', textTransform: 'uppercase', color: '#555'}}>Chú giải bản đồ AURA:</h4>
                                <div style={styles.legendGrid}>
                                    <div style={styles.legendItem}><span style={{...styles.dot, background: 'red'}}></span>Xuất huyết (Máu)</div>
                                    <div style={styles.legendItem}><span style={{...styles.dot, background: 'yellow'}}></span>Xuất tiết (Mỡ/Dịch)</div>
                                    <div style={styles.legendItem}><span style={{...styles.dot, background: '#00ff00'}}></span>Mạch máu</div>
                                    <div style={styles.legendItem}><span style={{...styles.dot, background: 'blue'}}></span>Đĩa thị (Gai thị)</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* CỘT PHẢI: THÔNG TIN & CHẨN ĐOÁN */}
                    <div style={styles.rightColumn}>
                        {data.status !== 'Hoàn thành' ? (
                            <div style={styles.pendingBox}>
                                <h3>🔄 Đang xử lý...</h3>
                                <p>Hệ thống đang chạy 6 mô hình AI để phân tách mạch máu và tổn thương.</p>
                            </div>
                        ) : (
                            <>
                                {/* KẾT QUẢ CHÍNH */}
                                <div style={styles.resultBox}>
                                    <label style={styles.label}>Tình trạng võng mạc:</label>
                                    <h1 style={{color: severity.color, margin: '5px 0 15px 0', fontSize: '32px'}}>{data.result}</h1>
                                    
                                    <div style={{backgroundColor: severity.bg, padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${severity.color}`}}>
                                        <p style={{margin: 0, color: '#333', fontSize: '15px'}}>{severity.advice}</p>
                                    </div>
                                </div>

                                {/* CHI TIẾT PHÂN TÍCH (Lấy từ doctor_note do Backend tạo ra) */}
                                <div style={styles.analysisDetails}>
                                    <h4 style={{color: '#0056b3', borderBottom: '1px solid #eee', paddingBottom: '8px'}}>📊 Phân tích chi tiết & Rủi ro:</h4>
                                    <div style={{whiteSpace: 'pre-line', lineHeight: '1.6', color: '#444', fontSize: '14px'}}>
                                        {/* Backend mới lưu chi tiết phân tích vào trường doctor_note ban đầu */}
                                        {data.doctor_note || "Chưa có dữ liệu chi tiết."}
                                    </div>
                                </div>

                                {/* KHU VỰC CỦA BÁC SĨ (EDIT) */}
                                {isDoctor && (
                                    <div style={styles.doctorArea}>
                                        <h4 style={{fontSize: '14px', marginBottom: '10px'}}>📝 Chỉnh sửa Chẩn đoán:</h4>
                                        <textarea
                                            value={doctorNote}
                                            onChange={(e) => setDoctorNote(e.target.value)}
                                            style={styles.textArea}
                                            rows={4}
                                        />
                                        <button 
                                            onClick={handleSaveDoctorNote} 
                                            style={styles.saveBtn} 
                                            disabled={isSavingNote}
                                        >
                                            {isSavingNote ? 'Đang lưu...' : 'Lưu cập nhật'}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    container: { padding: '30px', backgroundColor: '#f0f2f5', minHeight: '100vh', fontFamily: 'Segoe UI, sans-serif' },
    loadingScreen: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#666' },
    backBtn: { border: 'none', background: 'none', color: '#007bff', cursor: 'pointer', marginBottom: '15px', fontSize: '16px', fontWeight: '600' },
    card: { backgroundColor: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', maxWidth: '1100px', margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '30px', borderBottom: '1px solid #eee', paddingBottom: '20px' },
    dateBadge: { background: '#f8f9fa', padding: '5px 12px', borderRadius: '15px', fontSize: '13px', color: '#666' },
    contentGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' },
    
    // Left Column
    leftColumn: { display: 'flex', flexDirection: 'column', gap: '20px' },
    imageContainer: { position: 'relative', width: '100%', aspectRatio: '1/1', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    image: { width: '100%', height: '100%', objectFit: 'contain' },
    toggleContainer: { position: 'absolute', top: '15px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.9)', borderRadius: '30px', padding: '4px', display: 'flex', gap: '5px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' },
    toggleBtn: { border: 'none', background: 'transparent', padding: '6px 15px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', color: '#555' },
    toggleActive: { border: 'none', background: '#007bff', color: 'white', padding: '6px 15px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,123,255,0.3)' },
    
    // Legend
    legendBox: { backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #e9ecef' },
    legendGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' },
    legendItem: { display: 'flex', alignItems: 'center', gap: '8px', color: '#333' },
    dot: { width: '12px', height: '12px', borderRadius: '50%', border: '1px solid rgba(0,0,0,0.1)' },

    // Right Column
    rightColumn: { display: 'flex', flexDirection: 'column', gap: '25px' },
    label: { textTransform: 'uppercase', fontSize: '12px', color: '#888', fontWeight: 'bold', letterSpacing: '0.5px' },
    analysisDetails: { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px' },
    
    // Doctor
    doctorArea: { marginTop: 'auto', borderTop: '2px dashed #eee', paddingTop: '20px' },
    textArea: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', marginBottom: '10px' },
    saveBtn: { background: '#28a745', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
    
    // Utilities
    pendingBox: { textAlign: 'center', padding: '40px', background: '#f8f9fa', borderRadius: '12px', color: '#666' },
    processingOverlay: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
    spinner: { width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.3)', borderTop: '3px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }
};

// Animation Spinner
const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default AnalysisResult;