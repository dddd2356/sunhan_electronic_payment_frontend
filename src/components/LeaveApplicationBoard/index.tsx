import React, { useState, useEffect, useMemo } from 'react';
import { useCookies } from 'react-cookie';
import './style.css';
import Layout from "../Layout";
import {
    fetchCurrentUser as apiFetchCurrentUser,
    fetchLeaveApplications,
    createLeaveApplication
} from '../../apis/leaveApplications';

// 타입 정의
interface LeaveApplication {
    id: number;
    applicantId: string;
    substituteId?: string;
    leaveType?: string;
    startDate?: string;
    endDate?: string;
    totalDays?: number;
    status: string;
    reason?: string;
    createdAt: string;
    updatedAt: string;
    applicantName?: string;
    substituteName?: string;
    formDataJson?: string;
}

interface User {
    userId: string;
    userName: string;
    role: string;
    jobLevel: string;
    deptCode: string;
    permissions?: string[];
}

interface PaginationData {
    content: LeaveApplication[];
    totalElements: number;
    totalPages: number;
    currentPage: number;
    size: number;
}

const LeaveApplicationBoard: React.FC = () => {
    const [cookies] = useCookies(['accessToken']);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>('');
    const [tab, setTab] = useState<'my' | 'pending' | 'completed'>('my');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchType, setSearchType] = useState<'all'|'applicant'|'substitute'|'status'>('all');
    const [hasHrLeavePermission, setHasHrLeavePermission] = useState(false);
// 탭에 따른 플레이스홀더 텍스트 함수
    const getSearchPlaceholder = () => {
        switch (tab) {
            case 'my':
                return '내 휴가원 검색...';
            case 'pending':
                return '승인 대기 검색...';
            case 'completed':
                return '완료된 휴가원 검색...';
            default:
                return '검색...';
        }
    };
    // 페이지네이션 관련 상태 수정
    const [paginationData, setPaginationData] = useState<PaginationData>({
        content: [],
        totalElements: 0,
        totalPages: 0,
        currentPage: 0,
        size: 10
    });

    const [applications, setApplications] = useState<LeaveApplication[]>([]);
    const [currentPage, setCurrentPage] = useState(1); // UI용 (1부터 시작)
    const itemsPerPage = 10;

    const getStatusText = (s: string) => {
        // 백엔드의 모든 상태(Enum) 값을 처리하도록 변경
        switch (s) {
            case 'DRAFT': return '작성중';
            case 'PENDING_SUBSTITUTE': return '대직자 승인대기';
            case 'PENDING_DEPT_HEAD': return '부서장 승인대기';
            case 'PENDING_HR_STAFF': return '인사팀 승인대기';
            case 'PENDING_CENTER_DIRECTOR': return '진료센터장 승인대기';
            case 'PENDING_HR_FINAL': return '최종 인사팀 승인대기';
            case 'PENDING_ADMIN_DIRECTOR': return '행정원장 승인대기';
            case 'PENDING_CEO_DIRECTOR': return '대표원장 승인대기';
            case 'APPROVED': return '최종 승인';
            case 'REJECTED': return '반려됨';
            case 'COMPLETED': return '완료';
            default: return s; // 알 수 없는 상태는 코드를 그대로 표시
        }
    };

    const getStatusClass = (status: string) => {
        // [수정] 백엔드의 모든 상태(Enum) 값을 처리하도록 변경
        switch (status) {
            case 'DRAFT': return 'status-draft';
            case 'REJECTED': return 'status-return';
            case 'APPROVED':
            case 'COMPLETED':
                return 'status-completed';
            // 모든 PENDING 상태들은 '제출됨'과 동일한 스타일(노란색) 적용
            case 'PENDING_SUBSTITUTE':
            case 'PENDING_DEPT_HEAD':
            case 'PENDING_HR_STAFF':
            case 'PENDING_CENTER_DIRECTOR':
            case 'PENDING_HR_FINAL':
            case 'PENDING_ADMIN_DIRECTOR':
            case 'PENDING_CEO_DIRECTOR':
                return 'status-sent';
            default: return '';
        }
    };


