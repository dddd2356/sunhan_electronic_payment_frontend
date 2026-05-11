import Layout from '../../../components/Layout';
import React, { useEffect, useState } from "react";
import "./style.css";
import ProfileCompletionPopup from "../../../components/ProfileCompletionPopup";
import VacationHistoryPopup from "../../../components/VacationHistoryPopup";
import ReportsModal from "../../../components/ReportsModal";
import axiosInstance from "../../../views/Authentication/axiosInstance";
import {
    RefreshCw,
    Calendar,
    User,
    ClipboardList,
    Settings,
    FileText,
    Bell,
    Clock,
    AlertTriangle,
    Home,
    Smartphone,
    Megaphone, CheckCircle2
} from 'lucide-react';
import {ContractMemo, getMyMemos} from "../../../apis/contractMemo";
import {useNavigate} from "react-router-dom";

// --- 원본 인터페이스 유지 ---
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
    annualCarryoverDays?: number;
    annualRegularDays?: number;
    annualTotalDays?: number;
    annualUsedDays?: number;
    annualRemainingDays?: number;
    // 사용 세부 정보
    usedCarryoverDays?: number;        // 이월 사용
    usedRegularDays?: number;          // 정상 사용
    // 하위 호환
    totalVacationDays: number;
    usedVacationDays: number;
    remainingVacationDays: number;
}

interface RecentActivity {
    type: 'vacation' | 'contract' | 'workSchedule';
    id: number;
    title: string;
    date: string;
    status: string;
}

interface WorkScheduleStatus {
    id: number;
    title: string;
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
    createdAt: string;
    updatedAt: string;
    scheduleYearMonth?: string;
}

interface MyScheduleData {
    yearMonth: string;
    hasSchedule: boolean;
    workData: Record<string, string>;
    nightDutyActual: number;
    dutyDisplayName?: string;
    offCount: number;
    vacationUsedThisMonth: number;
    deptName?: string;
}

const MainPage: React.FC = () => {
    const [showProfilePopup, setShowProfilePopup] = useState(false);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [loadingUser, setLoadingUser] = useState(true);
    const [, setFetchError] = useState('');
    const [currentTime] = useState(new Date());

    const [vacationStatus, setVacationStatus] = useState<VacationStatus | null>(null);
    const [vacationHistory, setVacationHistory] = useState<VacationHistory[]>([]);
    const [loadingVacation, setLoadingVacation] = useState(true);
    const [vacationError, setVacationError] = useState('');

    const [showHistoryPopup, setShowHistoryPopup] = useState(false);
    const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
    const [loadingActivities, setLoadingActivities] = useState(true);
    const [activitiesError, setActivitiesError] = useState('');

    const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);
    const [departmentNames, setDepartmentNames] = useState<Record<string, string>>({});
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [memos, setMemos] = useState<ContractMemo[]>([]);
    const [loadingMemos, setLoadingMemos] = useState(true);
    const [memosError, setMemosError] = useState('');

    const navigate = useNavigate();
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
    const [mySchedule, setMySchedule] = useState<any>(null);
    const [loadingSchedule, setLoadingSchedule] = useState(false);


    // --- 원본 헬퍼 함수 유지 ---
    const handleRefreshVacation = () => setRefreshTrigger(prev => prev + 1);
    const handleShowHistoryPopup = () => setShowHistoryPopup(true);
    const handleCloseHistoryPopup = () => setShowHistoryPopup(false);
