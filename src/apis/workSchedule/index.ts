import axios from 'axios';
import axiosInstance from "../../views/Authentication/axiosInstance";

const API_BASE = '/work-schedules';

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
    isFinalApproved?: boolean;
    finalApprovedBy?: string;
}

export interface DeptDutyConfig {
    id?: number;
    scheduleId: number;
    dutyMode: 'NIGHT_SHIFT' | 'ON_CALL_DUTY';
    displayName: string;
    cellSymbol: string;
    useWeekday: boolean;
    useFriday: boolean;
    useSaturday: boolean;
    useHolidaySunday: boolean;
}

export interface WorkSchedule {
    id: number;
    deptCode: string;
    scheduleYearMonth: string;
    createdBy: string;
    creatorName?: string;
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
    isFinalApproved?: boolean;       // 최종승인 여부
    finalApprovedBy?: string;        // 최종승인자
    finalApprovedAt?: string;        // 최종승인 시각
    currentApprovalStep?: number;
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
    dutyDetailJson?: string;
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
    dutyConfig?: DeptDutyConfig;
    deptName?: string;
}

/**
 * 부서 당직 설정 저장
 */
export const saveDeptDutyConfig = async (
    config: DeptDutyConfig
): Promise<DeptDutyConfig> => {
    const response = await axiosInstance.post(`/dept-duty-config`, config);
    return response.data;
};

/**
 * 근무표 목록 조회 (내 부서)
 */
export const fetchMyWorkSchedules = async (): Promise<WorkSchedule[]> => {
    return (await axiosInstance.get(`${API_BASE}/my-department`)).data;
};


/**
 * 근무표 상세 조회
 */
export const fetchWorkScheduleDetail = async (
    scheduleId: number
): Promise<WorkScheduleDetail> => {
    const response = await axiosInstance.get(`${API_BASE}/${scheduleId}`);
    return response.data;
};

/**
 * 근무표 생성
 */
export const createWorkSchedule = async (
    deptCode: string,
    yearMonth: string
): Promise<WorkSchedule> => {
    const response = await axiosInstance.post(API_BASE, { deptCode, yearMonth });
    return response.data;
};

/**
 * 근무 데이터 일괄 업데이트
 */
export const updateWorkData = async (
    scheduleId: number,
    updates: { entryId: number; workData: Record<string, string> }[]
): Promise<void> => {
    await axiosInstance.put(`${API_BASE}/${scheduleId}/work-data`, { updates });
};

/**
 * 의무 나이트 개수 설정
 */
export const updateNightRequired = async (
    entryId: number,
    requiredCount: number
): Promise<void> => {
    await axiosInstance.put(`${API_BASE}/entries/${entryId}/night-required`, { requiredCount });
};

export const toggleFinalApproval = async (
    scheduleId: number
): Promise<{ message: string; isFinalApproved: boolean }> => {
    const response = await axiosInstance.post(`${API_BASE}/${scheduleId}/toggle-final-approval`, {});
    return response.data;
};

/**
 * 특정 달 데이터 불러오기
 */
export const copyFromSpecificMonth = async (
    scheduleId: number,
    sourceYearMonth: string
): Promise<void> => {
    await axiosInstance.post(`${API_BASE}/${scheduleId}/copy-from`, { sourceYearMonth });
};

/**
 * 반려된 근무현황표 페이지
 */
export const fetchRejectedWorkSchedules = async () => {
    const response = await axiosInstance.get(`${API_BASE}/rejected`);
    return response.data; // 배열 반환
};