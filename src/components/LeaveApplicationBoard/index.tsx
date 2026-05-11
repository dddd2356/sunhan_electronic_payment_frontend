import React, {useEffect, useState} from 'react';
import './style.css';
import Layout from "../Layout";
import {
    createLeaveApplication,
    fetchCurrentUser as apiFetchCurrentUser,
    fetchLeaveApplications,
    fetchAllPendingApplications,
    fetchRejectedApplications
} from '../../apis/leaveApplications';
import dayjs from "dayjs";
import {useNavigate} from "react-router-dom";

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
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>('');
    const [tab, setTab] = useState<'my' | 'pending' | 'allPending' | 'rejected' |'completed'>('my');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchType, setSearchType] = useState<'applicant'|'substitute'|'status'>('applicant');
    const [hasHrLeavePermission, setHasHrLeavePermission] = useState(false);
    const [searchStartDate, setSearchStartDate] = useState('');
    const [searchEndDate, setSearchEndDate] = useState('');
    const navigate = useNavigate();
    // 탭에 따른 플레이스홀더 텍스트 함수
    const getSearchPlaceholder = () => {
        switch (tab) {
            case 'my':
                return '내 휴가원 검색...';
            case 'pending':
                return '승인 대기 검색...';
            case 'allPending':
                return '전체 진행중 검색...';
            case 'rejected':
                return '반려된 휴가원 검색...';
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
    const filteredApplications = applications;

    const getStatusText = (s: string) => {
        switch (s) {
            case 'DRAFT': return '작성중';
            case 'PENDING': return '승인 대기'; // ✅ 통합
            case 'APPROVED': return '최종 승인';
            case 'REJECTED': return '반려됨';
            default: return s;
        }
    };


    const getStatusClass = (status: string) => {
        switch (status) {
            case 'DRAFT': return 'status-draft';
            case 'REJECTED': return 'status-return';
            case 'APPROVED': return 'status-completed';
            case 'PENDING': return 'status-sent'; // ✅ 통합
            default: return '';
        }
    };

    const getLeaveTypeLabel = (type?: string) => {
        if (!type) return '-';
        switch (type) {
            case 'ANNUAL_LEAVE':      return '연차휴가';
            case 'FAMILY_EVENT_LEAVE': return '경조휴가';
            case 'SPECIAL_LEAVE':     return '특별휴가';
            case 'MENSTRUAL_LEAVE':   return '생리휴가';
            case 'MATERNITY_LEAVE':   return '분만휴가'; // Java에 정의된 대로
            case 'MISCARRIAGE_LEAVE': return '유산사산휴가';
            case 'SICK_LEAVE':        return '병가';
            case 'OTHER':             return '기타';
            default:                  return type; // 매칭되지 않으면 원래 값 출력
        }
    };

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
        // ✅ DB의 totalDays를 최우선으로 사용 (이제 계산값이므로 정확함)
        if (app.totalDays !== undefined && app.totalDays !== null) {
            return app.totalDays;
        }

        // ✅ formDataJson 파싱은 백업용으로만 유지
        if (app.formDataJson) {
            try {
                const formData = JSON.parse(app.formDataJson);
                if (formData.totalDays !== undefined && formData.totalDays !== null) {
                    return formData.totalDays;
                }

                let total = 0;

                // flexiblePeriods 계산
                if (formData.flexiblePeriods && formData.flexiblePeriods.length > 0) {
                    formData.flexiblePeriods.forEach((period: any) => {
                        if (period.startDate && period.endDate) {
                            const start = dayjs(period.startDate);
                            const end = dayjs(period.endDate);

                            // ✅ 반차 처리
                            if (period.halfDayOption === 'morning' || period.halfDayOption === 'afternoon') {
                                total += 0.5;
                            } else {
                                const days = end.diff(start, 'day') + 1;
                                total += days;
                            }
                        }
                    });
                }

                // consecutivePeriod 계산
                if (formData.consecutivePeriod && formData.consecutivePeriod.startDate && formData.consecutivePeriod.endDate) {
                    const start = dayjs(formData.consecutivePeriod.startDate);
                    const end = dayjs(formData.consecutivePeriod.endDate);
                    const days = end.diff(start, 'day') + 1;
                    total += days;
                }

                return total;
            } catch (e) {
                console.error('formDataJson 파싱 실패:', e);
            }
        }

        return 0;
    };

    useEffect(() => {
        if (currentUser) {
            setHasHrLeavePermission(
                currentUser.permissions?.includes('HR_LEAVE_APPLICATION') ?? false
            );
        }
    }, [currentUser]);

// 탭 변경 시 검색 초기화를 위한 useEffect 수정
    useEffect(() => {
        if (currentUser) {
            fetchApplications();
        }
    }, [currentUser, tab, currentPage]); // currentPage 추가

    useEffect(() => {
        setSearchTerm('');
        setSearchType('applicant');
        setCurrentPage(1);
        setSearchStartDate('');
        setSearchEndDate('');
    }, [tab]);

    useEffect(() => {
        fetchCurrentUser();
    }, []);

    const fetchCurrentUser = async () => {
        try {
            const data = await apiFetchCurrentUser();
            setCurrentUser(data);
        } catch (err: any) {
            setError(err.message || '사용자 정보를 불러올 수 없습니다.');
        }
    };

    const fetchApplications = async (
        pageOverride?: number,
        searchTermOverride?: string,
        searchStartDateOverride?: string,
        searchEndDateOverride?: string
    ) => {
        setLoading(true);
        try {
            const apiPage = pageOverride !== undefined ? pageOverride : currentPage - 1;
            const term = searchTermOverride !== undefined ? searchTermOverride : searchTerm;
            const startDate = searchStartDateOverride !== undefined ? searchStartDateOverride : searchStartDate;
            const endDate = searchEndDateOverride !== undefined ? searchEndDateOverride : searchEndDate;

            // ✅ pending 탭에서 HR 권한자는 전체 조회 API 사용
            if (tab === 'allPending' && hasHrLeavePermission) {
                const data = await fetchAllPendingApplications(
                    apiPage, itemsPerPage, term, searchType, startDate, endDate
                );
                setPaginationData(data);
                setApplications(data.content);
                return;
            }

            // ✅ rejected 탭: HR 권한자는 전체, 일반 사용자는 본인 것만 (서버에서 처리)
            if (tab === 'rejected') {
                const data = await fetchRejectedApplications(
                    apiPage, itemsPerPage, term, searchType, startDate, endDate
                );
                setPaginationData(data);
                setApplications(data.content);
                return;
            }

            // 기존 로직 유지
            const data = await fetchLeaveApplications(
                tab as 'my' | 'pending' | 'completed',
                canViewCompleted,
                apiPage,
                itemsPerPage,
                term,
                searchType,
                startDate,
                endDate
            ) as PaginationData;

            setPaginationData(data);

            let filtered = data.content;
            if (tab === 'my') {
                filtered = data.content.filter((app: LeaveApplication) =>
                    app.status === 'DRAFT' ||
                    app.status.startsWith('PENDING')
                );
            }

            if (tab === 'completed') {
                filtered = data.content.filter(app => app.status === 'APPROVED');
            }

            setApplications(filtered);

        } catch (err: any) {
            setError(err.message || '휴가원 목록을 불러올 수 없습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        try {
            const newApp: LeaveApplication = await createLeaveApplication();
            navigate(`/detail/leave-application/edit/${newApp.id}`);
        } catch (err: any) {
            setError(err.message || '휴가원 생성에 실패했습니다.');
        }
    };

    const handleClick = (app: LeaveApplication) => {
        const base = '/detail/leave-application';
        if ((app.status === 'DRAFT' && app.applicantId === currentUser?.userId) ||
            (currentUser?.role === 'ADMIN' && currentUser?.jobLevel >= '2' && app.status !== 'COMPLETED')) {
            navigate(`${base}/edit/${app.id}`);
        } else {
            navigate(`${base}/view/${app.id}`);
        }
    };

    // 검색 초기화 함수
    const handleSearchReset = () => {
        setSearchTerm('');
        setSearchType('applicant');
        setSearchStartDate('');
        setSearchEndDate('');
        setCurrentPage(1);
        fetchApplications(0, '', '', '');
    };

    const handleSearch = () => {
        if ((searchStartDate && !searchEndDate) || (!searchStartDate && searchEndDate)) {
            alert('시작일과 종료일을 모두 입력하거나 모두 비워주세요.');
            return;
        }
        setCurrentPage(1);
        fetchApplications(0); // 0페이지 강제 지정 — setState 비동기 타이밍 무관
    };

    const handleTextClear = () => {
        setSearchTerm('');
        setCurrentPage(1);
        fetchApplications(0, '', searchStartDate, searchEndDate); // 날짜는 그대로 유지
    };

// 페이지 변경 핸들러 추가
    const handlePageChange = async (newPage: number) => {
        setCurrentPage(newPage);
    };

    const canViewCompleted = Boolean(currentUser && (
        // 인사담당자: ADMIN이면서 jobLevel 0이고 deptCode가 'AD'
        (currentUser.permissions?.includes('HR_LEAVE_APPLICATION') && (currentUser.jobLevel === '0' || currentUser.jobLevel === '1')) ||
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
    const isSearching = searchTerm.trim().length > 0 || !!searchStartDate || !!searchEndDate;
    const noSearchResults = isSearching && filteredApplications.length === 0;
    const noApplicationsAtAll = applications.length === 0 && !isSearching;
    // 페이지네이션 로직 수정 부분
    const pageGroupSize = 5;
    const safeTotalPages = Math.max(totalPages, 1);
    const startPage = Math.floor((currentPage - 1) / pageGroupSize) * pageGroupSize + 1;
    const endPage = Math.min(startPage + pageGroupSize - 1, safeTotalPages);

    const handleNextGroup = async () => {
        if (endPage < totalPages) {
            await handlePageChange(endPage + 1);
        }
    };

    const handlePrevGroup = async () => {
        if (startPage > 1) {
            await handlePageChange(startPage - 1);
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
                        작성중 및 진행중
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

                    {hasHrLeavePermission && (
                        <button
                            onClick={() => { setTab('allPending'); setCurrentPage(1); }}
                            className={tab === 'allPending' ? 'active' : ''}
                        >
                            전체 진행중
                        </button>
                    )}

                    <button
                        onClick={() => { setTab('rejected'); setCurrentPage(1); }}
                        className={tab === 'rejected' ? 'active' : ''}
                    >
                        반려된 휴가원
                    </button>

                    {/* 완료된 휴가원: 모든 사용자에게 보여주기 */}
                    <button
                        onClick={() => {
                            setTab('completed');
                            setCurrentPage(1);
                        }}
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
                            <option value="applicant">신청자</option>
                            <option value="substitute">대직자</option>
                            <option value="status">상태</option>
                        </select>

                        <input
                            type="text"
                            placeholder={getSearchPlaceholder()}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                            className="inline-search-input"
                        />

                        {searchTerm && (
                            <button onClick={handleTextClear} className="inline-search-reset" title="검색어 초기화">
                                ×
                            </button>
                        )}

                        <div className="search-filters">
                            <input
                                type="date"
                                value={searchStartDate}
                                onChange={(e) => setSearchStartDate(e.target.value)}
                                className="date-input"
                                placeholder="시작일"
                                onFocus={(e) => e.target.type = 'date'}
                                onBlur={(e) => {
                                    if (!e.target.value) e.target.type = 'text';
                                }}
                            />
                            <span className="date-separator">~</span>
                            <input
                                type="date"
                                value={searchEndDate}
                                onChange={(e) => setSearchEndDate(e.target.value)}
                                className="date-input"
                                placeholder="종료일"
                                onFocus={(e) => e.target.type = 'date'}
                                onBlur={(e) => {
                                    if (!e.target.value) e.target.type = 'text';
                                }}
                            />
                            <button onClick={handleSearch} className="search-button">검색</button>
                                                    {(searchStartDate || searchEndDate) && (
                                                        <button onClick={handleSearchReset} className="reset-button">초기화</button>
                                                    )}
                        </div>
                        {searchTerm && (
                            <span className="inline-search-count">
                                {paginationData.totalElements}건
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
                                    <div className="leave-application-item-type">
                                        {getLeaveTypeLabel(getLeaveTypeFromFormData(app) !== '-'
                                            ? getLeaveTypeFromFormData(app)
                                            : app.leaveType)}
                                    </div>
                                    <div className="leave-application-item-start">{getStartDateFromFormData(app)}</div>
                                    <div className="leave-application-item-end">{getEndDateFromFormData(app)}</div>
                                    <div className="leave-application-item-days">
                                        {(() => {
                                            const days = getTotalDaysFromFormData(app);
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
                                        onClick={() => handlePageChange(num)}
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