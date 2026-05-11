import React, {useState, useEffect, useMemo, useRef} from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../Layout';
import {
    fetchMyWorkSchedules,
    createWorkSchedule,
    WorkSchedule,
    fetchWorkScheduleDetail,
    fetchRejectedWorkSchedules
} from '../../apis/workSchedule';
import './style.css';
import OrgChartModal from "../OrgChartModal";
import axiosInstance from "../../views/Authentication/axiosInstance";

const WorkScheduleBoard: React.FC = () => {
    const navigate = useNavigate();
    const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedYearMonth, setSelectedYearMonth] = useState('');
    const [canCreate, setCanCreate] = useState(false);
    const [hasApprovalPermission, setHasApprovalPermission] = useState(false); // ✅ 결재 권한 (pending 탭 표시용)
    const [tab, setTab] = useState<'my-drafts' | 'pending' | 'all-in-progress' | 'completed' | 'rejected'>('my-drafts');
    const [canManage, setCanManage] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const itemsPerPage = 10;
    const [viewRejectReasonModalOpen, setViewRejectReasonModalOpen] = useState(false);
    const [departmentNames, setDepartmentNames] = useState<Record<string, string>>({});
    //const [createMode, setCreateMode] = useState<'default' | 'custom'>('default');
    const [selectedMembers, setSelectedMembers] = useState<{id: string; name: string;}[]>([]);
    const [showOrgModal, setShowOrgModal] = useState(false);
    const removeSelectedMember = (userId: string) => {
        setSelectedMembers(prev => prev.filter(u => u.id !== userId));
    };
    const [pendingCount, setPendingCount] = useState(0);
