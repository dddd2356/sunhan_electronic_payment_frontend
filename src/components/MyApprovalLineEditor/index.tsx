// src/pages/approval/MyApprovalLineEditor.tsx
import React, { useEffect, useState } from 'react';
import { useCookies } from 'react-cookie';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Plus,
    Trash2,
    MoveUp,
    MoveDown,
    User,
    CheckCircle,
    XCircle
} from 'lucide-react';
import Layout from '../../components/Layout';
import OrganizationChart from '../../components/OrganizationChart';
import './style.css';

interface ApprovalStepData {
    stepOrder: number;
    stepName: string;
    approverType: 'SPECIFIC_USER' | 'JOB_LEVEL' | 'DEPARTMENT_HEAD' | 'HR_STAFF' | 'SUBSTITUTE' | 'CENTER_DIRECTOR' | 'ADMIN_DIRECTOR' | 'CEO_DIRECTOR';
    approverId?: string | null;
    approverName?: string | null;
    jobLevel?: string | null;
    deptCode?: string | null;
    isOptional: boolean;
    canSkip: boolean;
    isFinalApprovalAvailable: boolean;
}

interface ApproverCandidate {
    userId: string;
    userName: string;
    jobLevel: string;
    deptCode?: string;
}

interface ApprovalLinePayload {
    name: string;
    description?: string;
    documentType: 'LEAVE_APPLICATION' | 'EMPLOYMENT_CONTRACT' | 'WORK_SCHEDULE';
    steps: ApprovalStepData[];
}

const approverTypeOptions = [
    { value: 'SPECIFIC_USER', label: '특정 사용자 (조직도 선택)' },
    { value: 'SUBSTITUTE', label: '대직자' },
    { value: 'DEPARTMENT_HEAD', label: '부서장' },
    { value: 'HR_STAFF', label: '인사팀' },
    { value: 'CENTER_DIRECTOR', label: '진료센터장' },
    { value: 'ADMIN_DIRECTOR', label: '행정원장' },
    { value: 'CEO_DIRECTOR', label: '대표원장' }
];

const jobLevelOptions = [
    { value: '0', label: '사원' },
    { value: '1', label: '부서장' },
    { value: '2', label: '진료센터장' },
    { value: '3', label: '원장' },
    { value: '4', label: '행정원장' },
    { value: '5', label: '대표원장' }
];

const emptyStep = (index: number): ApprovalStepData => ({
    stepOrder: index,
    stepName: `단계 ${index}`,
    approverType: 'SPECIFIC_USER',
    approverId: undefined,
    approverName: undefined,
    jobLevel: undefined,
    deptCode: undefined,
    isOptional: false,
    canSkip: false,
    isFinalApprovalAvailable: false
});

