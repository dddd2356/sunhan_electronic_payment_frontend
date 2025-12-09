import React, {useState, useEffect, useMemo} from 'react';
import { useCookies } from 'react-cookie';
import { useNavigate } from 'react-router-dom';
import Layout from '../Layout';
import { fetchMyWorkSchedules, createWorkSchedule, WorkSchedule } from '../../apis/workSchedule';
import './style.css';
import axios from "axios";
import OrgChartModal from "../OrgChartModal";

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
    const [createMode, setCreateMode] = useState<'default' | 'custom'>('default');
    const [customDeptName, setCustomDeptName] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<{id: string; name: string;}[]>([]);
    const [showOrgModal, setShowOrgModal] = useState(false);
    const [templates, setTemplates] = useState<any[]>([]);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const removeSelectedMember = (userId: string) => {
        setSelectedMembers(prev => prev.filter(u => u.id !== userId));
    };

// 템플릿 로드
    const loadTemplates = async () => {
        try {
            const response = await axios.get('/api/v1/work-schedules/templates', {
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });
            setTemplates(response.data);
        } catch (err) {
            console.error('템플릿 조회 실패:', err);
        }
    };

// 템플릿에서 불러오기
    const handleLoadFromTemplate = async (templateId: number) => {
        try {
            const template = templates.find(t => t.id === templateId);
            if (!template) return;

            const memberIds = JSON.parse(template.memberIdsJson);
            // 이름 fetch ( /api/v1/user/{id} 사용, UserController에 있음)
            const membersWithNames = await Promise.all(
                memberIds.map(async (id: string) => {
                    const res = await axios.get(`/api/v1/user/${id}`, { headers: { Authorization: `Bearer ${cookies.accessToken}` } });
                    return { id, name: res.data.userName || 'Unknown' };
                })
            );
            setSelectedMembers(membersWithNames); // ✅ selectedMembers를 {id, name}[]로 변경 (아래 참조)
            setCustomDeptName(template.customDeptName);
            setShowTemplateModal(false);
        } catch (err) {
            console.error('템플릿 불러오기 실패:', err);
        }
    };

// 템플릿 저장
    const handleSaveTemplate = async () => {
        if (!newTemplateName.trim()) {
            alert('템플릿 이름을 입력해주세요.');
            return;
        }

        if (selectedMembers.length === 0) {
            alert('인원을 선택해주세요.');
            return;
        }

        try {
            await axios.post('/api/v1/work-schedules/templates', {
                templateName: newTemplateName,
                customDeptName: customDeptName,
                memberUserIds: selectedMembers.map(u => u.id)   // 변경
            }, {
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });

            alert('템플릿이 저장되었습니다.');
            setNewTemplateName('');
            await loadTemplates();
        } catch (err: any) {
            alert(err.response?.data?.error || '템플릿 저장 실패');
        }
    };

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
            if (createMode === 'default') {
                // 기존 로직
                const [deptCode] = await getCurrentUserDept();
                const newSchedule = await createWorkSchedule(deptCode, selectedYearMonth, cookies.accessToken);
                alert('근무표가 생성되었습니다.');
                navigate(`/detail/work-schedule/edit/${newSchedule.id}`);
            } else {
                // 커스텀 생성
                if (!customDeptName.trim()) {
                    alert('부서명을 입력해주세요.');
                    return;
                }
                if (selectedMembers.length === 0) {
                    alert('인원을 선택해주세요.');
                    return;
                }

                const response = await axios.post('/api/v1/work-schedules/custom', {
                    yearMonth: selectedYearMonth,
                    customDeptName: customDeptName,
                    memberUserIds: selectedMembers.map(u => u.id)   // 변경
                }, {
                    headers: { Authorization: `Bearer ${cookies.accessToken}` }
                });

                alert('커스텀 근무표가 생성되었습니다.');
                navigate(`/detail/work-schedule/edit/${response.data.id}`);
            }
        } catch (err: any) {
            alert(err.response?.data?.error || '근무표 생성 실패');
        }
    };

    // 모달 열 때 템플릿 로드
    useEffect(() => {
        if (showTemplateModal) {
            loadTemplates();
        }
    }, [showTemplateModal]);

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
                                    <td>
                                        {/* ✅ 수정: 커스텀 근무표면 customDeptName 우선 표시 */}
                                        {schedule.isCustom && schedule.customDeptName
                                            ? schedule.customDeptName
                                            : (departmentNames[schedule.deptCode] || schedule.deptCode)}
                                    </td>
                                    <td>{schedule.creatorName || schedule.createdBy}</td>
                                    <td>
                                        <span className={`wsb-schedule-status ${getStatusClass(schedule.approvalStatus)}`}>
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

                            {/* 모드 선택 */}
                            <div className="wsb-radio-group">
                                <label>
                                    <input
                                        type="radio"
                                        checked={createMode === 'default'}
                                        onChange={() => setCreateMode('default')}
                                    />
                                    내 부서 기준
                                </label>
                                <label>
                                    <input
                                        type="radio"
                                        checked={createMode === 'custom'}
                                        onChange={() => setCreateMode('custom')}
                                    />
                                    커스텀
                                </label>
                            </div>

                            {/* 년월 선택 */}
                            <input
                                type="month"
                                value={selectedYearMonth}
                                onChange={(e) => setSelectedYearMonth(e.target.value)}
                            />

                            {/* 커스텀 모드 추가 필드 */}
                            {createMode === 'custom' && (
                                <>
                                    <input
                                        type="text"
                                        placeholder="부서명 입력 (예: 외래 2팀)"
                                        value={customDeptName}
                                        onChange={(e) => setCustomDeptName(e.target.value)}
                                    />

                                    <button onClick={() => setShowTemplateModal(true)}>
                                        템플릿에서 불러오기
                                    </button>

                                    <button onClick={() => setShowOrgModal(true)}>
                                        인원 선택
                                    </button>

                                    <div className="selected-members-list">
                                        {selectedMembers.map(user => (
                                            <div key={user.id}>
                                                {user.name || user.id}
                                                <button onClick={() => removeSelectedMember(user.id)}>
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            <div className="wsb-modal-actions">
                                <button
                                    onClick={() => {
                                        setShowCreateModal(false);
                                        setSelectedYearMonth('');
                                        setCustomDeptName('');
                                        setSelectedMembers([]);
                                        setCreateMode('default');
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

                {showTemplateModal && (
                    <div className="wsb-modal-overlay" onClick={() => setShowTemplateModal(false)}>
                        <div className="wsb-modal-content" onClick={(e) => e.stopPropagation()}>
                            <h2>템플릿 선택</h2>

                            <div className="template-list">
                                {templates.length === 0 ? (
                                    <p>저장된 템플릿이 없습니다.</p>
                                ) : (
                                    templates.map(template => (
                                        <div
                                            key={template.id}
                                            className="template-item"
                                            onClick={() => handleLoadFromTemplate(template.id)}
                                        >
                                            <h4>{template.templateName}</h4>
                                            <p>{template.customDeptName}</p>
                                            <small>
                                                {JSON.parse(template.memberIdsJson).length}명
                                            </small>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="template-save-section">
                                <h3>현재 설정을 템플릿으로 저장</h3>
                                <input
                                    type="text"
                                    placeholder="템플릿 이름"
                                    value={newTemplateName}
                                    onChange={(e) => setNewTemplateName(e.target.value)}
                                />
                                <button onClick={handleSaveTemplate}>저장</button>
                            </div>

                            <button onClick={() => setShowTemplateModal(false)}>닫기</button>
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