import Layout from '../../../components/Layout';
import React, {useEffect, useState} from "react";
import "./style.css";
import ProfileCompletionPopup from "../../../components/ProfileCompletionPopup";
import {useCookies} from "react-cookie";
import VacationHistoryPopup from "../../../components/VacationHistoryPopup";
import ReportsModal from "../../../components/ReportsModal";
import axios from "axios";

interface UserProfile {
    userId: string;
    userName: string;
    phone: string | null;
    address: string | null;
    detailAddress: string | null;
    passwordChangeRequired: boolean;
    deptCode?: string;
    jobType?: string;
    jobLevel?: string;
    useFlag?: string;
    totalVacationDays?: number;
    usedVacationDays?: number;
    privacyConsent?: boolean;
    notificationConsent?: boolean;
}

interface ContractStatus {
    id: number;
    title: string;
    status: 'DRAFT' | 'SENT_TO_EMPLOYEE' | 'SIGNED_BY_EMPLOYEE' | 'RETURNED_TO_ADMIN' | 'COMPLETED' | 'DELETED';
    createdAt: string;
    updatedAt: string;
}

interface VacationHistory {
    id: number;
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
    status: 'APPROVED' | 'PENDING' | 'REJECTED';
    createdDate: string;
}

interface VacationStatus {
    userId: string;
    userName: string;
    totalVacationDays: number;
    usedVacationDays: number;
    remainingVacationDays: number;
}

interface RecentActivity {
    type: 'vacation' | 'contract' | 'workSchedule';
    id: number;
    title: string;
    date: string;
    status: string; // '진행중', '완료', '반려/취소' 등 단순화된 상태
}

interface WorkScheduleStatus {
    id: number;
    title: string;
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
    createdAt: string;
    updatedAt: string;
    scheduleYearMonth?: string; // "YYYY-MM" 형식
}

