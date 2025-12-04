import React, {useState, useEffect, useMemo} from 'react';
import { useCookies } from 'react-cookie';
import { useNavigate } from 'react-router-dom';
import Layout from '../Layout';
import { fetchMyWorkSchedules, createWorkSchedule, WorkSchedule } from '../../apis/workSchedule';
import './style.css';
import axios from "axios";

const WorkScheduleBoard: React.FC = () => {
    const [cookies] = useCookies(['accessToken']);
    const navigate = useNavigate();
    const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedYearMonth, setSelectedYearMonth] = useState('');
    const [canCreate, setCanCreate] = useState(false);
    const [hasApprovalPermission, setHasApprovalPermission] = useState(false); // ✅ 결재 권한 (pending 탭 표시용)
    const [tab, setTab] = useState<'list' | 'pending'>('list');
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const itemsPerPage = 10;
    const [viewRejectReasonModalOpen, setViewRejectReasonModalOpen] = useState(false);
    const [departmentNames, setDepartmentNames] = useState<Record<string, string>>({});


    const fetchDepartmentNames = async () => {
        try {
            const response = await axios.get('/api/v1/departments/names', {
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });
            console.log('부서 이름 데이터:', response.data); // 디버깅용
            setDepartmentNames(response.data);
        } catch (error) {
            console.error('부서 이름 조회 실패:', error);
        }
    };

    useEffect(() => {
        checkPermissions();
        loadSchedules();
    }, [tab, currentPage]);

    useEffect(() => {
        fetchDepartmentNames();
    }, []); // 최초 1회만 실행

    const checkPermissions = async () => {
        try {
            const permRes = await fetch('/api/v1/user/me/permissions', {
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });
            const permData = await permRes.json();

            // ✅ WORK_SCHEDULE_MANAGE 권한 확인
            const hasWorkSchedulePermission = permData.permissions?.includes('WORK_SCHEDULE_MANAGE');
            const isDeptHeadOrAbove = permData.isAdmin && parseInt(permData.jobLevel) >= 1;

            setCanCreate(hasWorkSchedulePermission || isDeptHeadOrAbove);
        } catch (err) {
            console.error('권한 확인 실패:', err);
        }
    };

    const loadSchedules = async () => {
        try {
            setLoading(true);

            if (tab === 'list') {
                // 전체 목록 조회
                const data = await fetchMyWorkSchedules(cookies.accessToken);
                const userRes = await fetch('/api/v1/user/me', {
                    headers: { Authorization: `Bearer ${cookies.accessToken}` }
                });
                const userData = await userRes.json();

                const inProgressStatuses = ['SUBMITTED', 'REVIEWED']; // 진행중으로 취급할 상태들 (필요시 조정)
                const completedStatuses = ['APPROVED']; // 완료로 취급할 상태들 (필요시 조정)

                const filteredData = data.filter((schedule: WorkSchedule) => {
                    // 1) DRAFT: 작성자만
                    if (schedule.approvalStatus === 'DRAFT') {
                        return schedule.createdBy === userData.userId;
                    }

                    // 2) 작성자는 항상 모든 진행 상황을 볼 수 있도록 허용
                    if (schedule.createdBy === userData.userId) return true;

                    // helper: approvalSteps에서 현재 단계의 approver id들 추출
                    const currentSteps = (schedule.approvalSteps || []).filter((s:any) => s.isCurrent);
                    // approverId가 배열로 올 수도 있고 단일값일 수도 있음 — 둘 다 처리
                    const currentApproverIds = currentSteps.flatMap((s:any) => {
                        if (!s.approverId) return [];
                        return Array.isArray(s.approverId) ? s.approverId : [s.approverId];
                    });

                    // 3) 진행중 상태일 때: 작성자(위에서 이미 허용) 또는 '현재 단계의 결재자'만 허용
                    if (inProgressStatuses.includes(schedule.approvalStatus)) {
                        return currentApproverIds.includes(userData.userId);
                    }

                    // 4) 완료 상태일 때: 같은 부서원 모두 볼 수 있게 허용
                    if (completedStatuses.includes(schedule.approvalStatus)) {
                        return schedule.deptCode === userData.deptCode
                            || currentApproverIds.includes(userData.userId); // 또는 결재자도 허용
                    }

                    // 5) 그 외 상태 (REJECTED 등): 기본적으로 작성자 + 현재 결재자만 보이게 함
                    return currentApproverIds.includes(userData.userId);
                });

                filteredData.sort((a, b) =>
                    b.scheduleYearMonth.localeCompare(a.scheduleYearMonth)
                );
                setSchedules(filteredData);

            } else if (tab === 'pending') {
                // 결재 대기 목록 조회
                const response = await axios.get(
                    '/api/v1/work-schedules/pending-approvals',
                    { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
                );
                setSchedules(response.data);
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

        return schedules.filter(schedule =>
            schedule.scheduleYearMonth.includes(searchTerm) ||
            schedule.deptCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            schedule.createdBy.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [schedules, searchTerm]);

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
            const newSchedule = await createWorkSchedule(deptCode, selectedYearMonth, cookies.accessToken);
            alert('근무표가 생성되었습니다.');
            navigate(`/detail/work-schedule/edit/${newSchedule.id}`);
        } catch (err: any) {
            alert(err.response?.data?.error || '근무표 생성 실패');
        }
    };

    const getCurrentUserDept = async (): Promise<[string]> => {
        const response = await fetch('/api/v1/user/me', {
            headers: { Authorization: `Bearer ${cookies.accessToken}` }
        });
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

    if (loading) return <Layout><div className="wsb-loading">로딩 중...</div></Layout>;
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
                    <button
                        onClick={() => { setTab('list'); setCurrentPage(1); }}
                        className={tab === 'list' ? 'active' : ''}
                    >
                        목록
                    </button>
                    <button
                        onClick={() => { setTab('pending'); setCurrentPage(1); }}
                        className={tab === 'pending' ? 'active' : ''}
                    >
                        결재 대기
                    </button>

                    {/* 검색 */}
                    <span className="inline-search-section">
                        <input
                            type="text"
                            placeholder="검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="inline-search-input"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="inline-search-reset"
                            >
                                ×
                            </button>
                        )}
                    </span>
                </div>

                {/* 테이블 */}
                <div className="wsb-schedule-list">
                    {pageSchedules.length === 0 ? (
                        <div className="wsb-empty-state">
                            <p>등록된 근무표가 없습니다.</p>
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
                                    <td>{departmentNames[schedule.deptCode] || schedule.deptCode}</td>
                                    <td>{schedule.createdBy}</td>
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
                    <div className="wsb-modal-overlay" onClick={() => setShowCreateModal(false)}>
                        <div className="wsb-modal-content" onClick={(e) => e.stopPropagation()}>
                            <h2>새 근무표 생성</h2>
                            <div className="wsb-form-group">
                                <label>년월 선택</label>
                                <input
                                    type="month"
                                    value={selectedYearMonth}
                                    onChange={(e) => setSelectedYearMonth(e.target.value)}
                                    className="wsb-form-input"
                                />
                            </div>
                            <div className="wsb-modal-actions">
                                <button onClick={() => setShowCreateModal(false)} className="wsb-btn-cancel">
                                    취소
                                </button>
                                <button onClick={handleCreate} className="wsb-btn-confirm">
                                    생성
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default WorkScheduleBoard;