// 검색 필터링된 목록을 계산하는 useMemo
    const filteredApplications = useMemo(() => {
        if (tab === 'my') {
            // 'my' 탭에서는 서버사이드 페이지네이션을 사용하므로
            // 검색이 있을 때는 클라이언트사이드로 전환
            if (!searchTerm.trim()) {
                return applications; // 서버에서 받은 데이터 그대로 사용
            }
            // 검색이 있을 때만 클라이언트 사이드 필터링
            return applications.filter(app => {
                const searchLower = searchTerm.toLowerCase();
                switch (searchType) {
                    case 'applicant':
                        return app.applicantName?.toLowerCase().includes(searchLower) ||
                            app.applicantId?.toLowerCase().includes(searchLower);
                    case 'substitute':
                        return app.substituteName?.toLowerCase().includes(searchLower) ||
                            app.substituteId?.toLowerCase().includes(searchLower);
                    case 'status':
                        return getStatusText(app.status).toLowerCase().includes(searchLower);
                    case 'all':
                    default:
                        return app.applicantName?.toLowerCase().includes(searchLower) ||
                            app.applicantId?.toLowerCase().includes(searchLower) ||
                            app.substituteName?.toLowerCase().includes(searchLower) ||
                            app.substituteId?.toLowerCase().includes(searchLower) ||
                            getStatusText(app.status).toLowerCase().includes(searchLower) ||
                            app.leaveType?.toLowerCase().includes(searchLower);
                }
            });
        } else {
            // pending, completed 탭은 기존 로직 유지
            if (!searchTerm.trim()) return applications;

            return applications.filter(app => {
                const searchLower = searchTerm.toLowerCase();

                switch (searchType) {
                    case 'applicant':
                        return app.applicantName?.toLowerCase().includes(searchLower) ||
                            app.applicantId?.toLowerCase().includes(searchLower);

                    case 'substitute':
                        return app.substituteName?.toLowerCase().includes(searchLower) ||
                            app.substituteId?.toLowerCase().includes(searchLower);

                    case 'status':
                        return getStatusText(app.status).toLowerCase().includes(searchLower);

                    case 'all':
                    default:
                        return app.applicantName?.toLowerCase().includes(searchLower) ||
                            app.applicantId?.toLowerCase().includes(searchLower) ||
                            app.substituteName?.toLowerCase().includes(searchLower) ||
                            app.substituteId?.toLowerCase().includes(searchLower) ||
                            getStatusText(app.status).toLowerCase().includes(searchLower) ||
                            app.leaveType?.toLowerCase().includes(searchLower);
                }
            });
        }
    }, [applications, searchTerm, searchType, tab]);

// 휴가 종류 가져오는 함수
    const getLeaveTypeFromFormData = (app: LeaveApplication): string => {
        // 먼저 API에서 받은 leaveType 사용
        if (app.leaveType) {
            return app.leaveType;
        }

        // formDataJson이 있다면 파싱해서 휴가 종류 가져오기
        if (app.formDataJson) {
            try {
                const formData = JSON.parse(app.formDataJson);
                if (formData.leaveTypes && Array.isArray(formData.leaveTypes) && formData.leaveTypes.length > 0) {
                    return formData.leaveTypes.join(', '); // 여러 종류가 선택된 경우 쉼표로 구분
                }
            } catch (e) {
                console.error('formDataJson 파싱 실패:', e);
            }
        }

        return '-';
    };

// 시작일 가져오는 함수 (가장 빠른 시작일)
    const getStartDateFromFormData = (app: LeaveApplication): string => {
        // 먼저 API에서 받은 startDate 사용
        if (app.startDate) {
            return app.startDate;
        }

        // formDataJson이 있다면 파싱해서 가장 빠른 시작일 가져오기
        if (app.formDataJson) {
            try {
                const formData = JSON.parse(app.formDataJson);
                const allStartDates: string[] = [];

                // flexiblePeriods에서 모든 시작일 수집
                if (formData.flexiblePeriods && formData.flexiblePeriods.length > 0) {
                    formData.flexiblePeriods.forEach((period: any) => {
                        if (period.startDate) {
                            allStartDates.push(period.startDate);
                        }
                    });
                }

                // consecutivePeriod에서 시작일 수집
                if (formData.consecutivePeriod && formData.consecutivePeriod.startDate) {
                    allStartDates.push(formData.consecutivePeriod.startDate);
                }

                // 가장 빠른 날짜 찾기
                if (allStartDates.length > 0) {
                    return allStartDates.sort()[0]; // 문자열 정렬로 가장 빠른 날짜
                }
            } catch (e) {
                console.error('formDataJson 파싱 실패:', e);
            }
        }

        return '-';
    };