const MainPage: React.FC = () => {
    const [cookies] = useCookies(['accessToken']);
    const [showProfilePopup, setShowProfilePopup] = useState(false);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [loadingUser, setLoadingUser] = useState(true);
    const [fetchError, setFetchError] = useState('');
    const [currentTime, setCurrentTime] = useState(new Date());

    // 휴가 관련 상태 추가
    const [vacationStatus, setVacationStatus] = useState<VacationStatus | null>(null);
    const [vacationHistory, setVacationHistory] = useState<VacationHistory[]>([]);
    const [loadingVacation, setLoadingVacation] = useState(true);
    const [vacationError, setVacationError] = useState('');

    // 휴가 현황 계산 - vacationStatus에서 가져오도록 수정
    const totalVacationDays = vacationStatus?.totalVacationDays || 15;
    const usedVacationDays = vacationStatus?.usedVacationDays || 0;
    const remainingVacationDays = vacationStatus?.remainingVacationDays || totalVacationDays;
    const vacationUsagePercentage = totalVacationDays > 0 ? (usedVacationDays / totalVacationDays) * 100 : 0;

    // 휴가 기록 팝업 상태 추가
    const [showHistoryPopup, setShowHistoryPopup] = useState(false);

    const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
    const [loadingActivities, setLoadingActivities] = useState(true);
    const [activitiesError, setActivitiesError] = useState('');

    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false); // 문서관리 팝업 상태 추가
    const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);

    const [departmentNames, setDepartmentNames] = useState<Record<string, string>>({});

    const handleShowHistoryPopup = () => {
        setShowHistoryPopup(true);
    };

    const mapStatusToSimpleKorean = (status: string): string => {
        switch (status) {
            case 'DRAFT':
                return '작성중';
            case 'SENT_TO_EMPLOYEE':
            case 'SUBMITTED':
            case 'PENDING_SUBSTITUTE':
            case 'PENDING_DEPT_HEAD':
            case 'PENDING_CENTER_DIRECTOR':
            case 'PENDING_ADMIN_DIRECTOR':
            case 'PENDING_CEO_DIRECTOR':
            case 'PENDING_HR_STAFF':
                return '진행중';
            case 'SIGNED_BY_EMPLOYEE':
            case 'COMPLETED':
            case 'APPROVED':
                return '완료';
            case 'RETURNED_TO_ADMIN':
            case 'REJECTED':
            case 'DELETED':
                return '반려/취소';
            default:
                return '알 수 없음';
        }
    };

    const handleCloseHistoryPopup = () => {
        setShowHistoryPopup(false);
    };

    useEffect(() => {
        const fetchDepartmentNames = async () => {
            try {
                const response = await axios.get('/api/v1/departments/names', {
                    headers: { Authorization: `Bearer ${cookies.accessToken}` }
                });
                setDepartmentNames(response.data);
            } catch (error) {
                console.error('부서 이름 조회 실패:', error);
            }
        };
        fetchDepartmentNames();
    }, []);

    useEffect(() => {
        const fetchUserProfile = async () => {
            console.log(">>> fetchUserProfile 함수 시작 <<<");

            if (!cookies.accessToken) {
                console.log("No access token found, redirecting to login.");
                setLoadingUser(false);
                return;
            }
            try {
                setLoadingUser(true);

                const response = await fetch(`/api/v1/user/me`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${cookies.accessToken}`
                    }
                });

                if (response.status === 401) {
                    setLoadingUser(false);
                    return;
                }

                if (!response.ok) {
                    throw new Error('사용자 정보를 가져오는데 실패했습니다.');
                }

                const data: UserProfile = await response.json();
                setUserProfile(data);
                console.log("Fetched User Data:", data);

                // 주소와 상세 주소 중 하나라도 누락되면 팝업을 띄우도록 로직 수정
                const isPhoneMissing = !data.phone || data.phone.trim() === '';
                const isAddressMissing = !data.address || data.address.trim() === '';
                const isDetailAddressMissing = !data.detailAddress || data.detailAddress.trim() === '';

                console.log("Condition: passwordChangeRequired =", data.passwordChangeRequired);
                console.log("Condition: isPhoneMissing =", isPhoneMissing);
                console.log("Condition: isAddressMissing =", isAddressMissing);
                console.log("Condition: isDetailAddressMissing =", isDetailAddressMissing);
                console.log("Overall popup condition:", data.passwordChangeRequired || isPhoneMissing || isAddressMissing || isDetailAddressMissing);

                if (data.passwordChangeRequired || isPhoneMissing || isAddressMissing) {
                    setShowProfilePopup(true);
                    console.log("Popup will show!");
                } else {
                    setShowProfilePopup(false);
                    console.log("Popup will NOT show.");
                }

            } catch (err: any) {
                setFetchError(err.message || '사용자 정보 로딩 중 오류 발생');
                console.error("Failed to fetch user profile:", err);
            } finally {
                setLoadingUser(false);
            }
        };

        fetchUserProfile();
    }, []);

    // 휴가 현황 정보 가져오기 - useEffect 수정
    useEffect(() => {
        const fetchVacationData = async () => {
            if (!cookies.accessToken) return;

            try {
                setLoadingVacation(true);
                setVacationError('');

                // 휴가 현황 가져오기
                const statusResponse = await fetch(`/api/v1/vacation/my-status`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${cookies.accessToken}`
                    }
                });

                if (statusResponse.ok) {
                    const statusData: VacationStatus = await statusResponse.json();
                    setVacationStatus(statusData);
                }

                // 휴가 사용 내역 가져오기
                const historyResponse = await fetch(`/api/v1/vacation/my-history`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${cookies.accessToken}`
                    }
                });

                if (historyResponse.ok) {
                    const historyData: VacationHistory[] = await historyResponse.json();
                    setVacationHistory(historyData);
                }

            } catch (err: any) {
                console.error("Failed to fetch vacation data:", err);
                setVacationError('휴가 정보를 불러오는데 실패했습니다.');
            } finally {
                setLoadingVacation(false);
            }
        };

        // userProfile이 로드된 후에 휴가 데이터를 가져오도록 수정
        if (userProfile && cookies.accessToken) {
            fetchVacationData();
        }
    }, [userProfile, cookies.accessToken]); // userProfile이 의존성에 포함

    const handleProfileUpdateSuccess = (updatedUser: UserProfile) => {
        setUserProfile(updatedUser);
        setShowProfilePopup(false);
        alert('프로필 정보가 성공적으로 업데이트되었습니다.');
    };

    const handleClosePopup = () => {
        if (userProfile && userProfile.passwordChangeRequired || !userProfile?.phone || !userProfile?.address) {
            // 강제 팝업이므로 닫기 허용하지 않음
        }
        setShowProfilePopup(false);
    };

    const getGreeting = () => {
        const hour = currentTime.getHours();
        if (hour < 12) return "좋은 아침입니다";
        if (hour < 18) return "좋은 오후입니다";
        return "좋은 저녁입니다";
    };

    const getPositionByJobLevel = (jobLevel: string | undefined): string => {
        const level = String(jobLevel);
        switch (level) {
            case '0': return '사원';
            case '1': return '부서장';
            case '2': return '진료센터장';
            case '3': return '원장';
            case '4': return '행정원장';
            case '5': return '대표원장';
            default: return '';
        }
    };

    const formatDateRange = (startDate: string, endDate: string) => {
        const start = new Date(startDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
        const end = new Date(endDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
        return `${start} ~ ${end}`;
    };

    useEffect(() => {
        const fetchRecentActivities = async () => {
            if (!cookies.accessToken || !userProfile) return;

            try {
                setLoadingActivities(true);
                setActivitiesError('');

                // API 호출 (기존 로직 재사용 및 신규 API 추가)
                const vacationResponse = await fetch(`/api/v1/vacation/my-history`, {
                    headers: { 'Authorization': `Bearer ${cookies.accessToken}` }
                });
                const vacationData: VacationHistory[] = vacationResponse.ok ? await vacationResponse.json() : [];

                // 예시: 계약서 API 엔드포인트
                const contractResponse = await fetch(`/api/v1/employment-contract/my-status`, {
                    headers: { 'Authorization': `Bearer ${cookies.accessToken}` }
                });
                const contractData: ContractStatus[] = contractResponse.ok ? await contractResponse.json() : [];

                const workScheduleResponse = await fetch(`/api/v1/work-schedules/my-status`, {
                    headers: { 'Authorization': `Bearer ${cookies.accessToken}` }
                });
                const workScheduleData: WorkScheduleStatus[] = workScheduleResponse.ok ? await workScheduleResponse.json() : [];

                // 데이터 통합 및 상태 매핑
                const formattedVacations: RecentActivity[] = vacationData.map(v => ({
                    type: 'vacation',
                    id: v.id,
                    title: '휴가원',
                    date: v.createdDate,
                    status: mapStatusToSimpleKorean(v.status)
                }));

                const formattedContracts: RecentActivity[] = contractData.map(c => ({
                    type: 'contract',
                    id: c.id,
                    title: '근로계약서',
                    date: c.updatedAt,
                    status: mapStatusToSimpleKorean(c.status)
                }));

                const formattedWorkSchedules: RecentActivity[] = workScheduleData.map(w => ({
                    type: 'workSchedule',
                    id: w.id,
                    title: '근무현황표',
                    date: w.updatedAt,
                    status: mapStatusToSimpleKorean(w.status)
                }));

                // 모든 활동을 합쳐서 최신순으로 3개만 선택
                const combinedActivities = [...formattedVacations, ...formattedContracts,  ...formattedWorkSchedules ]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 3);

                setRecentActivities(combinedActivities);

            } catch (err: any) {
                console.error("Failed to fetch recent activities:", err);
                setActivitiesError('최근 활동을 불러오는데 실패했습니다.');
            } finally {
                setLoadingActivities(false);
            }
        };

        if (userProfile && cookies.accessToken) {
            fetchRecentActivities();
        }
    }, [userProfile, cookies.accessToken]);

    if (loadingUser) {
        return (
            <Layout>
                <div className="mp-container">
                    <div className="mp-loading-state">
                        <div className="mp-loading-spinner"></div>
                        <p>사용자 정보를 불러오는 중...</p>
                    </div>
                </div>
            </Layout>
        );
    }

    if (fetchError) {
        return (
            <Layout>
                <div className="mp-container">
                    <div className="mp-error-state">
                        <div className="mp-error-icon">⚠️</div>
                        <h3>오류 발생</h3>
                        <p>{fetchError}</p>
                        <button className="mp-retry-btn" onClick={() => window.location.reload()}>
                            다시 시도
                        </button>
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="mp-container">
                <div className="mp-content-grid">
                    {/* 왼쪽 컬럼 */}
                    <div className="mp-left-column">
                        {/* 환영 헤더 */}
                        <div className="mp-welcome-card">
                            <div className="mp-welcome-content">
                                <div className="mp-greeting">
                                    <h1 className="mp-greeting-title">
                                        {getGreeting()}, {userProfile?.userName || '사용자'}님!
                                    </h1>
                                    <p className="mp-greeting-subtitle">
                                        오늘도 좋은 하루 보내세요
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* 사용자 정보 카드 */}
                        <div className="mp-user-info-card">
                            <div className="mp-card-header">
                                <h2 className="mp-card-title">내 정보</h2>
                            </div>
                            <div className="mp-user-info-grid">
                                <div className="mp-info-item">
                                    <div className="mp-info-icon">👤</div>
                                    <div className="mp-info-details">
                                        <span className="mp-info-label">이름</span>
                                        <span className="mp-info-value">{userProfile?.userName || '미등록'}</span>
                                    </div>
                                </div>

                                <div className="mp-info-item">
                                    <div className="mp-info-icon">🏢</div>
                                    <div className="mp-info-details">
                                        <span className="mp-info-label">부서 / 직급</span>
                                        <span className="mp-info-value">
                                            {(userProfile?.deptCode ? (departmentNames[userProfile.deptCode] ?? userProfile.deptCode) : '미등록')}
                                            {userProfile?.jobLevel ? ` / ${getPositionByJobLevel(userProfile.jobLevel)}` : ''}
                                        </span>
                                    </div>
                                </div>

                                <div className={`mp-info-item ${!userProfile?.phone ? 'mp-missing-data' : ''}`}>
                                    <div className="mp-info-icon">📱</div>
                                    <div className="mp-info-details">
                                        <span className="mp-info-label">핸드폰 번호</span>
                                        <span className="mp-info-value">
                                            {userProfile?.phone || '미등록'}
                                        </span>
                                    </div>
                                    {!userProfile?.phone && <div className="mp-missing-badge">!</div>}
                                </div>

                                <div
                                    className={`mp-info-item ${(!userProfile?.address && !userProfile?.detailAddress) ? 'mp-missing-data' : ''}`}>
                                    <div className="mp-info-icon">🏠</div>
                                    <div className="mp-info-details">
                                        <span className="mp-info-label">주소</span>
                                        <span className="mp-info-value">
                                            {/* 주소와 상세 주소를 합치는 새로운 로직 */}
                                                                            {`${userProfile?.address || ''} ${userProfile?.detailAddress || ''}`.trim() || '미등록'}
                                        </span>
                                    </div>
                                    {/* 뱃지는 주소와 상세 주소가 모두 없을 때만 표시 */}
                                    {(!userProfile?.address && !userProfile?.detailAddress) &&
                                        <div className="mp-missing-badge">!</div>}
                                </div>
                            </div>
                        </div>

                        {/* 알림 카드 */}
                        {(userProfile?.passwordChangeRequired || !userProfile?.phone || !userProfile?.address) && (
                            <div className="mp-alert-card">
                                <div className="mp-alert-icon">⚠️</div>
                                <div className="mp-alert-content">
                                    <h3 className="mp-alert-title">프로필 정보 업데이트 필요</h3>
                                    <p className="mp-alert-message">
                                        {userProfile?.passwordChangeRequired && "비밀번호 변경이 필요합니다. "}
                                        {(!userProfile?.phone || !userProfile?.address) && "누락된 개인정보가 있습니다."}
                                    </p>
                                    <button
                                        className="mp-alert-btn"
                                        onClick={() => setShowProfilePopup(true)}
                                    >
                                        지금 업데이트하기
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 휴가 현황 카드 */}
                        <div className="mp-vacation-card">
                            <div className="mp-vacation-header">
                                <h2 className="mp-vacation-title">휴가 현황</h2>
                                <div className="mp-vacation-icon">🏖️</div>
                            </div>

                            {loadingVacation ? (
                                <div className="mp-vacation-loading">
                                    <div className="mp-vacation-loading-spinner"></div>
                                    <p>휴가 정보를 불러오는 중...</p>
                                </div>
                            ) : vacationError ? (
                                <div className="mp-vacation-error">
                                    <div className="mp-error-icon">⚠️</div>
                                    <p>{vacationError}</p>
                                    <button
                                        className="mp-retry-btn"
                                        onClick={() => window.location.reload()}
                                    >
                                        다시 시도
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="mp-vacation-summary">
                                        <div className="mp-vacation-stat">
                                            <span className="mp-vacation-stat-number">{totalVacationDays}</span>
                                            <span className="mp-vacation-stat-label">총 휴가</span>
                                        </div>
                                        <div className="mp-vacation-stat">
                                            <span className="mp-vacation-stat-number">{usedVacationDays}</span>
                                            <span className="mp-vacation-stat-label">사용</span>
                                        </div>
                                        <div className="mp-vacation-stat">
                                            <span className="mp-vacation-stat-number">{remainingVacationDays}</span>
                                            <span className="mp-vacation-stat-label">남은 휴가</span>
                                        </div>
                                    </div>

                                    <div className="mp-vacation-progress">
                                        <div className="mp-vacation-progress-label">
                                            <span>사용률</span>
                                            <span>{Math.round(vacationUsagePercentage)}%</span>
                                        </div>
                                        <div className="mp-vacation-progress-bar">
                                            <div
                                                className="mp-vacation-progress-fill"
                                                style={{ width: `${Math.min(vacationUsagePercentage, 100)}%` }}
                                            ></div>
                                        </div>
                                    </div>

                                    <div className="mp-vacation-history">
                                        <div className="mp-vacation-history-header">
                                            <h3 className="mp-vacation-history-title">최근 사용내역</h3>
                                            <button className="mp-vacation-history-btn"
                                                    onClick={handleShowHistoryPopup}> {/* onClick 추가 */}
                                                전체보기
                                            </button>
                                        </div>
                                        <div className="mp-vacation-history-list">
                                            {vacationHistory.length > 0 ? (
                                                vacationHistory.slice(0, 3).map((vacation, index) => (
                                                    <div key={index} className="mp-vacation-history-item">
                                                        <div className="mp-vacation-history-date">
                                                            {formatDateRange(vacation.startDate, vacation.endDate)}
                                                        </div>
                                                        <div className="mp-vacation-history-days">
                                                            {vacation.days}일
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="mp-vacation-history-empty">
                                                    아직 사용한 휴가가 없습니다
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>


                    {/* 오른쪽 컬럼 */}
                    <div className="mp-right-column">
                        {/* 빠른 작업 카드 */}
                        <div className="mp-quick-actions-card">
                            <div className="mp-card-header">
                                <h2 className="mp-card-title">빠른 작업</h2>
                            </div>
                            <div className="mp-action-grid">
                                <button
                                    className="mp-action-btn mp-action-profile"
                                    onClick={() => setShowProfilePopup(true)}
                                >
                                    <div className="mp-action-icon">⚙️</div>
                                    <div className="mp-action-details">
                                        <span className="mp-action-title">프로필 관리</span>
                                        <span className="mp-action-desc">정보 등록 및 업데이트</span>
                                    </div>
                                </button>

                                <button
                                    className="mp-action-btn mp-action-reports"
                                    onClick={() => setIsReportsModalOpen(true)}
                                >
                                    <div className="mp-action-icon">📄</div>
                                    <div className="mp-action-details">
                                        <span className="mp-action-title">문서 관리</span>
                                        <span className="mp-action-desc">문서 조회 및 현황</span>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* 최근 활동 카드 */}
                        <div className="mp-activity-card">
                            <div className="mp-card-header">
                                <h2 className="mp-card-title">최근 활동</h2>
                            </div>
                            <div className="mp-activity-list">
                                <div className="mp-activity-item">
                                    <div className="mp-activity-time">오늘</div>
                                    <div className="mp-activity-details">
                                    <div className="mp-activity-title">로그인</div>
                                        <div className="mp-activity-desc">시스템에 접속했습니다</div>
                                    </div>
                                </div>
                                {loadingActivities ? (
                                    <div className="mp-activity-loading">
                                        <div className="mp-loading-spinner"></div>
                                        <p>최근 활동을 불러오는 중...</p>
                                    </div>
                                ) : activitiesError ? (
                                    <div className="mp-activity-error">
                                        <p>{activitiesError}</p>
                                    </div>
                                ) : recentActivities.length > 0 ? (
                                    recentActivities.map(activity => (
                                        <div key={activity.id} className="mp-activity-item">
                                            <div
                                                className="mp-activity-time">{new Date(activity.date).toLocaleDateString('ko-KR')}</div>
                                            <div className="mp-activity-details">
                                                <div className="mp-activity-title">{activity.title}</div>
                                                <div className="mp-activity-desc">
                                                    상태: {activity.status}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="mp-activity-item mp-activity-empty">
                                        <div className="mp-activity-time">-</div>
                                        <div className="mp-activity-details">
                                            <div className="mp-activity-title">활동 내역이 없습니다</div>
                                            <div className="mp-activity-desc">새로운 활동을 시작해보세요</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {userProfile && (
                <ProfileCompletionPopup
                    isOpen={showProfilePopup}
                    onClose={handleClosePopup}
                    onUpdateSuccess={handleProfileUpdateSuccess}
                    userId={userProfile.userId}
                    initialPhone={userProfile.phone}
                    initialAddress={userProfile.address}
                    initialDetailAddress={userProfile.detailAddress}
                    initialPrivacyConsent={userProfile.privacyConsent}
                    initialNotificationConsent={userProfile.notificationConsent}
                    requirePasswordChange={userProfile.passwordChangeRequired}
                />
            )}
            {/* 휴가 기록 팝업 추가 */}
            {showHistoryPopup && (
                <VacationHistoryPopup
                    isOpen={showHistoryPopup}
                    onClose={handleCloseHistoryPopup}
                    vacationHistory={vacationHistory}
                />
            )}
            {/* 보고서 모달 */}
            {isReportsModalOpen && (
                <ReportsModal
                    isOpen={isReportsModalOpen}
                    onClose={() => setIsReportsModalOpen(false)}
                />
            )}
        </Layout>
    );
};

export default MainPage;