// 추가: 초기화 완료 플래그와 사용자 클릭 플래그
    const initializedRef = useRef(false);            // 초기화 루틴이 끝났는지
    const userClickedTabRef = useRef(false);         // 사용자가 탭을 직접 클릭했는지
    const [deptNamesLoaded, setDeptNamesLoaded] = useState(false);

    const fetchDepartmentNames = async () => {
        if (deptNamesLoaded) return;
        try {
            const response = await axiosInstance.get('/departments/names');
            setDepartmentNames(response.data);
        } catch (error) {
            console.error('부서 이름 조회 실패:', error);
        }
    };

    useEffect(() => {
        const initializeTab = async () => {
            try {
                const hasCreate = await checkPermissions();      // boolean 반환
                await checkPendingApprovals();
                await fetchDepartmentNames();
                // 사용자가 탭을 이미 클릭했다면 초기화가 탭을 덮어쓰지 않음
                if (!userClickedTabRef.current) {
                    if (!hasCreate) {
                        setTab('completed');
                    } else {
                        setTab('my-drafts');
                    }
                }
            } catch (e) {
                console.error('초기화 중 오류:', e);
                // 안전하게 기본 탭 설정
                if (!userClickedTabRef.current) setTab('completed');
            } finally {
                setIsInitializing(false);    // 초기화 끝
                initializedRef.current = true;
            }
        };

        initializeTab();

    }, []);


    useEffect(() => {
        // tab이 아직 결정되지 않았으면 로딩/무시
        if (tab === null) return;

        checkPendingApprovals();
        loadSchedules();
    }, [tab, currentPage, canCreate]);

    const checkPermissions = async (): Promise<boolean> => {
        try {
            const permRes = await fetch('/api/v1/user/me/permissions', { credentials: 'include' });
            const permData = await permRes.json();
            const isAdmin = permData.role === 'ADMIN';
            const hasCreatePermission = isAdmin && (permData.permissions?.includes('WORK_SCHEDULE_CREATE') ?? false);
            const hasManagePermission = permData.permissions?.includes('WORK_SCHEDULE_MANAGE') ?? false;
            setCanCreate(hasCreatePermission);
            setCanManage(hasManagePermission);
            return hasCreatePermission;
        } catch (err) {
            console.error('권한 확인 실패:', err);
            setCanCreate(false);
            setCanManage(false);
            return false;
        }
    };


    const checkPendingApprovals = async () => {
        try {
            const response = await axiosInstance.get('/work-schedules/pending-approvals');
            setPendingCount(response.data.length);
            setHasApprovalPermission(response.data.length > 0);
        } catch (err) {
            console.error('결재 대기 확인 실패:', err);
            setPendingCount(0);
            setHasApprovalPermission(false);
        }
    };

    const loadSchedules = async () => {
        try {
            setLoading(true);

            if (tab === 'my-drafts') {
                // ✅ 생성 권한 없으면 접근 불가
                if (!canCreate) {
                    setSchedules([]);
                    setLoading(false);
                    return;
                }

                // 내 작성 문서: DRAFT, SUBMITTED, REJECTED 상태만
                const response = await axiosInstance.get('/work-schedules/my-documents');
                setSchedules(response.data);

            } else if (tab === 'completed') {
                // 완료 문서: APPROVED 상태 (모두 조회 가능)
                const data = await fetchMyWorkSchedules();
                const completedData = data.filter((schedule: WorkSchedule) =>
                    schedule.approvalStatus === 'APPROVED'
                );
                setSchedules(completedData);
            } else if (tab === 'pending') {
                const response = await axiosInstance.get('/work-schedules/pending-approvals');
                setSchedules(response.data);
                setPendingCount(response.data.length);
            } else if (tab === 'all-in-progress') {
                const response = await axiosInstance.get('/work-schedules/pending');
                setSchedules(response.data);
            } else if (tab === 'rejected') {
                const data = await fetchRejectedWorkSchedules();
                setSchedules(data);
                return;
            }

        } catch (err: any) {
            setError(err.response?.data?.error || '근무표 목록을 불러올 수 없습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 검색 필터링
    const filteredSchedules = useMemo(() => {
        if (!searchTerm.trim()) return schedules;

        const lowerSearch = searchTerm.toLowerCase();

        return schedules.filter(schedule => {
            // 년월 검색
            const matchesYearMonth = schedule.scheduleYearMonth.includes(searchTerm);

            const deptName = departmentNames[schedule.deptCode] || schedule.deptCode;
            const matchesDeptName = deptName.toLowerCase().includes(lowerSearch);

            // 작성자명 검색
            const creatorName = schedule.creatorName || schedule.createdBy;
            const matchesCreator = creatorName.toLowerCase().includes(lowerSearch);

            return matchesYearMonth || matchesDeptName || matchesCreator;
        });
    }, [schedules, searchTerm, departmentNames]);

    // 페이지네이션
    const totalPages = Math.ceil(filteredSchedules.length / itemsPerPage);
    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageSchedules = filteredSchedules.slice(startIdx, startIdx + itemsPerPage);

    const handleCreate = async () => {
        if (!selectedYearMonth) {
            alert('년월을 선택해주세요.');
            return;
        }

        try {
            const [deptCode] = await getCurrentUserDept();
            const newSchedule = await createWorkSchedule(deptCode, selectedYearMonth);
            alert('근무표가 생성되었습니다.');
            navigate(`/detail/work-schedule/edit/${newSchedule.id}`);
        } catch (err: any) {
            alert(err.response?.data?.error || '근무표 생성 실패');
        }
    };

    const getCurrentUserDept = async (): Promise<[string]> => {
        const response = await fetch('/api/v1/user/me', { credentials: 'include' });
        const userData = await response.json();
        return [userData.deptCode];
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'DRAFT': return '임시저장';
            case 'SUBMITTED': return '제출됨';
            case 'REVIEWED': return '검토 완료';
            case 'APPROVED': return '승인 완료';
            case 'REJECTED': return '반려됨';
            default: return status;
        }
    };

    const getStatusClass = (status: string) => {
        switch (status) {
            case 'DRAFT': return 'wsb-status-draft';
            case 'SUBMITTED': return 'wsb-status-submitted';
            case 'REVIEWED': return 'wsb-status-reviewed';
            case 'APPROVED': return 'wsb-status-approved';
            case 'REJECTED': return 'wsb-status-rejected';
            default: return '';
        }
    };

    if (isInitializing || loading) {
        return (
            <Layout>
                <div className="wsb-loading">
                    <div className="loading">로딩중...</div>
                </div>
            </Layout>
        );
    }
    if (error) return <Layout><div className="wsb-error">{error}</div></Layout>;

    return (
        <Layout>
            <div className="work-schedule-board">
                <div className="wsb-board-header">
                    <h1>근무현황표 관리</h1>
                    {canCreate && (  // 권한이 있을 때만 표시
                        <button className="wsb-create-button" onClick={() => setShowCreateModal(true)}>
                            + 새 근무표 작성
                        </button>
                    )}
                </div>

                {/* 탭 추가 */}
                <div className="tabs">
                    {/* ✅ 생성 권한 있을 때만 표시 */}
                    {canCreate && (
                        <button
                            onClick={() => {
                                userClickedTabRef.current = true;
                                setTab('my-drafts');
                                setCurrentPage(1);
                            }}
                            className={tab === 'my-drafts' ? 'active' : ''}
                        >
                            내 작성 문서
                        </button>
                    )}

                    {/* ✅ 수정: 조건 단순화 */}
                    {hasApprovalPermission && (
                        <button
                            onClick={() => {
                                userClickedTabRef.current = true;
                                setTab('pending');
                                setCurrentPage(1);
                            }}
                            className={tab === 'pending' ? 'active' : ''}
                        >
                            결재 대기
                            {pendingCount > 0 && (
                                <span className="badge">{pendingCount}</span>
                            )}
                        </button>
                    )}

                    {canManage && (
                        <button
                            onClick={() => {
                                userClickedTabRef.current = true;
                                setTab('all-in-progress');
                                setCurrentPage(1);
                            }}
                            className={tab === 'all-in-progress' ? 'active' : ''}
                        >
                            전체 진행중
                        </button>
                    )}

                    <button
                        onClick={() => setTab('rejected')}
                        className={tab === 'rejected' ? 'active' : ''}
                    >
                        반려된 근무현황표
                    </button>

                    <button
                        onClick={() => {
                            userClickedTabRef.current = true;
                            setTab('completed');
                            setCurrentPage(1);
                        }}
                        className={tab === 'completed' ? 'active' : ''}
                    >
                        완료됨
                    </button>

                    {/* 검색 */}
                    <span className="inline-search-section">
                        <input
                            type="text"
                            placeholder="년월, 부서명, 작성자로 검색..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1); // ✅ 검색 시 첫 페이지로
                            }}
                            className="inline-search-input"
                        />
                                            {searchTerm && (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            setSearchTerm('');
                                                            setCurrentPage(1);
                                                        }}
                                                        className="inline-search-reset"
                                                        title="검색 초기화"
                                                    >
                                                        ×
                                                    </button>
                                                    <span className="inline-search-count">
                                    {filteredSchedules.length}건
                                </span>
                                                </>
                                            )}
                    </span>
                </div>

                {/* 테이블 */}
                <div className="wsb-schedule-list">
                    {pageSchedules.length === 0 ? (
                        <div className="wsb-empty-state">
                            {searchTerm ? (
                                <>
                                    <p>'{searchTerm}'에 대한 검색 결과가 없습니다.</p>
                                    <button
                                        onClick={() => {
                                            setSearchTerm('');
                                            setCurrentPage(1);
                                        }}
                                        className="wsb-btn-secondary"
                                    >
                                        검색 초기화
                                    </button>
                                </>
                            ) : (
                                <p>등록된 근무표가 없습니다.</p>
                            )}
                        </div>
                    ) : (
                        <table className="wsb-schedule-table">
                            <thead>
                            <tr>
                                <th>년월</th>
                                <th>부서</th>
                                <th>작성자</th>
                                <th>상태</th>
                                <th>작성일</th>
                                <th>수정일</th>
                            </tr>
                            </thead>
                            <tbody>
                            {pageSchedules.map(schedule => (
                                <tr
                                    key={schedule.id}
                                    onClick={() => navigate(`/detail/work-schedule/view/${schedule.id}`)}
                                    className="wsb-schedule-row"
                                >
                                    <td>{schedule.scheduleYearMonth}</td>
                                    <td>
                                        {departmentNames[schedule.deptCode] || schedule.deptCode}
                                    </td>
                                    <td>{schedule.creatorName || schedule.createdBy}</td>
                                    <td>
                                        <span
                                            className={`wsb-schedule-status ${getStatusClass(schedule.approvalStatus)}`}>
                                            {getStatusText(schedule.approvalStatus)}
                                        </span>
                                    </td>
                                    <td>{new Date(schedule.createdAt).toLocaleDateString()}</td>
                                    <td>{new Date(schedule.updatedAt).toLocaleDateString()}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}

                    {/* 페이지네이션 */}
                    {totalPages > 1 && (
                        <div className="pagination">
                            {Array.from({length: totalPages}, (_, i) => i + 1).map(num => (
                                <button
                                    key={num}
                                    onClick={() => setCurrentPage(num)}
                                    className={num === currentPage ? 'active' : ''}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* 생성 모달 */}
                {showCreateModal && (
                    <div className="wsb-modal-overlay">
                        <div className="wsb-modal-content">
                            <h2>새 근무표 생성</h2>

                            {/* 년월 선택만 */}
                            <input
                                type="month"
                                value={selectedYearMonth}
                                onChange={(e) => setSelectedYearMonth(e.target.value)}
                            />

                            <div className="wsb-modal-actions">
                                <button
                                    onClick={() => {
                                        setShowCreateModal(false);
                                        setSelectedYearMonth('');
                                    }}
                                    className="wsb-btn-cancel"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleCreate}
                                    className="wsb-btn-confirm"
                                >
                                    생성
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 조직도 모달 */}
                {showOrgModal && (
                    <OrgChartModal
                        isOpen={showOrgModal}
                        onClose={() => setShowOrgModal(false)}
                        onSelect={(users) => {
                            setSelectedMembers(prev => {
                                const combined = [...prev, ...users];
                                const uniqueById: Record<string, {id:string;name:string}> = {};
                                combined.forEach(u => { uniqueById[u.id] = u; }); // 마지막 항목이 우선
                                return Object.values(uniqueById);
                            });
                            setShowOrgModal(false);
                        }}
                        multiSelect={true}
                        allDepartments={true}
                    />
                )}
            </div>
        </Layout>
    );
};

export default WorkScheduleBoard;