// 종료일 가져오는 함수 (가장 늦은 종료일)
    const getEndDateFromFormData = (app: LeaveApplication): string => {
        // 먼저 API에서 받은 endDate 사용
        if (app.endDate) {
            return app.endDate;
        }

        // formDataJson이 있다면 파싱해서 가장 늦은 종료일 가져오기
        if (app.formDataJson) {
            try {
                const formData = JSON.parse(app.formDataJson);
                const allEndDates: string[] = [];

                // flexiblePeriods에서 모든 종료일 수집
                if (formData.flexiblePeriods && formData.flexiblePeriods.length > 0) {
                    formData.flexiblePeriods.forEach((period: any) => {
                        if (period.endDate) {
                            allEndDates.push(period.endDate);
                        }
                    });
                }

                // consecutivePeriod에서 종료일 수집
                if (formData.consecutivePeriod && formData.consecutivePeriod.endDate) {
                    allEndDates.push(formData.consecutivePeriod.endDate);
                }

                // 가장 늦은 날짜 찾기
                if (allEndDates.length > 0) {
                    return allEndDates.sort().reverse()[0]; // 문자열 정렬 후 역순으로 가장 늦은 날짜
                }
            } catch (e) {
                console.error('formDataJson 파싱 실패:', e);
            }
        }

        return '-';
    };

    // 대직자 정보 가져오는 함수 추가
    const getSubstituteNameFromFormData = (app: LeaveApplication): string => {
        // 먼저 API에서 받은 substituteName 사용
        if (app.substituteName) {
            return app.substituteName;
        }

        // formDataJson이 있다면 파싱해서 대직자명 가져오기
        if (app.formDataJson) {
            try {
                const formData = JSON.parse(app.formDataJson);
                if (formData.substituteInfo && formData.substituteInfo.name) {
                    return formData.substituteInfo.name;
                }
            } catch (e) {
                console.error('formDataJson 파싱 실패:', e);
            }
        }

        // 마지막으로 substituteId 사용
        return app.substituteId || '-';
    };

    const getTotalDaysFromFormData = (app: LeaveApplication): number => {
        // 먼저 API에서 받은 totalDays 사용 (null/undefined가 아닌 경우)
        if (app.totalDays !== undefined && app.totalDays !== null) {
            return app.totalDays;
        }

        // formDataJson이 있다면 파싱해서 totalDays 가져오기
        if (app.formDataJson) {
            try {
                const formData = JSON.parse(app.formDataJson);
                if (formData.totalDays !== undefined && formData.totalDays !== null) {
                    return formData.totalDays;
                }
            } catch (e) {
                console.error('formDataJson 파싱 실패:', e);
            }
        }

        return 0;
    };

// 탭 변경 시 검색 초기화를 위한 useEffect 수정
    useEffect(() => {
        if (currentUser) {
            fetchApplications();
        }
    }, [currentUser, tab, currentPage]); // currentPage 추가

    useEffect(() => {
        setSearchTerm('');
        setSearchType('all');
        setCurrentPage(1);
    }, [tab]);