// 현재 날짜가 3월 이상인지 판단하는 함수 추가 (useEffect 위쪽에 추가)
    const isAfterFebruary = () => {
        const now = new Date();
        return now.getMonth() >= 2; // 0-based이므로 2 = 3월
    };
    // 캘린더 렌더링 헬퍼 함수
    const renderWorkCalendar = () => {
        if (!mySchedule || !mySchedule.hasSchedule) {
            return <div className="empty-msg">이번 달 근무표가 없습니다.</div>;
        }

        const [year, month] = selectedMonth.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

        const weeks = [];
        let days = [];
        const renderedDays = new Set<number>();
        let dayCounter = 0; // ✅ 주 내 위치 추적 (0~6)

        // 1. 빈 칸 채우기
        for (let i = 0; i < firstDayOfWeek; i++) {
            days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
            dayCounter++;
        }

        // 2. 날짜 채우기
        for (let day = 1; day <= daysInMonth; day++) {
            if (renderedDays.has(day)) {
                continue;
            }

            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();
            const isSunday = dayOfWeek === 0;
            const isSaturday = dayOfWeek === 6;

            let workType = mySchedule.workData[day.toString()] || '';
            let isTextCell = false;
            let displayValue = workType;
            let rangeSpan = 1;

            // 범위 키 검색
            if (!workType) {
                for (const key in mySchedule.workData) {
                    if (key.includes('-')) {
                        const [start, end] = key.split('-').map(Number);
                        if (day >= start && day <= end) {
                            workType = mySchedule.workData[key];
                            isTextCell = workType.startsWith('텍스트:');
                            displayValue = isTextCell ? workType.substring(4) : workType;
                            rangeSpan = end - start + 1;

                            for (let i = start; i <= end; i++) {
                                renderedDays.add(i);
                            }
                            break;
                        }
                    }
                }
            } else {
                isTextCell = workType.startsWith('텍스트:');
                displayValue = isTextCell ? workType.substring(4) : workType;
                renderedDays.add(day);
            }

            if (isTextCell) {
                // ✅ 텍스트 범위 셀
                days.push(
                    <div
                        key={`text-${day}`}
                        className="calendar-day text-range-cell"
                        style={{ gridColumn: `span ${Math.min(rangeSpan, 7 - dayCounter)}` }}
                    >
                        <div className="text-range-dates">
                        <span className={`day-number ${isSunday ? 'sun' : ''} ${isSaturday ? 'sat' : ''}`}>
                            {day}
                        </span>
                            {rangeSpan > 1 && (
                                <>
                                    <span className="range-separator">~</span>
                                    <span className="day-number">
                                    {day + rangeSpan - 1}
                                </span>
                                </>
                            )}
                        </div>
                        <div className="work-type type-text">
                            {displayValue}
                        </div>
                    </div>
                );
                dayCounter += Math.min(rangeSpan, 7 - dayCounter);
            } else {
                // ✅ 일반 셀
                days.push(
                    <div key={day} className="calendar-day">
                        <div className={`day-number ${isSunday ? 'sun' : ''} ${isSaturday ? 'sat' : ''}`}>
                            {day}
                        </div>
                        {workType && (
                            <div className={`work-type ${getWorkTypeClass(workType)}`}>
                                {workType}
                            </div>
                        )}
                    </div>
                );
                dayCounter++;
            }

            // ✅ 주 단위 줄바꿈 (7칸 채워지면)
            if (dayCounter >= 7) {
                weeks.push(<div key={`week-${weeks.length}`} className="calendar-week">{days}</div>);
                days = [];
                dayCounter = 0;
            }
        }

        // 남은 날짜 처리
        if (days.length > 0) {
            while (dayCounter < 7) {
                days.push(<div key={`empty-end-${dayCounter}`} className="calendar-day empty"></div>);
                dayCounter++;
            }
            weeks.push(<div key={`week-${weeks.length}`} className="calendar-week">{days}</div>);
        }

        return (
            <div className="calendar-wrapper">
                <div className="calendar-header">
                    {['일', '월', '화', '수', '목', '금', '토'].map((d, idx) => (
                        <div key={d} className={`day-label ${idx === 0 ? 'sun' : ''} ${idx === 6 ? 'sat' : ''}`}>
                            {d}
                        </div>
                    ))}
                </div>
                <div className="calendar-body">{weeks}</div>
            </div>
        );
    };

    // 근무 타입에 따른 CSS 클래스 반환 헬퍼 함수
    const getWorkTypeClass = (type: string): string => {
        const t = type.toUpperCase();
        if (t === 'N' || t.startsWith('NIGHT') || t.startsWith('N')) return 'type-n';
        if (t === 'D' || t.startsWith('DAY')) return 'type-d';
        if (t === 'E' || t.startsWith('EVEN')) return 'type-e';
        if (t === 'OFF') return 'type-off';
        if (t.includes('연') || t === 'AL' || t === 'ANNUAL') return 'type-vacation';
        if (t.includes('반') || t === 'HD' || t === 'HE') return 'type-half';
        return 'type-etc';
    };

    const mapStatusToSimpleKorean = (status: string): string => {
        switch (status) {
            case 'DRAFT': return '작성중';
            case 'SENT_TO_EMPLOYEE': case 'SUBMITTED':
            case 'PENDING_SUBSTITUTE': case 'PENDING_DEPT_HEAD':
            case 'PENDING_CENTER_DIRECTOR': case 'PENDING_ADMIN_DIRECTOR':
            case 'PENDING_CEO_DIRECTOR': case 'PENDING_HR_STAFF':
                return '진행중';
            case 'SIGNED_BY_EMPLOYEE': case 'COMPLETED': case 'APPROVED':
                return '완료';
            case 'RETURNED_TO_ADMIN': case 'REJECTED': case 'DELETED':
                return '반려/취소';
            default: return '알 수 없음';
        }
    };

    const getPositionByJobLevel = (jobLevel: string | undefined): string => {
        const level = String(jobLevel);
        switch (level) {
            case '0': return '사원';
            case '1': return '부서장';
            case '2': return '센터장';
            case '3': return '원장';
            case '4': return '행정원장';
            case '5': return '대표원장';
            default: return '';
        }
    };

    const getGreeting = () => {
        const hour = currentTime.getHours();
        if (hour < 12) return "좋은 아침입니다";
        if (hour < 18) return "좋은 오후입니다";
        return "좋은 저녁입니다";
    };

    const formatDateRange = (startDate: string, endDate: string) => {
        const start = new Date(startDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
        const end = new Date(endDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
        return `${start} ~ ${end}`;
    };

    // --- API 호출 로직 (원본 경로 및 조건 유지) ---
    useEffect(() => {
        const fetchDepartmentNames = async () => {
            try {
                const response = await axiosInstance.get('/departments/names');
                setDepartmentNames(response.data);
            } catch (error) { console.error('부서 이름 조회 실패:', error); }
        };
        fetchDepartmentNames();
    }, []);

    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                setLoadingUser(true);
                const response = await fetch(`/api/v1/user/me`, { credentials: 'include' });
                if (response.status === 401) { setLoadingUser(false); return; }
                const data: UserProfile = await response.json();
                setUserProfile(data);

                const isPhoneMissing = !data.phone || data.phone.trim() === '';
                const isAddressMissing = !data.address || data.address.trim() === '';
                if (data.passwordChangeRequired || isPhoneMissing || isAddressMissing) {
                    setShowProfilePopup(true);
                }
            } catch (err: any) { setFetchError(err.message || '정보 로딩 중 오류 발생'); }
            finally { setLoadingUser(false); }
        };
        fetchUserProfile();
    }, []);

    useEffect(() => {
        const fetchMemos = async () => {
            try {
                // getMyMemos는 본인의 메모만 가져오는 API 함수라고 가정
                const data = await getMyMemos();
                // 최신순 정렬
                const sortedData = data.sort((a: ContractMemo, b: ContractMemo) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
                setMemos(sortedData.slice(0, 3));
            } catch (error) {
                console.error('메모 로딩 실패:', error);
                setMemosError('안내사항을 불러올 수 없습니다.');
            } finally {
                setLoadingMemos(false);
            }
        };
        fetchMemos();
        const fetchVacationData = async () => {
            if (!userProfile) return;
            try {
                setLoadingVacation(true);
                const timestamp = new Date().getTime();
                const statusRes = await fetch(`/api/v1/vacation/my-status`, {
                    headers: { 'Cache-Control': 'no-cache' },
                    credentials: 'include'
                });
                if (statusRes.ok) setVacationStatus(await statusRes.json());

                const historyRes = await fetch(`/api/v1/vacation/my-history?_t=${timestamp}`, {
                    headers: { 'Cache-Control': 'no-cache' },
                    credentials: 'include'
                });
                if (historyRes.ok) setVacationHistory(await historyRes.json());
            } catch (err) { setVacationError('휴가 정보를 불러오는데 실패했습니다.'); }
            finally { setLoadingVacation(false); }
        };
        fetchVacationData();
    }, [userProfile, refreshTrigger]);

    // 근무현황 조회 useEffect
    useEffect(() => {
        const fetchMySchedule = async () => {
            if (!userProfile) return;

            try {
                setLoadingSchedule(true);
                const response = await axiosInstance.get(`/work-schedules/my-schedule/${selectedMonth}`);
                setMySchedule(response.data);
            } catch (error) {
                console.error('근무현황 조회 실패:', error);
                setMySchedule({ hasSchedule: false, workData: {} });
            } finally {
                setLoadingSchedule(false);
            }
        };

        fetchMySchedule();
    }, [selectedMonth, userProfile]);

    useEffect(() => {
        const fetchRecentActivities = async () => {
            if (!userProfile) return;
            try {
                setLoadingActivities(true);
                const [vacRes, conRes, workRes] = await Promise.all([
                    fetch(`/api/v1/vacation/my-history`, { credentials: 'include' }),
                    fetch(`/api/v1/employment-contract/my-status`, { credentials: 'include' }),
                    fetch(`/api/v1/work-schedules/my-status`, { credentials: 'include' })
                ]);

                const vacData: VacationHistory[] = vacRes.ok ? await vacRes.json() : [];
                const conData: ContractStatus[] = conRes.ok ? await conRes.json() : [];
                const workData: WorkScheduleStatus[] = workRes.ok ? await workRes.json() : [];

                const combined = [
                    ...vacData.map(v => ({ type: 'vacation', id: v.id, title: '휴가원', date: v.createdDate, status: mapStatusToSimpleKorean(v.status) })),
                    ...conData.map(c => ({ type: 'contract', id: c.id, title: '근로계약서', date: c.updatedAt, status: mapStatusToSimpleKorean(c.status) })),
                    ...workData.map(w => ({ type: 'workSchedule', id: w.id, title: '근무현황표', date: w.updatedAt, status: mapStatusToSimpleKorean(w.status) }))
                ] as RecentActivity[];

                setRecentActivities(combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3));
            } catch { setActivitiesError('최근 활동을 불러오는데 실패했습니다.'); }
            finally { setLoadingActivities(false); }
        };
        fetchRecentActivities();
    }, [userProfile]);

    // 포커스 자동 갱신
    useEffect(() => {
        const handleFocus = () => setRefreshTrigger(prev => prev + 1);
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    const handleProfileUpdateSuccess = (updatedUser: UserProfile) => {
        setUserProfile(updatedUser);
        setShowProfilePopup(false);
        alert('프로필 정보가 성공적으로 업데이트되었습니다.');
    };

    const handleClosePopup = () => {
        if (userProfile?.passwordChangeRequired || !userProfile?.phone || !userProfile?.address) return;
        setShowProfilePopup(false);
    };

    // 연차 계산기
    const total = vacationStatus?.totalVacationDays || 15;
    const used = vacationStatus?.usedVacationDays || 0;

    const usagePercent = total > 0 ? (used / total) * 100 : 0;

    if (loadingUser) {
        return (
            <Layout>
                <div className="mp-loading-container">
                    <div className="loading">로딩중...</div>
                </div>
            </Layout>
        );
    }
    return (
        <Layout>
            <div id="mp-page-wrapper">
                <div className="mp-container">
                    {/* 환영 헤더 */}
                    <header className="mp-dashboard-header">
                        <div className="mp-welcome-text">
                            <h1 className="mp-welcome-title">{getGreeting()}, {userProfile?.userName || '사용자'}님!</h1>
                            <p className="mp-welcome-subtitle">선한병원 스마트 전자결재 시스템 메인 대시보드입니다.</p>
                        </div>
                    </header>

                    <div className="mp-content-grid">
                        <div className="mp-left-column">
                            {/* 인사 정보 카드 */}
                            <section className="mp-card mp-user-info-card">
                                <h2 className="mp-card-title"><User size={20} className="icon-blue"/> 내 인사 정보</h2>
                                <div className="mp-info-grid">
                                    <div className="mp-info-item">
                                        <div className="info-icon-circle"><User size={18}/></div>
                                        <div className="info-content">
                                            <span className="label">성명 / 사번</span>
                                            <span
                                                className="value">{userProfile?.userName} ({userProfile?.userId})</span>
                                        </div>
                                    </div>
                                    <div className="mp-info-item">
                                        <div className="info-icon-circle"><Home size={18}/></div>
                                        <div className="info-content">
                                            <span className="label">부서 / 직급</span>
                                            <span className="value">
                                                {(userProfile?.deptCode ? (departmentNames[userProfile.deptCode] ?? userProfile.deptCode) : '미등록')}
                                                {userProfile?.jobLevel ? ` / ${getPositionByJobLevel(userProfile.jobLevel)}` : ''}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={`mp-info-item ${!userProfile?.phone ? 'missing' : ''}`}>
                                        <div className="info-icon-circle"><Smartphone size={18}/></div>
                                        <div className="info-content">
                                            <span className="label">연락처</span>
                                            <span className="value">{userProfile?.phone || '미등록'}</span>
                                        </div>
                                        {!userProfile?.phone && <span className="error-dot">!</span>}
                                    </div>
                                </div>
                            </section>

                            {/* 알림 섹션 (필요시에만 노출) */}
                            {(userProfile?.passwordChangeRequired || !userProfile?.phone || !userProfile?.address) && (
                                <section className="mp-alert-card">
                                    <div className="mp-alert-icon"><AlertTriangle size={24}/></div>
                                    <div className="mp-alert-body">
                                        <h3 className="mp-alert-title">필수 정보 업데이트 필요</h3>
                                        <p className="mp-alert-msg">누락된 개인정보 등록 또는 비밀번호 변경이 필요합니다.</p>
                                        <button className="mp-alert-btn"
                                                onClick={() => setShowProfilePopup(true)}>수정하기
                                        </button>
                                    </div>
                                </section>
                            )}

                            {/* --- 관리자 작성 메모(공지사항) 표시 카드 --- */}
                            <section className="mp-card">
                                <h2 className="mp-card-title">
                                    <Megaphone size={20} className="icon-blue"/> 인사/계약 주요 안내
                                </h2>

                                {loadingMemos ? (
                                    <div className="inner-loader">안내사항 로딩 중...</div>
                                ) : memosError ? (
                                    <div className="empty-msg">{memosError}</div>
                                ) : memos.length > 0 ? (
                                    <div className="mp-memo-card-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto' }}>
                                        {memos.map(memo => (
                                            <div key={memo.id} className="mp-memo-item-box" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: '4px solid #0ea5e9', borderRadius: '8px', padding: '16px' }}>
                                                <div className="mp-memo-header-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#0ea5e9', background: '#e0f2fe', padding: '2px 8px', borderRadius: '10px' }}>
                                                    From 인사팀
                                                </span>
                                                                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                                    {new Date(memo.createdAt).toLocaleDateString('ko-KR')}
                                                </span>
                                                </div>
                                                <div style={{ fontSize: '14px', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                                    {memo.memoText}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="empty-msg" style={{ padding: '30px 0', textAlign: 'center', color: '#94a3b8' }}>
                                        <CheckCircle2 size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                                        <p>등록된 안내사항이 없습니다.</p>
                                    </div>
                                )}
                            </section>

                            {/* 연차 관리 카드 */}
                            <section className="mp-card mp-vacation-card">
                                <div className="mp-vacation-header">
                                    <h2 className="mp-card-title"><Calendar size={20} className="icon-green"/> 연차 현황
                                    </h2>
                                    <button
                                        className={`mp-refresh-btn ${loadingVacation ? 'spinning' : ''}`}
                                        onClick={handleRefreshVacation}
                                        disabled={loadingVacation}
                                    >
                                        <RefreshCw size={18}/>
                                    </button>
                                </div>

                                {loadingVacation ? (
                                    <div className="inner-loader">로딩 중...</div>
                                ) : (
                                    <>
                                        {/* 첫 번째 줄: 정상 연차 */}
                                        <div className="mp-stats-row">
                                            <div className="mp-stat-box">
                                                <span className="mp-stat-label">정상 개수</span>
                                                <span className="mp-stat-value">{vacationStatus?.annualRegularDays || 0}</span>
                                            </div>
                                            <div className="mp-stat-box highlight">
                                                <span className="mp-stat-label">정상 사용</span>
                                                <span className="mp-stat-value">{vacationStatus?.usedRegularDays || 0}</span>
                                            </div>
                                            <div className="mp-stat-box">
                                                <span className="mp-stat-label">정상 미사용</span>
                                                <span className="mp-stat-value text-blue">
            {(vacationStatus?.annualRegularDays || 0) - (vacationStatus?.usedRegularDays || 0)}
        </span>
                                            </div>
                                        </div>

                                        {/* 두 번째 줄: 이월 연차 (3월 이전에만 표시) */}
                                        {!isAfterFebruary() && (
                                            <div className="mp-stats-row">
                                                <div className="mp-stat-box">
                                                    <span className="mp-stat-label">이월 개수</span>
                                                    <span className="mp-stat-value">{vacationStatus?.annualCarryoverDays || 0}</span>
                                                </div>
                                                <div className="mp-stat-box highlight">
                                                    <span className="mp-stat-label">이월 사용</span>
                                                    <span className="mp-stat-value">{vacationStatus?.usedCarryoverDays || 0}</span>
                                                </div>
                                                <div className="mp-stat-box">
                                                    <span className="mp-stat-label">이월 미사용</span>
                                                    <span className="mp-stat-value text-blue">
                {(vacationStatus?.annualCarryoverDays || 0) - (vacationStatus?.usedCarryoverDays || 0)}
            </span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="mp-progress-section">
                                            <div className="progress-labels">
                                                <span>연차 사용률</span>
                                                <span className="fw-bold">{Math.round(usagePercent)}%</span>
                                            </div>
                                            <div className="progress-bar-bg">
                                                <div className="progress-bar-fill"
                                                     style={{width: `${Math.min(usagePercent, 100)}%`}}></div>
                                            </div>
                                        </div>

                                        <div className="mp-recent-history">
                                            <div className="history-header">
                                                <span className="history-title">최근 사용 내역</span>
                                                <button onClick={handleShowHistoryPopup}>전체보기</button>
                                            </div>
                                            <div className="history-list">
                                                {vacationHistory.length > 0 ? (
                                                    vacationHistory.slice(0, 3).map((v, i) => (
                                                        <div key={i} className="history-item">
                                                            <span
                                                                className="h-date">{formatDateRange(v.startDate, v.endDate)}</span>
                                                            <span className="h-days">{v.days}일</span>
                                                            <span
                                                                className={`h-status ${v.status}`}>{mapStatusToSimpleKorean(v.status)}</span>
                                                        </div>
                                                    ))
                                                ) : <div className="empty-msg">기록이 없습니다.</div>}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </section>
                        </div>

                        <div className="mp-right-column">
                            {/* 퀵 액션 */}
                            <section className="mp-card">
                                <h2 className="mp-card-title"><ClipboardList size={20}/> 퀵 액션</h2>
                                <div className="mp-action-grid">
                                    <button className="mp-action-btn" onClick={() => setShowProfilePopup(true)}>
                                        <Settings size={22}/>
                                        <span>정보 수정</span>
                                    </button>
                                    <button className="mp-action-btn" onClick={() => setIsReportsModalOpen(true)}>
                                        <FileText size={22}/>
                                        <span>문서 관리</span>
                                    </button>
                                    <button className="mp-action-btn" onClick={handleShowHistoryPopup}>
                                        <Clock size={22}/>
                                        <span>휴가 기록</span>
                                    </button>
                                    <button className="mp-action-btn primary"
                                            onClick={() =>  navigate('/detail/leave-application')}>
                                        <Calendar size={22}/>
                                        <span>휴가 신청</span>
                                    </button>
                                </div>
                            </section>

                            <section className="mp-card">
                                <div className="mp-schedule-header">
                                    <h2 className="mp-card-title">
                                        <Calendar size={20} className="icon-blue"/> 내 근무현황
                                    </h2>
                                    <input
                                        type="month"
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="month-selector"
                                    />
                                </div>

                                {loadingSchedule ? (
                                    <div className="inner-loader">로딩 중...</div>
                                ) : (
                                    <>
                                        {mySchedule?.hasSchedule && (
                                            <div className="schedule-stats">
                                                <span>

                                                    {mySchedule.dutyDisplayName || '나이트'}: {mySchedule.nightDutyActual}회
                                                </span>
                                                <span style={{margin: '0 8px', color: '#e2e8f0'}}>|</span>
                                                <span>OFF: {mySchedule.offCount || 0}일</span>
                                                <span style={{margin: '0 8px', color: '#e2e8f0'}}>|</span>
                                                <span>휴가: {mySchedule.vacationUsedThisMonth || 0}일</span>
                                            </div>
                                        )}
                                        <div className="work-calendar">
                                            {renderWorkCalendar()}
                                        </div>
                                    </>
                                )}
                            </section>

                            {/* 최근 활동 */}
                            <section className="mp-card">
                                <h2 className="mp-card-title"><Bell size={20} className="icon-orange"/> 최근 활동</h2>
                                <div className="mp-activity-list">
                                    <div className="activity-item login">
                                        <div className="activity-dot"></div>
                                        <div className="activity-info">
                                            <span className="act-title">로그인</span>
                                            <span className="act-time">오늘</span>
                                        </div>
                                    </div>
                                    {loadingActivities ? <div className="inner-loader">활동 로딩 중...</div> :
                                        recentActivities.length > 0 ? recentActivities.map(act => (
                                            <div key={act.id} className={`activity-item ${act.type}`}>
                                                <div className="activity-dot"></div>
                                                <div className="activity-info">
                                                    <span className="act-title">{act.title}</span>
                                                    <span className="act-desc">상태: {act.status}</span>
                                                    <span
                                                        className="act-time">{new Date(act.date).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        )) : <div className="empty-msg">최근 활동이 없습니다.</div>}
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>

            {/* 팝업들 - Props 구조 원본 유지 */}
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

            <VacationHistoryPopup
                isOpen={showHistoryPopup}
                onClose={handleCloseHistoryPopup}
                vacationHistory={vacationHistory}
            />

            <ReportsModal
                isOpen={isReportsModalOpen}
                onClose={() => setIsReportsModalOpen(false)}
            />
        </Layout>
    );
};

export default MainPage;