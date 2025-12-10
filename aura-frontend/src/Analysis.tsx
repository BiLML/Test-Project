import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const AnalysisResult: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // --- LOGIC 1: XÁC ĐỊNH MỨC ĐỘ & MÀU SẮC ---
    const getSeverityInfo = (diagnosis: string, confidence: number) => {
        // Ưu tiên 1: Kiểm tra độ tin cậy thấp trước
        // Nếu AI không chắc chắn (< 60%), hiển thị cảnh báo màu cam thay vì đỏ/xanh
        if (confidence > 0 && confidence < 60) {
            return {
                color: '#fd7e14', // Màu cam
                bg: '#fff3cd',
                textColor: '#856404',
                label: 'Cần kiểm tra kỹ',
                advice: `⚠️ AI phát hiện dấu hiệu nghi ngờ nhưng độ tin cậy thấp (${confidence.toFixed(1)}%). Kết quả này có thể bị nhiễu do chất lượng ảnh hoặc ánh sáng. Vui lòng chụp lại rõ nét hơn hoặc tham vấn bác sĩ.`
            };
        }

        if (!diagnosis) return { color: '#6c757d', label: 'Chưa rõ', advice: '' };
        
        // Mức độ NGUY HIỂM (Đỏ)
        if (diagnosis.includes("Nặng") || diagnosis.includes("Tăng sinh")) {
            return { 
                color: '#dc3545', 
                bg: '#f8d7da',
                label: 'Nguy hiểm', 
                advice: '⚠️ CẢNH BÁO: Phát hiện tổn thương nghiêm trọng. Bạn cần đến bệnh viện chuyên khoa mắt để được điều trị laser hoặc tiêm thuốc ngay lập tức.' 
            };
        }
        // Mức độ TRUNG BÌNH (Cam)
        if (diagnosis.includes("Trung bình")) {
            return { 
                color: '#fd7e14', 
                bg: '#ffe5d0',
                label: 'Cảnh báo', 
                advice: '⚠️ Phát hiện tổn thương mức độ trung bình. Cần đặt lịch khám sớm để bác sĩ lên phác đồ điều trị ngăn chặn tiến triển.' 
            };
        }
        // Mức độ NHẸ (Vàng)
        if (diagnosis.includes("Nhẹ")) {
            return { 
                color: '#ffc107', 
                bg: '#fff3cd',
                textColor: '#856404',
                label: 'Lưu ý', 
                advice: 'ℹ️ Phát hiện dấu hiệu bệnh nhẹ. Bạn nên kiểm soát đường huyết chặt chẽ và tái khám sau 3 tháng.' 
            };
        }
        // Mức độ BÌNH THƯỜNG (Xanh)
        return { 
            color: '#28a745', 
            bg: '#d4edda',
            label: 'An toàn', 
            advice: '✅ Võng mạc khỏe mạnh. Tuyệt vời! Hãy duy trì thói quen kiểm tra định kỳ 6 tháng/lần.' 
        };
    };
    
    // --- LOGIC 1: KIẾN THỨC Y KHOA (ĐÃ CẬP NHẬT THEO ĐỒ ÁN) ---
    const getMedicalInsights = (diagnosis: string) => {
        if (!diagnosis) return null;

        // 1. MỨC ĐỘ NẶNG / TĂNG SINH (Class 3, 4)
        if (diagnosis.includes("Tăng sinh") || diagnosis.includes("Nặng")) {
            return {
                eye_risks: [
                    "Nguy cơ bong võng mạc và mù lòa vĩnh viễn.",
                    "Xuất huyết dịch kính và tăng nhãn áp tân mạch."
                ],
                systemic_risks: [
                    "🔴 TIỂU ĐƯỜNG: Biến chứng đã lan rộng, nguy cơ cao suy thận (Bệnh thận đái tháo đường).",
                    "🔴 TIM MẠCH: Huyết áp cao mãn tính đã gây tổn thương thành mạch nghiêm trọng.",
                    "🔴 THẦN KINH: Nguy cơ Đột quỵ (Tai biến) rất cao do tắc nghẽn vi mạch não."
                ],
                prognosis: "Giai đoạn muộn. Bệnh đã tiến triển âm thầm từ lâu. Cần can thiệp y tế khẩn cấp để bảo toàn chức năng các cơ quan."
            };
        }

        // 2. MỨC ĐỘ TRUNG BÌNH (Class 2)
        if (diagnosis.includes("Trung bình")) {
            return {
                eye_risks: [
                    "Phù hoàng điểm gây giảm thị lực trung tâm.",
                    "Xuất hiện các ổ xuất huyết và xuất tiết cứng."
                ],
                systemic_risks: [
                    "🟠 TIỂU ĐƯỜNG: Đường huyết (HbA1c) dao động mạnh, kiểm soát chưa hiệu quả.",
                    "🟠 TIM MẠCH: Dấu hiệu xơ cứng mạch máu, nguy cơ tăng huyết áp ẩn giấu.",
                    "🟠 THẦN KINH: Có dấu hiệu thiếu máu cục bộ, ảnh hưởng tuần hoàn não."
                ],
                prognosis: "Bệnh đang tiến triển. Cần điều chỉnh lối sống và thuốc ngay để ngăn chặn biến chứng lên tim và não."
            };
        }

        // 3. MỨC ĐỘ NHẸ (Class 1)
        if (diagnosis.includes("Nhẹ")) {
            return {
                eye_risks: [
                    "Vi phình mạch (Microaneurysms) bắt đầu xuất hiện.",
                    "Thị lực chưa bị ảnh hưởng rõ rệt."
                ],
                systemic_risks: [
                    "🟡 TIỂU ĐƯỜNG: Giai đoạn khởi phát biến chứng mạch máu.",
                    "🟡 TIM MẠCH: Cần tầm soát rối loạn mỡ máu và huyết áp sớm.",
                    "🟡 THẦN KINH: Chưa có nguy cơ cấp tính, nhưng cần theo dõi định kỳ."
                ],
                prognosis: "Phát hiện sớm thành công! Đây là thời điểm vàng để thay đổi chế độ ăn uống và ngăn chặn bệnh tiến triển âm thầm."
            };
        }

        // 4. BÌNH THƯỜNG (Class 0)
        return {
            eye_risks: ["Hệ thống mạch máu võng mạc khỏe mạnh."],
            systemic_risks: [
                "🟢 Không phát hiện dấu hiệu tổn thương mạch máu nhỏ.",
                "🟢 Nguy cơ biến chứng Tim mạch/Thần kinh liên quan đến mắt: THẤP.",
                "ℹ️ Tiếp tục duy trì lối sống lành mạnh."
            ],
            prognosis: "Tốt. Hãy duy trì thói quen khám sàng lọc 6 tháng/lần để phát hiện sớm các rủi ro tiềm ẩn."
        };
    };

    // --- LOGIC 2: TỰ ĐỘNG CẬP NHẬT (POLLING) ---
    const fetchData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return navigate('/login');

        try {
            const res = await fetch(`http://127.0.0.1:8000/api/medical-records/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const result = await res.json();
                setData(result);
                return result.status; 
            } else {
                console.error("Lỗi tải dữ liệu");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [id, navigate]);

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

    if (loading) return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#666'}}>⏳ Đang tải kết quả phân tích...</div>;
    if (!data) return null;

    // --- LOGIC 3: PARSE KẾT QUẢ TỪ BACKEND ---
    let diagnosis = data.result;
    let confidence = 0;

    if (data.result && data.result.includes(" - Độ tin cậy: ")) {
        const parts = data.result.split(" - Độ tin cậy: ");
        diagnosis = parts[0];
        confidence = parseFloat(parts[1]);
    }

    // GỌI HÀM VỚI THAM SỐ MỚI
    const severity = getSeverityInfo(diagnosis, confidence);
    const insights = getMedicalInsights(diagnosis);

    return (
        <div style={styles.container}>
            <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>&larr; Quay lại Dashboard</button>
            
            <div style={styles.card}>
                <div style={styles.header}>
                    <h2 style={{margin: 0, display: 'flex', alignItems: 'center', gap: '10px'}}>
                        👁️ Kết quả Phân tích AI
                    </h2>
                    <span style={styles.dateBadge}>{data.date} - {data.time}</span>
                </div>

                <div style={styles.contentGrid}>
                    {/* Cột Trái: Ảnh */}
                    <div style={styles.imageSection}>
                        <img src={data.image_url} alt="Retina Scan" style={styles.image} />
                        {data.status !== 'Hoàn thành' && (
                            <div style={styles.processingOverlay}>
                                <div style={styles.spinner}></div>
                                <p style={{color: 'white', marginTop: '10px'}}>AI đang phân tích...</p>
                            </div>
                        )}
                    </div>

                    {/* Cột Phải: Kết quả */}
                    <div style={styles.infoSection}>
                        {data.status !== 'Hoàn thành' ? (
                            <div style={{textAlign: 'center', padding: '40px', backgroundColor: '#f8f9fa', borderRadius: '12px'}}>
                                <h3>🔄 Đang xử lý dữ liệu</h3>
                                <p style={{color: '#666'}}>Hệ thống đang áp dụng thuật toán Ben Graham để làm rõ mạch máu...</p>
                            </div>
                        ) : (
                            <>
                                <div style={{marginBottom: '25px'}}>
                                    <label style={styles.label}>Chẩn đoán của AI:</label>
                                    <h3 style={{marginTop: '5px', color: severity.color, fontSize: '28px', fontWeight: '800'}}>
                                        {diagnosis}
                                    </h3>
                                    
                                    {confidence > 0 && (
                                        <div style={{marginTop: '10px'}}>
                                            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px', color: '#666'}}>
                                                <span>Độ tin cậy của mô hình:</span>
                                                <strong>{confidence.toFixed(1)}%</strong>
                                            </div>
                                            <div style={styles.progressBarBg}>
                                                <div style={{
                                                    ...styles.progressBarFill, 
                                                    width: `${confidence}%`,
                                                    backgroundColor: confidence > 80 ? '#28a745' : '#ffc107'
                                                }}></div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{marginBottom: '20px', padding: '15px', backgroundColor: severity.bg, borderRadius: '8px', borderLeft: `5px solid ${severity.color}`}}>
                                    <p style={{margin: 0, color: severity.textColor || '#333', lineHeight: '1.5'}}>
                                        {severity.advice}
                                    </p>
                                </div>
{/* --- PHẦN UI MỚI: RỦI RO & TIÊN LƯỢNG --- */}
                                {insights && (
                                    <div style={styles.riskBox}>
                                        <h4 style={{margin: '0 0 15px 0', color: '#c0392b', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #ffcccc', paddingBottom: '10px'}}>
                                            📊 Phân tích Rủi ro & Dự báo
                                        </h4>
                                        
                                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
                                            {/* Cột 1: Rủi ro tại Mắt */}
                                            <div>
                                                <strong style={{color: '#007bff', display: 'block', marginBottom: '8px', fontSize: '14px'}}>👁️ Tại Mắt:</strong>
                                                <ul style={{margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#555'}}>
                                                    {insights.eye_risks.map((risk, idx) => (
                                                        <li key={idx} style={{marginBottom: '4px'}}>{risk}</li>
                                                    ))}
                                                </ul>
                                            </div>

                                            {/* Cột 2: Rủi ro Toàn thân */}
                                            <div>
                                                <strong style={{color: '#dc3545', display: 'block', marginBottom: '8px', fontSize: '14px'}}>🫀 Toàn thân (Tim/Não):</strong>
                                                <ul style={{margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#555'}}>
                                                    {insights.systemic_risks.map((risk, idx) => (
                                                        <li key={idx} style={{marginBottom: '4px'}}>{risk}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>

                                        <div style={{marginTop: '15px', paddingTop: '10px', borderTop: '1px dashed #ccc', fontSize: '14px', fontStyle: 'italic'}}>
                                            <strong>🔮 Tiên lượng: </strong>
                                            <span style={{color: '#333'}}>{insights.prognosis}</span>
                                        </div>
                                    </div>
                                )}
                                {/* ---------------------------------------- */}
                                <div style={styles.doctorNote}>
                                    <strong>📝 Ghi chú bác sĩ:</strong>
                                    <p style={{margin: '5px 0 0'}}>{data.doctor_note}</p>
                                </div>
                                
                                <button style={styles.actionBtn}>Đặt lịch khám chuyên sâu</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Styles bổ sung
const styles: { [key: string]: React.CSSProperties } = {
    container: { padding: '40px', backgroundColor: '#f4f6f9', minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif" },
    backBtn: { background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', fontSize: '16px', marginBottom: '20px', fontWeight: 'bold' },
    card: { backgroundColor: 'white', borderRadius: '16px', padding: '40px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', maxWidth: '1000px', margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '1px solid #eee', paddingBottom: '20px' },
    dateBadge: { backgroundColor: '#f1f5f9', padding: '8px 16px', borderRadius: '20px', color: '#64748b', fontWeight: '500' },
    contentGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' },
    imageSection: { position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden', height: '400px' },
    image: { width: '100%', height: '100%', objectFit: 'contain' },
    infoSection: { display: 'flex', flexDirection: 'column' },
    label: { fontSize: '14px', color: '#999', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' },
    doctorNote: { backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', border: '1px solid #ffeeba', marginTop: 'auto', marginBottom: '20px', color: '#856404' },
    actionBtn: { width: '100%', padding: '15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s' },
    
    processingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
    spinner: { width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.3)', borderTop: '4px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' },
    progressBarBg: { width: '100%', height: '8px', backgroundColor: '#e9ecef', borderRadius: '4px', overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: '4px', transition: 'width 1s ease-in-out' },
    riskBox: { backgroundColor: '#fff5f5', padding: '20px', borderRadius: '8px', border: '1px solid #ffcccc', marginBottom: '20px' }
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
`;
document.head.appendChild(styleSheet);

export default AnalysisResult;