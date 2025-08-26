import React, { useState, useEffect } from 'react';
import { useCookies } from 'react-cookie';
import { X, FileText, Clock, XCircle, CheckCircle, Eye } from 'lucide-react';
import './style.css'; // CSS 파일 import
import {useNavigate} from "react-router-dom";
interface ReportsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * 백엔드의 ReportsResponseDto/Document 형태에 맞춘 타입들
 * - type: ContractType enum 값 (예: "EMPLOYMENT_CONTRACT", "LEAVE_APPLICATION")
 */
interface DocumentSummary {
    id: number;
    type: string; // "EMPLOYMENT_CONTRACT" | "LEAVE_APPLICATION" | ...
    title: string;
    status: string;
    createdAt?: string;
    updatedAt?: string;
    applicantName?: string;
    employeeName?: string;
}
interface PagedResponse {
    content: DocumentSummary[];
    page: number;
    size: number;
    totalPages: number;
    totalElements: number;
}
interface ReportDataFromApi {
    counts: {
        draftCount: number;
        inProgressCount: number;
        rejectedCount: number;
        completedCount: number;
        pendingCount: number;
    };
}

const ReportsModal: React.FC<ReportsModalProps> = ({ isOpen, onClose }) => {
    const [cookies] = useCookies(['accessToken']);
    const [reportData, setReportData] = useState<ReportDataFromApi | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [categoryDocuments, setCategoryDocuments] = useState<DocumentSummary[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const categories = [
        {
            key: 'draft',
            title: '작성중',
            icon: <FileText className="w-8 h-8" />,
            className: 'reports-category-draft',
            description: '작성 중인 문서'
        },
        {
            key: 'inProgress',
            title: '진행중',
            icon: <Clock className="w-8 h-8" />,
            className: 'reports-category-progress',
            description: '승인 과정을 거치는 문서'
        },
        {
            key: 'pending',
            title: '승인대기',
            icon: <Clock className="w-8 h-8" />,
            className: 'reports-category-pending',
            description: '본인에게 승인/서명이 요청된 문서'
        },
        {
            key: 'rejected',
            title: '반려',
            icon: <XCircle className="w-8 h-8" />,
            className: 'reports-category-rejected',
            description: '반려된 문서'
        },
        {
            key: 'completed',
            title: '완료',
            icon: <CheckCircle className="w-8 h-8" />,
            className: 'reports-category-completed',
            description: '완료된 문서'
        }
    ];

    useEffect(() => {
        if (isOpen) {
            fetchReportData();
            // 스크롤 방지
            document.body.style.overflow = 'hidden';
        } else {
            // 스크롤 복원
            document.body.style.overflow = 'unset';
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const fetchReportData = async () => {
        try {
            setLoading(true);
            setError('');

            const res = await fetch('/api/v1/user/reports/documents', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(cookies.accessToken ? { 'Authorization': `Bearer ${cookies.accessToken}` } : {})
                }
            });

            if (!res.ok) {
                throw new Error('보고서 데이터를 가져오는데 실패했습니다.');
            }

            const data: ReportDataFromApi = await res.json();
            setReportData(data);
        } catch (err: any) {
            setError(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
            console.error('Report data fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchCategoryDocuments = async (category: string, page: number = 0) => {
        try {
            setLoading(true);
            setError('');

            const url = `/api/v1/user/reports/documents/${category}?page=${page}&size=10`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(cookies.accessToken ? { 'Authorization': `Bearer ${cookies.accessToken}` } : {})
                }
            });

            if (!res.ok) {
                throw new Error(`${category} 문서를 가져오는데 실패했습니다.`);
            }

            const data: PagedResponse = await res.json();

            const currentPageFromServer = data.page != null && !isNaN(data.page) ? data.page : page;
            const totalPagesFromServer = data.totalPages != null && !isNaN(data.totalPages) ? data.totalPages : 1;

            setCategoryDocuments(data.content);
            setCurrentPage(currentPageFromServer); // 백엔드에서 받은 실제 페이지 값 사용
            setTotalPages(totalPagesFromServer);

        } catch (err: any) {
            setError(err.message || '문서 목록을 불러오는 중 오류가 발생했습니다.');
            console.error('Category documents fetch error:', err);
        } finally {
            setLoading(false);
        }
    };


    const handleCategoryClick = (category: string) => {
        setSelectedCategory(category);
        setCurrentPage(0);
        fetchCategoryDocuments(category, 0);
    };
    const handlePageChange = (page: number) => {
        console.log("handlePageChange called with page:", page);
        if (selectedCategory) {
            // setCurrentPage 호출을 제거하여 상태 동기화 문제를 방지
            fetchCategoryDocuments(selectedCategory, page);
        }
    };
    const handleBackToCategories = () => {
        setSelectedCategory(null);
        setCategoryDocuments([]);
    };

    const handleDocumentClick = (doc: DocumentSummary) => {
        // type 값(백엔드 ContractType enum)에 따라 라우팅
        if (doc.type === 'EMPLOYMENT_CONTRACT' || doc.type === 'contract' || doc.type === '근로계약서') {
            navigate(`/detail/employment-contract/edit/${doc.id}`);
        } else if (doc.type === 'LEAVE_APPLICATION' || doc.type === 'vacation' || doc.type === '휴가원') {
            navigate(`/detail/leave-application/edit/${doc.id}`);
        } else {
            // fallback: 문서관리 모달 닫고 Reports 모달 유지
            console.warn('Unknown doc type, opening reports modal instead', doc.type);
            navigate(`/documents/${doc.id}`);
        }
    };

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const getStatusText = (status: string) => {
        const statusMap: { [key: string]: string } = {
            // 공통
            'DRAFT': '임시저장',
            'DELETED': '삭제됨',

            // 계약서 전용
            'SENT_TO_EMPLOYEE': '직원 전송됨',
            'SIGNED_BY_EMPLOYEE': '직원 서명완료',
            'RETURNED_TO_ADMIN': '관리자 반송',
            'COMPLETED': '완료됨',

            // 휴가원 전용
            'PENDING_SUBSTITUTE': '대직자 승인 대기',
            'PENDING_DEPT_HEAD': '부서장 승인 대기',
            'PENDING_CENTER_DIRECTOR': '진료센터장 승인 대기',
            'PENDING_ADMIN_DIRECTOR': '행정원장 승인 대기',
            'PENDING_CEO_DIRECTOR': '대표원장 승인 대기',
            'PENDING_HR_STAFF': '인사팀 승인 대기',
            'PENDING_HR_FINAL': '인사팀 최종 승인 대기',
            'APPROVED': '승인됨',
            'REJECTED': '반려됨'
        };
        return statusMap[status] || status;
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return dateString;
        }
    };

    if (!isOpen) return null;

    return (
        <div className="reports-modal-overlay" onClick={handleOverlayClick}>
            <div className="reports-modal-container">
                {/* 헤더 */}
                <div className="reports-modal-header">
                    <h2 className="reports-modal-title">
                        {selectedCategory ?
                            `${categories.find(c => c.key === selectedCategory)?.title} 문서` :
                            '문서 보고서'
                        }
                    </h2>
                    <button
                        onClick={onClose}
                        className="reports-modal-close-btn"
                        aria-label="닫기"
                    >
                        <X/>
                    </button>
                </div>

                {/* 내용 */}
                <div className="reports-modal-content">
                    {loading ? (
                        <div className="reports-modal-loading">
                            <div className="reports-modal-loading-spinner" />
                            <span>로딩 중...</span>
                        </div>
                    ) : error ? (
                        <div className="reports-modal-error">
                            <div className="reports-modal-error-icon">⚠️</div>
                            <p className="reports-modal-error-text">{error}</p>
                            <button
                                onClick={selectedCategory ? () => fetchCategoryDocuments(selectedCategory) : fetchReportData}
                                className="reports-modal-retry-btn"
                            >
                                다시 시도
                            </button>
                        </div>
                    ) : selectedCategory ? (
                        // 선택된 카테고리의 문서 목록
                        <div>
                            <button
                                onClick={handleBackToCategories}
                                className="reports-back-btn"
                            >
                                ← 카테고리로 돌아가기
                            </button>

                            {categoryDocuments.length === 0 ? (
                                <div className="reports-empty-state">
                                    <div className="reports-empty-icon">
                                        <FileText className="w-12 h-12" />
                                    </div>
                                    <p className="reports-empty-text">해당하는 문서가 없습니다.</p>
                                </div>
                            ) : (
                                <div className="reports-document-list">
                                    {categoryDocuments.map((doc) => (
                                        <div
                                            key={`${doc.type}-${doc.id}`}
                                            className="reports-document-item"
                                            onClick={() => handleDocumentClick(doc)}
                                        >
                                            <div className="reports-document-header">
                                                <div className="reports-document-info">
                                                    <div className="reports-document-badges">
                                                        <span className={`reports-document-badge ${
                                                            doc.type === 'EMPLOYMENT_CONTRACT' ? 'reports-document-badge-contract'
                                                                : doc.type === 'LEAVE_APPLICATION' ? 'reports-document-badge-vacation'
                                                                    : 'reports-document-badge-other'
                                                        }`}>
                                                            {doc.type === 'EMPLOYMENT_CONTRACT' ? '근로계약서'
                                                                : doc.type === 'LEAVE_APPLICATION' ? '휴가원'
                                                                    : doc.type}
                                                        </span>
                                                        <span className="reports-document-badge reports-document-badge-status">
                                                            {getStatusText(doc.status)}
                                                        </span>
                                                    </div>
                                                    <h4 className="reports-document-title">
                                                        {doc.title}
                                                    </h4>
                                                    {(doc.applicantName || doc.employeeName) && (
                                                        <p className="reports-document-applicant">
                                                            {doc.applicantName ? `신청자: ${doc.applicantName}` : ''}
                                                            {doc.employeeName ? ` ${doc.employeeName ? `/ 대상: ${doc.employeeName}` : ''}` : ''}
                                                        </p>
                                                    )}
                                                    <p className="reports-document-dates">
                                                        생성일: {formatDate(doc.createdAt)} |
                                                        수정일: {formatDate(doc.updatedAt)}
                                                    </p>
                                                </div>
                                                <div className="reports-document-action" title="상세보기">
                                                    <Eye className="w-4 h-4" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {/* 페이지네이션 추가 */}
                                    <div className="reports-pagination">
                                        <button
                                            disabled={currentPage === 0}
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            className="reports-page-button"
                                        >
                                            이전
                                        </button>
                                        <span>{currentPage + 1} / {totalPages}</span>
                                        <button
                                            disabled={currentPage + 1 >= totalPages}
                                            onClick={() => {
                                                console.log("Next button clicked. New page:", currentPage + 1);
                                                handlePageChange(currentPage + 1);
                                            }}
                                            className="reports-page-button"
                                        >
                                            다음
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        // 카테고리 선택 화면
                        <div>
                            {reportData && (
                                <div className="reports-category-grid">
                                    {categories.map((category) => {
                                        const count = reportData.counts[`${category.key}Count` as keyof typeof reportData.counts] || 0;
                                        return (
                                            <button
                                                key={category.key}
                                                onClick={() => handleCategoryClick(category.key)}
                                                className={`reports-category-card ${category.className}`}
                                            >
                                                <div className="reports-category-icon">{category.icon}</div>
                                                <h3 className="reports-category-title">{category.title}</h3>
                                                <p className="reports-category-count">{count}</p>
                                                <p className="reports-category-description">{category.description}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="reports-guide">
                                <h3 className="reports-guide-title">보고서 안내</h3>
                                <ul className="reports-guide-list">
                                    <li className="reports-guide-item">
                                        • <strong>작성중:</strong> 아직 제출되지 않은 임시 저장된 문서
                                    </li>
                                    <li className="reports-guide-item">
                                        • <strong>진행중:</strong> 제출되어 승인 과정을 거치고 있는 문서
                                    </li>
                                    <li className="reports-guide-item">
                                        • <strong>승인대기:</strong> 본인에게 승인/서명이 요청된 문서
                                    </li>
                                    <li className="reports-guide-item">
                                        • <strong>반려:</strong> 반려되거나 삭제된 문서
                                    </li>
                                    <li className="reports-guide-item">
                                        • <strong>완료:</strong> 모든 승인이 완료된 문서
                                    </li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReportsModal;