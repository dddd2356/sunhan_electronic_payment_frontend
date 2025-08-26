import React, {useState} from 'react';
import './style.css'; // 새로운 CSS 파일을 임포트합니다.

interface VacationHistory {
    id: number;
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
    status: 'APPROVED' | 'PENDING' | 'REJECTED';
    createdDate: string;
}

interface VacationHistoryPopupProps {
    isOpen: boolean;
    onClose: () => void;
    vacationHistory: VacationHistory[];
}

const VacationHistoryPopup: React.FC<VacationHistoryPopupProps> = ({ isOpen, onClose, vacationHistory }) => {
    // 페이지네이션 상태 추가
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 6;
    const totalPages = Math.ceil(vacationHistory.length / itemsPerPage);

    // 현재 페이지에 표시할 항목 계산
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentItems = vacationHistory.slice(startIndex, endIndex);

    if (!isOpen) {
        return null;
    }

    const formatDateRange = (startDate: string, endDate: string) => {
        const start = new Date(startDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
        const end = new Date(endDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
        return `${start} ~ ${end}`;
    };

    const getStatusText = (status: 'APPROVED' | 'PENDING' | 'REJECTED') => {
        switch (status) {
            case 'APPROVED': return '승인됨';
            case 'PENDING': return '대기 중';
            case 'REJECTED': return '반려됨';
            default: return '';
        }
    };

    return (
        <div className="popup-overlay">
            <div className="popup-container">
                <div className="popup-header">
                    <h3 className="popup-title">전체 휴가 사용 내역</h3>
                    <button className="popup-close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="popup-content">
                    {vacationHistory.length > 0 ? (
                        <>
                            <ul className="history-list">
                                {/* 현재 페이지의 항목만 매핑하여 렌더링 */}
                                {currentItems.map((history) => (
                                    <li key={history.id} className="history-item">
                                        <div className="history-date-range">
                                            🗓️ {formatDateRange(history.startDate, history.endDate)}
                                            <span className="history-days">({history.days}일)</span>
                                        </div>
                                        <div className={`history-status status-${history.status.toLowerCase()}`}>
                                            {getStatusText(history.status)}
                                        </div>
                                        <div className="history-reason">
                                            사유: {history.reason || '없음'}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {/* 페이지네이션 컨트롤 */}
                            <div className="pagination-controls">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                >
                                    이전
                                </button>
                                <span>{currentPage} / {totalPages}</span>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                >
                                    다음
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="history-empty">
                            사용된 휴가 내역이 없습니다.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VacationHistoryPopup;