// 검색어나 검색 타입이 변경될 때만 페이지 초기화
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, searchType]);

    useEffect(() => {
        if (cookies.accessToken) fetchCurrentUser();
    }, [cookies.accessToken]);

    const fetchCurrentUser = async () => {
        try {
            const data = await apiFetchCurrentUser(cookies.accessToken);
            setCurrentUser(data);
        } catch (err: any) {
            setError(err.message || '사용자 정보를 불러올 수 없습니다.');
        }
    };

    const fetchApplications = async () => {
        setLoading(true);
        try {
            const apiPage = currentPage - 1; // API는 0부터 시작하므로 변환

            // 모든 탭에 대해 서버 측 페이지네이션 적용
            const data = await fetchLeaveApplications(
                cookies.accessToken,
                tab,
                canViewCompleted,
                apiPage,
                itemsPerPage
            ) as PaginationData; // 타입 캐스팅

            setPaginationData(data);

            // 'my' 탭에 대한 추가적인 클라이언트 필터링 로직 유지
            let filtered = data.content;
            if (tab === 'my') {
                // 상태 필터링 (DRAFT, PENDING*, REJECTED만)
                filtered = data.content.filter((app: LeaveApplication) =>
                    app.status === 'DRAFT' ||
                    app.status.startsWith('PENDING') ||
                    app.status === 'REJECTED'
                );
            }

            // 'completed' 탭의 경우 'APPROVED' 상태만 필터링 (이 로직은 백엔드에서 처리하는 게 더 효율적)
            if (tab === 'completed') {
                filtered = data.content.filter(app => app.status === 'APPROVED');
            }

            // 'createdAt' 기준 정렬 (이 로직도 백엔드에서 처리하는 게 더 효율적)
            filtered.sort((a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            setApplications(filtered);

        } catch (err: any) {
            setError(err.message || '휴가원 목록을 불러올 수 없습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        try {
            const newApp: LeaveApplication = await createLeaveApplication(cookies.accessToken);
            window.location.href = `/detail/leave-application/edit/${newApp.id}`;
        } catch (err: any) {
            setError(err.message || '휴가원 생성에 실패했습니다.');
        }
    };

    const handleClick = (app: LeaveApplication) => {
        const base = '/detail/leave-application';
        if ((app.status === 'DRAFT' && app.applicantId === currentUser?.userId) ||
            (currentUser?.role === 'ADMIN' && currentUser?.jobLevel >= '2' && app.status !== 'COMPLETED')) {
            window.location.href = `${base}/edit/${app.id}`;
        } else {
            window.location.href = `${base}/view/${app.id}`;
        }
    };

    // 검색 초기화 함수
    const handleSearchReset = () => {
        setSearchTerm('');
        setSearchType('all');
    };

    const canViewCompleted = Boolean(currentUser && (
        // 인사담당자: ADMIN이면서 jobLevel 0이고 deptCode가 'AD'
        (currentUser.role === 'ADMIN' && currentUser.permissions?.includes('HR_LEAVE_APPLICATION') && (currentUser.jobLevel === '0' || currentUser.jobLevel === '1')) ||
        // 진료지원센터장: ADMIN이면서 jobLevel 2
        (currentUser.role === 'ADMIN' && currentUser.jobLevel && parseInt(currentUser.jobLevel) === 2) ||
        //최고 관리자(superAdmin)
        (currentUser.role === 'ADMIN' && currentUser.jobLevel && parseInt(currentUser.jobLevel) === 6)
    ));

        if (loading) return <Layout>
            <div className="loading">
                로딩 중...
            </div>
        </Layout>;

        if (error) return <Layout>
            <div className="error">{error}</div>
        </Layout>;

    const totalPages = paginationData.totalPages;
    const getStartIndex = () => {
        return paginationData.currentPage * paginationData.size;
    }
    const startIdx = getStartIndex();
    const pageApps = filteredApplications;
    const noApplicationsAtAll = applications.length === 0;
    const isSearching = searchTerm.trim().length > 0;
    const noSearchResults = isSearching && filteredApplications.length === 0;

    // 페이지네이션 로직 수정 부분
    const pageGroupSize = 5;
    const safeTotalPages = Math.max(totalPages, 1);
    const startPage = Math.floor((currentPage - 1) / pageGroupSize) * pageGroupSize + 1;
    const endPage = Math.min(startPage + pageGroupSize - 1, safeTotalPages);

    const handleNextGroup = () => {
        if (endPage < totalPages) {
            setCurrentPage(endPage + 1);
        }
    };

    const handlePrevGroup = () => {
        if (startPage > 1) {
            setCurrentPage(startPage - 1);
        }
    };
    const formatDate = (dateString: string | undefined): string => {
        if (!dateString) {
            return '-';
        }
        // 'YYYY-MM-DD HH:mm:ss' 형식의 공백을 'T'로 교체하여 ISO 8601 형식으로 변환
        const isoDateString = dateString.replace(' ', 'T');
        const date = new Date(isoDateString);
        if (isNaN(date.getTime())) {
            return '-'; // 유효하지 않은 날짜인 경우 '-' 반환
        }
        return date.toLocaleDateString('ko-KR'); // 한국 표준으로 포맷팅
    };
    return (
        <Layout>
            <div className="leave-board">
                <div className="board-header">
                    <h1>휴가원 관리</h1>
                    {currentUser && (
                        <button className="create-button" onClick={handleCreate}>+ 새 휴가원 작성</button>
                    )}
                </div>
                <div className="tabs">
                    {/* 1) 내 휴가원 탭 (항상) */}
                    <button
                        onClick={() => {
                            setTab('my');
                            setCurrentPage(1);
                        }}
                        className={tab === 'my' ? 'active' : ''}
                    >
                        내 휴가원
                    </button>

                    {/* 2) 승인 대기 탭 (모든 사용자) */}
                    <button
                        onClick={() => {
                            setTab('pending');
                            setCurrentPage(1);
                        }}
                        className={tab === 'pending' ? 'active' : ''}
                    >
                        승인 대기
                    </button>

                    {/* 3) 완료된 휴가원 탭 (권한이 있을 때만) */}
                    {/* 완료된 휴가원: 모든 사용자에게 보여주기 */}
                     <button
                       onClick={() => { setTab('completed'); setCurrentPage(1); }}
                       className={tab === 'completed' ? 'active' : ''}
                     >
                       완료된 휴가원
                     </button>
                    {/* 모든 탭에서 검색 기능 표시 */}
                    <span className="inline-search-section">
                        <select
                            value={searchType}
                            onChange={(e) => setSearchType(e.target.value as any)}
                            className="inline-search-select"
                        >
                            <option value="all">전체</option>
                            <option value="applicant">신청자</option>
                            <option value="substitute">대직자</option>
                            <option value="status">상태</option>
                        </select>

                        <input
                            type="text"
                            placeholder={getSearchPlaceholder()}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="inline-search-input"
                        />

                        {searchTerm && (
                            <button
                                onClick={handleSearchReset}
                                className="inline-search-reset"
                                title="검색 초기화"
                            >
                                ×
                            </button>
                        )}

                        {searchTerm && (
                            <span className="inline-search-count">
                                {filteredApplications.length}건
                            </span>
                        )}
                    </span>
                </div>
                <div className="leave-application-list">
                    {noApplicationsAtAll ? (
                        <div className="empty-state"><p>등록된 휴가원이 없습니다.</p></div>

                    ) : noSearchResults ? (
                        <div className="empty-state"><p>해당 데이터가 없습니다.</p></div>

                    ) : (
                        <div className="leave-application-list-container">
                            <div className="leave-application-list-header">
                                <div>ID</div>
                                <div>신청자</div>
                                <div>대직자</div>
                                <div>휴가 종류</div>
                                <div>시작일</div>
                                <div>종료일</div>
                                <div>총 일수</div>
                                <div>상태</div>
                                <div>작성일</div>
                                <div>수정일</div>
                            </div>
                            {pageApps.map((app, idx) => (
                                <div key={app.id} className="leave-application-list-item"
                                     onClick={() => handleClick(app)}>
                                    <div className="leave-application-item-id">#{startIdx + idx + 1}</div>
                                    <div
                                        className="leave-application-item-applicant">{app.applicantName || app.applicantId}</div>
                                    <div
                                        className="leave-application-item-substitute">{getSubstituteNameFromFormData(app)}</div>
                                    <div className="leave-application-item-type">{getLeaveTypeFromFormData(app)}</div>
                                    <div className="leave-application-item-start">{getStartDateFromFormData(app)}</div>
                                    <div className="leave-application-item-end">{getEndDateFromFormData(app)}</div>
                                    <div className="leave-application-item-days">
                                        {(() => {
                                            const days = getTotalDaysFromFormData(app);
                                            console.log(`앱 ID ${app.id}의 최종 days:`, days);
                                            return days !== null && days !== undefined ?
                                                `${days % 1 === 0 ? days : days.toFixed(1)}일` : '-';
                                        })()}
                                    </div>
                                    <div
                                        className={`leave-application-item-status ${getStatusClass(app.status)}`}>{getStatusText(app.status)}</div>
                                    <div className="leave-application-item-created">
                                        {formatDate(app.createdAt)}
                                    </div>
                                    <div className="leave-application-item-updated">
                                        {formatDate(app.updatedAt)}
                                    </div>
                                </div>
                            ))}
                            <div className="pagination">
                                {startPage > 1 && (
                                    <button onClick={handlePrevGroup}>&lt;</button>
                                )}
                                {Array.from({length: endPage - startPage + 1}, (_, i) => startPage + i).map(num => (
                                    <button
                                        key={num}
                                        onClick={() => setCurrentPage(num)}
                                        className={num === currentPage ? 'active' : ''}
                                    >
                                        {num}
                                    </button>
                                ))}
                                {endPage < totalPages && (
                                    <button onClick={handleNextGroup}>&gt;</button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
};

export default LeaveApplicationBoard;