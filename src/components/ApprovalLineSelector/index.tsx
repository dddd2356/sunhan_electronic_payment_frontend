import React, {useCallback, useEffect, useState} from 'react';
import { CheckCircle, ChevronRight, X } from 'lucide-react';
import './style.css';

interface ApprovalStep {
    stepOrder: number;
    stepName: string;
    approverType: string;
    approverName?: string;
    isOptional?: boolean;
}

interface ApprovalLine {
    id: number;
    name: string;
    description?: string;
    steps: ApprovalStep[] | null | undefined;
}
// onConfirm이 선택된 라인 ID와 필터링된 단계를 반환하도록 타입 변경
interface ConfirmedApprovalLineData {
    id: number;
    steps: ApprovalStep[]; // 최종적으로 포함될 단계 목록
}

interface ApprovalLineSelectorProps {
    approvalLines: ApprovalLine[] | null | undefined;
    selectedLineId: number | null;
    onSelect: (lineId: number) => void;
    onConfirm: (data: ConfirmedApprovalLineData) => void;
    onCancel: () => void;
}

const ApprovalLineSelector: React.FC<ApprovalLineSelectorProps> = ({
                                                                       approvalLines,
                                                                       selectedLineId,
                                                                       onSelect,
                                                                       onConfirm,
                                                                       onCancel
                                                                   }) => {
    const lines = approvalLines || [];
    const selectedLine = lines.find(line => line.id === selectedLineId);

    // 선택적 단계의 포함 여부를 추적하는 상태 (stepOrder를 키로 사용)
    const [includedOptionalSteps, setIncludedOptionalSteps] = useState<Record<number, boolean>>({});

    // 선택된 결재라인이 변경될 때 상태 초기화
    useEffect(() => {
        if (selectedLine?.steps) {
            const initialSelection: Record<number, boolean> = {};
            selectedLine.steps.forEach(step => {
                if (step.isOptional) {
                    // 기본적으로 선택적 단계는 포함(true) 상태로 시작
                    initialSelection[step.stepOrder] = true;
                }
            });
            setIncludedOptionalSteps(initialSelection);
        } else {
            setIncludedOptionalSteps({});
        }
    }, [selectedLineId, selectedLine]);

    const handleOptionalToggle = useCallback((stepOrder: number, checked: boolean) => {
        setIncludedOptionalSteps(prev => ({
            ...prev,
            [stepOrder]: checked,
        }));
    }, []);

    // '선택 완료' 클릭 핸들러
    const handleConfirmClick = () => {
        if (!selectedLineId || !selectedLine) return;

        // 선택적 단계 필터링 로직
        const finalSteps = (selectedLine.steps || []).filter(step => {
            // 1. 선택적 단계가 아닌 경우 (필수 단계) -> 무조건 포함
            if (!step.isOptional) {
                return true;
            }
            // 2. 선택적 단계인 경우 -> includedOptionalSteps 상태가 true일 때만 포함
            return !!includedOptionalSteps[step.stepOrder];
        });

        // 최종 결과 전달 (FinalApprovalLineData 형식)
        onConfirm({
            id: selectedLineId,
            steps: finalSteps, // 필터링된 최종 단계 목록
        });
    };


    const getApproverTypeLabel = (type: string): string => {
        const labels: Record<string, string> = {
            'SPECIFIC_USER': '지정 승인자',
            'SUBSTITUTE': '대직자',
            'JOB_LEVEL': '직급 기반',
            'DEPARTMENT_HEAD': '부서장',
            'HR_STAFF': '인사팀',
            'CENTER_DIRECTOR': '진료센터장',
            'ADMIN_DIRECTOR': '행정원장',
            'CEO_DIRECTOR': '대표원장'
        };
        return labels[type] || type;
    };

    return (
        <div className="approval-line-selector-overlay" onClick={onCancel}>
            <div className="approval-line-selector-modal" onClick={(e) => e.stopPropagation()}>
                <div className="selector-header">
                    <div>
                        <h3>결재라인 선택</h3>
                        <p>이 휴가원에 적용할 결재라인을 선택하세요</p>
                    </div>
                    <button className="close-btn" onClick={onCancel}>
                        <X />
                    </button>
                </div>

                <div className="selector-body">
                    {lines.length === 0 ? (
                        <div className="empty-state">
                            <p>사용 가능한 결재라인이 없습니다.</p>
                            <p className="empty-hint">
                                관리자에게 문의하여 결재라인을 생성해주세요.
                            </p>
                        </div>
                    ) : (
                        <div className="approval-lines-list">
                            {lines.map(line => (
                                <div
                                    key={line.id}
                                    className={`approval-line-item ${
                                        selectedLineId === line.id ? 'selected' : ''
                                    }`}
                                    onClick={() => onSelect(line.id)}
                                >
                                    <div className="line-main">
                                        <div className="line-info">
                                            <h4>{line.name}</h4>
                                            {line.description && (
                                                <p className="line-description">
                                                    {line.description}
                                                </p>
                                            )}
                                        </div>
                                        {selectedLineId === line.id && (
                                            <CheckCircle className="selected-icon" />
                                        )}
                                    </div>

                                    <div className="line-steps">
                                        <div className="steps-header">
                                            <span className="steps-label">
                                                결재 단계 ({(line.steps || []).length}단계)
                                            </span>
                                        </div>
                                        <div className="steps-flow">
                                            {(line.steps || []).map((step, index) => (
                                                <React.Fragment key={step.stepOrder}>
                                                    <div className="step-badge">
                                                        {line.id === selectedLineId && step.isOptional && (
                                                            // 선택적 단계 체크박스
                                                            <div className="optional-checkbox-wrapper">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!includedOptionalSteps[step.stepOrder]}
                                                                    onChange={(e) => handleOptionalToggle(step.stepOrder, e.target.checked)}
                                                                    title="이 단계를 결재라인에 포함합니다."
                                                                    onClick={(e) => e.stopPropagation()} // 클릭 버블링 방지
                                                                />
                                                            </div>
                                                        )}
                                                        <span className="step-number">
                                                            {step.stepOrder}
                                                        </span>
                                                        <div className="step-info">
                                                            <span className="step-name">
                                                                {step.stepName}
                                                            </span>
                                                            <span className="step-type">
                                                                {getApproverTypeLabel(step.approverType)}
                                                            </span>
                                                            {step.approverName && (
                                                                <span className="step-approver">
                                                                    ({step.approverName})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {index < (line.steps || []).length - 1 && (
                                                        <ChevronRight className="arrow-icon" />
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="selector-footer">
                    <button className="btn-cancel" onClick={onCancel}>
                        취소
                    </button>
                    <button
                        className="btn-confirm"
                        onClick={handleConfirmClick}
                        disabled={!selectedLineId}
                    >
                        선택 완료
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ApprovalLineSelector;