const MyApprovalLineEditor: React.FC = () => {
    const [cookies] = useCookies(['accessToken']);
    const navigate = useNavigate();
    const { id } = useParams<{ id?: string }>(); // id가 있으면 편집 모드

    const [lineName, setLineName] = useState('');
    const [description, setDescription] = useState('');
    const [documentType, setDocumentType] = useState<'LEAVE_APPLICATION' | 'EMPLOYMENT_CONTRACT' | 'WORK_SCHEDULE'>('LEAVE_APPLICATION');
    const [steps, setSteps] = useState<ApprovalStepData[]>([]);
    const [showOrgChart, setShowOrgChart] = useState(false);
    const [currentEditingStep, setCurrentEditingStep] = useState<number | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [ownerId, setOwnerId] = useState<string | null>(null); // createdBy from server when editing
    const isEditMode = Boolean(id);
    const [approverCandidates, setApproverCandidates] = useState<Record<number, any[]>>({});
    // 후보 목록 모달 상태 추가
    const [showCandidatesModal, setShowCandidatesModal] = useState(false);
    const [candidatesList, setCandidatesList] = useState<ApproverCandidate[]>([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);

    const getJobLevelText = (jobLevel: string): string => {
        const levels: Record<string, string> = {
            '0': '사원',
            '1': '부서장',
            '2': '진료센터장',
            '3': '원장',
            '4': '행정원장',
            '5': '대표원장'
        };
        return levels[jobLevel] || jobLevel;
    };

    // 현재 사용자 정보 가져오기 (소유자 판단용)
    useEffect(() => {
        const fetchMe = async () => {
            try {
                const res = await fetch('/api/v1/user/me', {
                    headers: { Authorization: `Bearer ${cookies.accessToken}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setCurrentUserId(data.userId || data.userId === 0 ? data.userId : data.userId);
                } else {
                    // ignore
                }
            } catch (e) {
                console.warn('내 정보 조회 실패', e);
            }
        };
        fetchMe();
    }, [cookies.accessToken]);

    // 편집 모드면 기존 결재라인 로드
    useEffect(() => {
        if (!isEditMode) return;

        const fetchLine = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/v1/approval-lines/${id}`, {
                    headers: { Authorization: `Bearer ${cookies.accessToken}` }
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => null);
                    alert(`결재라인 불러오기 실패: ${err?.error || res.statusText}`);
                    navigate('/detail/approval-lines');
                    return;
                }
                const data = await res.json();
                // 서버의 필드에 맞춰 상태 세팅
                setLineName(data.name || '');
                setDescription(data.description || '');
                setDocumentType(data.documentType || 'LEAVE_APPLICATION');
                setOwnerId(data.createdBy || null);

                // steps: 서버에서 들어오는 형식에 맞춤
                const loadedSteps: ApprovalStepData[] = (data.steps || []).map((s: any) => ({
                    stepOrder: s.stepOrder,
                    stepName: s.stepName,
                    approverType: s.approverType as ApprovalStepData['approverType'],
                    approverId: s.approverId ?? undefined,
                    approverName: s.approverName ?? undefined,
                    jobLevel: s.jobLevel ?? undefined,
                    deptCode: s.deptCode ?? undefined,
                    isOptional: !!s.isOptional,
                    canSkip: !!s.canSkip,
                    isFinalApprovalAvailable: !!s.isFinalApprovalAvailable
                }));
                setSteps(loadedSteps.length ? loadedSteps : [emptyStep(1)]);
            } catch (e) {
                console.error('결재라인 로드 실패', e);
                alert('결재라인을 불러오는 중 오류가 발생했습니다.');
                navigate('/detail/approval-lines');
            } finally {
                setLoading(false);
            }
        };

        fetchLine();
    }, [id, isEditMode, cookies.accessToken, navigate]);

    const addStep = () => {
        const newStep: ApprovalStepData = {
            stepOrder: steps.length + 1,
            stepName: `단계 ${steps.length + 1}`,
            approverType: 'SPECIFIC_USER',
            isOptional: false,
            canSkip: false,
            isFinalApprovalAvailable: false
        };
        setSteps(prev => [...prev, newStep]);
    };

    const removeStep = (index: number) => {
        const updatedSteps = steps.filter((_, i) => i !== index);
        updatedSteps.forEach((step, i) => step.stepOrder = i + 1);
        setSteps(updatedSteps);
    };

    const moveStep = (index: number, direction: 'up' | 'down') => {
        const newSteps = [...steps];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newSteps.length) return;
        [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
        newSteps.forEach((step, i) => step.stepOrder = i + 1);
        setSteps(newSteps);
    };

    const updateStep = (index: number, field: keyof ApprovalStepData, value: any) => {
        const updatedSteps = [...steps];
        updatedSteps[index] = { ...updatedSteps[index], [field]: value };
        if (field === 'approverType') {
            updatedSteps[index].approverId = undefined;
            updatedSteps[index].approverName = undefined;
            updatedSteps[index].jobLevel = undefined;
            updatedSteps[index].deptCode = undefined;
        }
        setSteps(updatedSteps);
    };

    const openOrgChartForStep = (index: number) => {
        setCurrentEditingStep(index);
        setShowOrgChart(true);
    };

    const handleUserSelected = (userId: string, userName: string, jobLevel: string) => {
        if (currentEditingStep !== null && steps[currentEditingStep]) {
            const updatedSteps = [...steps];
            updatedSteps[currentEditingStep].approverId = userId;
            updatedSteps[currentEditingStep].approverName = userName;
            updatedSteps[currentEditingStep].stepName = `${userName} 승인`;
            setSteps(updatedSteps);
            setShowOrgChart(false);
            setCurrentEditingStep(null);
        }
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};
        if (!lineName.trim()) newErrors.lineName = '결재라인 이름을 입력하세요';
        if (steps.length === 0) newErrors.steps = '최소 1개 이상의 단계를 추가하세요';

        steps.forEach((step, index) => {
            //  SUBSTITUTE는 approverId 검증 제외
            if (step.approverType === 'SUBSTITUTE') {
                return; // 대직자는 제출 시점에 선택
            }

            //  나머지 타입은 모두 approverId 필수
            if (!step.approverId) {
                newErrors[`step_${index}`] = `${step.stepOrder}단계: 승인자를 선택하세요`;
            }
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const buildPayload = (): ApprovalLinePayload => ({
        name: lineName,
        description,
        documentType,
        steps: steps.map(s => ({
            stepOrder: s.stepOrder,
            stepName: s.stepName,
            approverType: s.approverType,
            approverId: s.approverId ?? null,
            jobLevel: s.jobLevel ?? null,
            deptCode: s.deptCode ?? null,
            isOptional: !!s.isOptional,
            canSkip: !!s.canSkip,
            isFinalApprovalAvailable: !!s.isFinalApprovalAvailable
        }))
    });

    const handleSubmit = async () => {
        if (!validate()) {
            alert('입력 내용을 확인해주세요');
            return;
        }

        setSaving(true);
        const payload = buildPayload();

        try {
            if (isEditMode) {
                const res = await fetch(`/api/v1/approval-lines/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${cookies.accessToken}`
                    },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => null);
                    alert(`수정 실패: ${err?.error || res.statusText}`);
                } else {
                    alert('결재라인이 수정되었습니다.');
                    navigate('/detail/approval-lines');
                }
            } else {
                const res = await fetch('/api/v1/approval-lines', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${cookies.accessToken}`
                    },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => null);
                    alert(`생성 실패: ${err?.error || res.statusText}`);
                } else {
                    alert('결재라인이 생성되었습니다.');
                    navigate('/detail/approval-lines');
                }
            }
        } catch (e) {
            console.error('결재라인 저장 실패', e);
            alert('서버와 통신 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!isEditMode || !id) return;
        if (!window.confirm('정말 이 결재라인을 삭제하시겠습니까?')) return;

        try {
            const res = await fetch(`/api/v1/approval-lines/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => null);
                alert(`삭제 실패: ${err?.error || res.statusText}`);
            } else {
                alert('삭제 되었습니다.');
                navigate('/detail/approval-lines');
            }
        } catch (e) {
            console.error('결재라인 삭제 실패', e);
            alert('서버와 통신 중 오류가 발생했습니다.');
        }
    };

    //  "사용자 선택" 버튼 클릭 시 후보 목록 조회
    const handleOpenCandidatesModal = async (index: number) => {
        const step = steps[index];

        // SPECIFIC_USER는 조직도 사용
        if (step.approverType === 'SPECIFIC_USER') {
            setCurrentEditingStep(index);
            setShowOrgChart(true);
            return;
        }

        // SUBSTITUTE는 후보 조회 불필요
        if (step.approverType === 'SUBSTITUTE') {
            alert('대직자는 휴가원 작성 시 신청자가 직접 선택합니다.');
            return;
        }

        setCurrentEditingStep(index);
        setLoadingCandidates(true);
        setShowCandidatesModal(true);

        try {
            const res = await fetch(
                `/api/v1/approval-lines/candidates?approverType=${step.approverType}`,
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );

            if (res.ok) {
                const data = await res.json();
                setCandidatesList(data);
            } else {
                const err = await res.json().catch(() => null);
                alert(`후보 조회 실패: ${err?.error || res.statusText}`);
                setShowCandidatesModal(false);
            }
        } catch (error) {
            console.error('후보 조회 실패:', error);
            alert('후보 목록을 불러오는 중 오류가 발생했습니다.');
            setShowCandidatesModal(false);
        } finally {
            setLoadingCandidates(false);
        }
    };

    //  후보 목록에서 사용자 선택 시
    const handleCandidateSelected = (candidate: ApproverCandidate) => {
        if (currentEditingStep !== null) {
            const updatedSteps = [...steps];
            updatedSteps[currentEditingStep].approverId = candidate.userId;
            updatedSteps[currentEditingStep].approverName = candidate.userName;
            updatedSteps[currentEditingStep].stepName = `${candidate.userName} 승인`;
            setSteps(updatedSteps);
            setShowCandidatesModal(false);
            setCandidatesList([]);
            setCurrentEditingStep(null);
        }
    };


    return (
        <Layout>
            <div className="approval-line-creator">
                <div className="approval-line-creator-header">
                    <h1>{isEditMode ? '결재라인 편집' : '결재라인 생성'}</h1>
                    <div className="approval-line-creator-actions">
                        <button
                            className="approval-line-btn-cancel"
                            onClick={() => navigate('/detail/approval-lines')}
                            disabled={saving}
                        >
                            취소
                        </button>

                        {isEditMode && ownerId && currentUserId === ownerId && (
                            <button
                                className="approval-line-btn-delete"
                                onClick={handleDelete}
                                disabled={saving}
                                title="결재라인 삭제 (비활성화)"
                                style={{marginRight: 8}}
                            >
                                <Trash2 className="approval-line-icon"/>
                                삭제
                            </button>
                        )}

                        <button
                            className="approval-line-btn-save"
                            onClick={handleSubmit}
                            disabled={saving || loading}
                        >
                            <CheckCircle className="approval-line-icon"/>
                            {saving ? '저장중...' : '저장'}
                        </button>
                    </div>
                </div>

                <div className="approval-line-creator-content">
                    <div className="approval-line-creator-section">
                        <h2>기본 정보</h2>
                        <div className="approval-line-form-group">
                            <label>
                                결재라인 이름 <span className="approval-line-required">*</span>
                            </label>
                            <input
                                type="text"
                                value={lineName}
                                onChange={(e) => setLineName(e.target.value)}
                                placeholder="예: 일반 사원 휴가 결재라인"
                                className={errors.lineName ? 'error' : ''}
                            />
                            {errors.lineName && (
                                <span className="approval-line-error-message">{errors.lineName}</span>
                            )}
                        </div>

                        <div className="approval-line-form-group">
                            <label>설명</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="결재라인에 대한 설명을 입력하세요"
                                rows={3}
                            />
                        </div>

                        <div className="approval-line-form-group">
                            <label>
                                문서 타입 <span className="approval-line-required">*</span>
                            </label>
                            <select
                                value={documentType}
                                onChange={(e) => setDocumentType(e.target.value as any)}
                            >
                                <option value="LEAVE_APPLICATION">휴가원</option>
                                <option value="EMPLOYMENT_CONTRACT">근로계약서</option>
                                <option value="WORK_SCHEDULE">근무현황표</option>
                            </select>
                        </div>
                    </div>

                    <div className="approval-line-creator-section">
                        <div className="approval-line-section-header">
                            <h2>결재 단계</h2>
                            <button
                                className="approval-line-btn-add-step"
                                onClick={addStep}
                            >
                                <Plus className="approval-line-icon" />
                                단계 추가
                            </button>
                        </div>

                        {errors.steps && (
                            <div className="approval-line-error-message-box">
                                {errors.steps}
                            </div>
                        )}

                        <div className="approval-line-steps-list">
                            {steps.map((step, index) => (
                                <div key={index} className="approval-line-step-item">
                                    <div className="approval-line-step-header">
                                        <div className="approval-line-step-number">
                                            {step.stepOrder}단계
                                        </div>
                                        <div className="approval-line-step-actions">
                                            <button
                                                onClick={() => moveStep(index, 'up')}
                                                disabled={index === 0}
                                                title="위로 이동"
                                            >
                                                <MoveUp className="approval-line-icon" />
                                            </button>
                                            <button
                                                onClick={() => moveStep(index, 'down')}
                                                disabled={index === steps.length - 1}
                                                title="아래로 이동"
                                            >
                                                <MoveDown className="approval-line-icon" />
                                            </button>
                                            <button
                                                onClick={() => removeStep(index)}
                                                className="approval-line-btn-delete"
                                                title="삭제"
                                            >
                                                <Trash2 className="approval-line-icon" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="approval-line-step-content">
                                        <div className="approval-line-form-row">
                                            <div className="approval-line-form-group">
                                                <label>단계 이름</label>
                                                <input
                                                    type="text"
                                                    value={step.stepName}
                                                    onChange={(e) =>
                                                        updateStep(index, 'stepName', e.target.value)
                                                    }
                                                    placeholder="예: 부서장 승인"
                                                />
                                            </div>

                                            <div className="approval-line-form-group">
                                                <label>승인자 타입</label>
                                                <select
                                                    value={step.approverType}
                                                    onChange={(e) =>
                                                        updateStep(index, 'approverType', e.target.value as ApprovalStepData['approverType'])
                                                    }
                                                >
                                                    {approverTypeOptions.map(opt => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/*  승인자 선택 UI - 타입별 분기 */}
                                        {step.approverType === 'SUBSTITUTE' ? (
                                            <div className="approval-line-info-message">
                                                ✅ 대직자는 휴가원 작성 시 신청자가 직접 선택합니다.
                                            </div>
                                        ) : (
                                            <div className="approval-line-form-group">
                                                <label>승인자 선택</label>
                                                <div className="approval-line-user-select-row">
                                                    <input
                                                        type="text"
                                                        value={step.approverName || ''}
                                                        readOnly
                                                        placeholder={
                                                            step.approverType === 'SPECIFIC_USER'
                                                                ? "조직도에서 선택하세요"
                                                                : "후보 목록에서 선택하세요"
                                                        }
                                                    />
                                                    <button
                                                        className="approval-line-btn-select-user"
                                                        onClick={() => handleOpenCandidatesModal(index)}
                                                    >
                                                        <User className="approval-line-icon" />
                                                        사용자 선택
                                                    </button>
                                                </div>
                                                {errors[`step_${index}`] && (
                                                    <span className="approval-line-error-message">
                                                    {errors[`step_${index}`]}
                                                </span>
                                                )}
                                            </div>
                                        )}

                                        {/* 옵션 설정 */}
                                        <div className="approval-line-step-options">
                                            <label className="approval-line-checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    checked={step.isOptional}
                                                    onChange={(e) =>
                                                        updateStep(index, 'isOptional', e.target.checked)
                                                    }
                                                />
                                                <span>선택적 단계 (생략 가능)</span>
                                            </label>

                                            <label className="approval-line-checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    checked={step.canSkip}
                                                    onChange={(e) =>
                                                        updateStep(index, 'canSkip', e.target.checked)
                                                    }
                                                />
                                                <span>건너뛰기 허용</span>
                                            </label>

                                            <label className="approval-line-checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    checked={step.isFinalApprovalAvailable}
                                                    onChange={(e) =>
                                                        updateStep(index, 'isFinalApprovalAvailable', e.target.checked)
                                                    }
                                                />
                                                <span>전결 승인 가능</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 조직도 모달 */}
                {showOrgChart && (
                    <div className="approval-line-modal-overlay" onClick={() => setShowOrgChart(false)}>
                        <div className="approval-line-modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="approval-line-modal-header">
                                <h3>승인자 선택</h3>
                                <button
                                    className="approval-line-modal-close"
                                    onClick={() => setShowOrgChart(false)}
                                >
                                    <XCircle className="approval-line-icon" />
                                </button>
                            </div>
                            <div className="approval-line-modal-body">
                                <OrganizationChart
                                    onUserSelect={handleUserSelected}
                                    selectedUserId={
                                        currentEditingStep !== null
                                            ? steps[currentEditingStep]?.approverId ?? undefined
                                            : undefined
                                    }
                                    allDepartments={true}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* 후보 목록 모달 추가 */}
                {showCandidatesModal && (
                    <div className="approval-line-modal-overlay" onClick={() => {
                        setShowCandidatesModal(false);
                        setCandidatesList([]);
                        setCurrentEditingStep(null);
                    }}>
                        <div className="approval-line-modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="approval-line-modal-header">
                                <h3>승인자 선택</h3>
                                <button
                                    className="approval-line-modal-close"
                                    onClick={() => {
                                        setShowCandidatesModal(false);
                                        setCandidatesList([]);
                                        setCurrentEditingStep(null);
                                    }}
                                >
                                    <XCircle className="approval-line-icon" />
                                </button>
                            </div>
                            <div className="approval-line-modal-body">
                                {loadingCandidates ? (
                                    <div className="loading-message">후보 목록을 불러오는 중...</div>
                                ) : candidatesList.length === 0 ? (
                                    <div className="empty-message">
                                        해당 조건에 맞는 승인자가 없습니다.
                                    </div>
                                ) : (
                                    <div className="candidates-list">
                                        {candidatesList.map(candidate => (
                                            <div
                                                key={candidate.userId}
                                                className="candidate-item"
                                                onClick={() => handleCandidateSelected(candidate)}
                                            >
                                                <div className="candidate-info">
                                                    <span className="candidate-name">{candidate.userName}</span>
                                                    <span className="candidate-details">
                                        {candidate.deptCode || ''} | {getJobLevelText(candidate.jobLevel)}
                                    </span>
                                                </div>
                                                {currentEditingStep !== null &&
                                                    steps[currentEditingStep]?.approverId === candidate.userId && (
                                                        <CheckCircle className="selected-icon" />
                                                    )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default MyApprovalLineEditor;
