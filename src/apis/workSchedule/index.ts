import axios from 'axios';

const API_BASE = '/api/v1/work-schedules';

export interface ApprovalStepInfo {
    stepOrder: number;
    stepName: string;
    name: string;
    approverId?: string;
    signatureUrl?: string;
    signedAt?: string;
    isCurrent: boolean;
    isSigned: boolean;
    isRejected?: boolean;
    rejectionReason?: string;
    rejectedAt?: string;
    rejectedBy?: string;
}

export interface WorkSchedule {
    id: number;
    deptCode: string;
    scheduleYearMonth: string;
    createdBy: string;
    reviewerId?: string;
    approverId?: string;
    approvalStatus: 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'APPROVED' | 'REJECTED';
    remarks?: string;
    pdfUrl?: string;
    isPrintable: boolean;
    createdAt: string;
    updatedAt: string;
    creatorSignatureUrl?: string | null;
    creatorSignedAt?: string | null;
    reviewerSignatureUrl?: string;
    reviewerSignedAt?: string;
    approverSignatureUrl?: string;
    approverSignedAt?: string;
    approvalSteps?: ApprovalStepInfo[];
}

export interface WorkScheduleEntry {
    id: number;
    userId: string;
    userName?: string;
    positionId?: number | null;
    positionName?: string;
    displayOrder: number;
    workData?: Record<string, string>; // {"1": "D", "2": "N", ...}
    nightDutyRequired: number;
    nightDutyActual: number;
    nightDutyAdditional: number;
    offCount: number;
    vacationTotal: number;
    vacationUsedThisMonth: number;
    vacationUsedTotal: number;
    remarks?: string;
}

export interface WorkScheduleDetail {
    schedule: WorkSchedule;
    entries: WorkScheduleEntry[];
    positions: any[];
    users: Record<string, any>;
    yearMonth: string;
    daysInMonth: number;
    approvalSteps?: ApprovalStepInfo[];
}

/**
 * 근무표 목록 조회 (내 부서)
 */
export const fetchMyWorkSchedules = async (token: string): Promise<WorkSchedule[]> => {
    const response = await axios.get(`${API_BASE}/my-department`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

/**
 * 근무표 상세 조회
 */
export const fetchWorkScheduleDetail = async (
    scheduleId: number,
    token: string
): Promise<WorkScheduleDetail> => {
    const response = await axios.get(`${API_BASE}/${scheduleId}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

/**
 * 근무표 생성
 */
export const createWorkSchedule = async (
    deptCode: string,
    yearMonth: string,
    token: string
): Promise<WorkSchedule> => {
    const response = await axios.post(
        API_BASE,
        { deptCode, yearMonth },
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
};

/**
 * 근무 데이터 일괄 업데이트
 */
export const updateWorkData = async (
    scheduleId: number,
    updates: { entryId: number; workData: Record<string, string> }[],
    token: string
): Promise<void> => {
    await axios.put(
        `${API_BASE}/${scheduleId}/work-data`,
        { updates },
        { headers: { Authorization: `Bearer ${token}` } }
    );
};

/**
 * 의무 나이트 개수 설정
 */
export const updateNightRequired = async (
    entryId: number,
    requiredCount: number,
    token: string
): Promise<void> => {
    await axios.put(
        `${API_BASE}/entries/${entryId}/night-required`,
        { requiredCount },
        { headers: { Authorization: `Bearer ${token}` } }
    );
};

/**
 * 근무표 제출
 */
export const submitWorkSchedule = async (
    scheduleId: number,
    reviewerId: string,
    approverId: string,
    token: string
): Promise<void> => {
    await axios.post(
        `${API_BASE}/${scheduleId}/submit`,
        { reviewerId, approverId },
        { headers: { Authorization: `Bearer ${token}` } }
    );
};

/**
 * 검토
 */
export const reviewWorkSchedule = async (
    scheduleId: number,
    approve: boolean,
    token: string
): Promise<void> => {
    await axios.post(
        `${API_BASE}/${scheduleId}/review`,
        { approve },
        { headers: { Authorization: `Bearer ${token}` } }
    );
};

/**
 * 최종 승인
 */
export const approveWorkSchedule = async (
    scheduleId: number,
    approve: boolean,
    token: string
): Promise<void> => {
    await axios.post(
        `${API_BASE}/${scheduleId}/approve`,
        { approve },
        { headers: { Authorization: `Bearer ${token}` } }
    );
};