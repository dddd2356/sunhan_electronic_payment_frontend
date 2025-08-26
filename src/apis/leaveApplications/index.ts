const API_BASE = process.env.REACT_APP_API_URL || '/api/v1';

const withAuth = (token: string) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
});
interface PaginationResponse {
    content: any[];
    totalElements: number;
    totalPages: number;
    currentPage: number;
    size: number;
}
// 사용자 정보 조회
export const fetchCurrentUser = async (token: string) => {
    const response = await fetch(`${API_BASE}/user/me`, {
        headers: withAuth(token)
    });

    if (!response.ok) {
        throw new Error('사용자 정보를 불러올 수 없습니다.');
    }

    return response.json();
};

// 휴가원 목록 조회
export const fetchLeaveApplications = async (
    token: string,
    type: 'my' | 'pending' | 'completed',
    canViewCompleted?: boolean,
    page: number = 0, // Default to page 0
    size: number = 10 // Default to size 10
): Promise<PaginationResponse> => {
    let path = '';

    switch (type) {
        case 'my':
            path = `${API_BASE}/leave-application/my?page=${page}&size=${size}`;
            break;
        case 'pending':
            path = `${API_BASE}/leave-application/pending/me?page=${page}&size=${size}`;
            break;
        case 'completed':
            path = canViewCompleted
                ? `${API_BASE}/leave-application/completed?page=${page}&size=${size}`
                : `${API_BASE}/leave-application/completed/me?page=${page}&size=${size}`;
            break;
    }

    const response = await fetch(path, {
        headers: withAuth(token)
    });

    if (!response.ok) {
        throw new Error('휴가원 목록을 불러올 수 없습니다.');
    }

    const data = await response.json();
    const totalCount = response.headers.get('X-Total-Count');

    return {
        content: data.content || data, // Fallback for backward compatibility if backend sends non-paginated data
        totalElements: totalCount ? parseInt(totalCount) : (data.length || 0),
        totalPages: totalCount && size ? Math.ceil(parseInt(totalCount) / size) : 1,
        currentPage: page,
        size: size
    } as PaginationResponse;
};

// 휴가원 상세 조회
export const fetchLeaveApplicationDetail = async (id: number, token: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}`, {
        headers: withAuth(token)
    });

    if (!response.ok) {
        throw new Error('휴가원 상세 정보를 불러올 수 없습니다.');
    }

    return response.json();
};

// 새 휴가원 생성
export const createLeaveApplication = async (token: string) => {
    const response = await fetch(`${API_BASE}/leave-application`, {
        method: 'POST',
        headers: withAuth(token)
    });

    if (!response.ok) {
        throw new Error('휴가원 생성에 실패했습니다.');
    }

    return response.json();
};

// 휴가원 저장/수정 (임시저장) - 수정된 payload 구조
// API 함수도 수정 (paste-3.txt의 saveLeaveApplication 함수 대체)
export const saveLeaveApplication = async (id: number, updateData: any, token: string) => {
    // 데이터 유효성 검사
    if (!updateData.leaveTypes || updateData.leaveTypes.length === 0) {
        throw new Error('휴가 종류를 선택해주세요.');
    }

    if (!updateData.totalDays || updateData.totalDays <= 0) {
        throw new Error('유효한 휴가 기간을 입력해주세요.');
    }

    // 백엔드 LeaveApplicationUpdateFormRequestDto 구조에 맞는 payload 생성
    const payload = {
        applicantInfo: updateData.applicantInfo || {},
        substituteInfo: updateData.substituteInfo,
        leaveTypes: updateData.leaveTypes,
        leaveContent: updateData.leaveContent || {},
        flexiblePeriods: updateData.flexiblePeriods || [],
        consecutivePeriod: updateData.consecutivePeriod,
        totalDays: Math.max(updateData.totalDays, 0.5), // 최소값 보장
        applicationDate: updateData.applicationDate,
        signatures: updateData.signatures || {},
        currentApprovalStep: updateData.currentApprovalStep
    };

    console.log('API 전송 payload:', JSON.stringify(payload, null, 2)); // 디버깅용

    const response = await fetch(`${API_BASE}/leave-application/${id}`, {
        method: 'PUT',
        headers: withAuth(token),
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP ${response.status}: 휴가원 저장에 실패했습니다.`;
        throw new Error(errorMessage);
    }

    return response.json();
};

// 휴가원 제출
export const submitLeaveApplication = async (id: number, currentApprovalStep: string, token: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/submit`, {
        method: 'POST',
        headers: withAuth(token),
        body: JSON.stringify({ currentApprovalStep })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '휴가원 제출에 실패했습니다.');
    }

    return response.json();
};

// 휴가원 승인
export const approveLeaveApplication = async (id: number, signatureDate: string, token: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/approve`, {
        method: 'PUT',
        headers: withAuth(token),
        body: JSON.stringify({ signatureDate })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '휴가원 승인에 실패했습니다.');
    }

    return response.json();
};

// 휴가원 반려
export const rejectLeaveApplication = async (id: number, reason: string, token: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/reject`, {
        method: 'PUT',
        headers: withAuth(token),
        body: JSON.stringify({ rejectionReason: reason })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '휴가원 반려에 실패했습니다.');
    }

    return response.json();
};

// 휴가원 전결 승인
export const finalApproveLeaveApplication = async (id: number, token: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/final-approve`, {
        method: 'PUT',
        headers: withAuth(token)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '휴가원 전결 승인에 실패했습니다.');
    }

    return response.json();
};

// 휴가원 삭제
export const deleteLeaveApplication = async (id: number, token: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}`, {
        method: 'DELETE',
        headers: withAuth(token)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '휴가원 삭제에 실패했습니다.');
    }

    return response.json();
};

// 대직자 지정
export const updateSubstitute = async (id: number, substituteUserId: string, token: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/substitute`, {
        method: 'PUT',
        headers: withAuth(token),
        body: JSON.stringify({ userId: substituteUserId })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '대직자 지정에 실패했습니다.');
    }

    return response.json();
};

// 서명 정보 조회
export const fetchLeaveApplicationSignatures = async (id: number, token: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/signatures`, {
        headers: withAuth(token)
    });

    if (!response.ok) {
        throw new Error('서명 정보를 불러올 수 없습니다.');
    }

    return response.json();
};

// 서명 업데이트/취소
export const updateSignature = async (id: number, signatureType: string, signatureData: any, token: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/signature/${signatureType}`, {
        method: 'PUT',
        headers: withAuth(token),
        body: JSON.stringify(signatureData)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '서명 업데이트에 실패했습니다.');
    }

    return response.json();
};

// 휴가원 서명 (새로운 sign 엔드포인트용)
export const signLeaveApplication = async (id: number, signRequest: {
    signerId: string;
    signerType: string;
    signatureEntry: {
        text: string;
        imageUrl: string;
        isSigned: boolean;
        signatureDate: string;
    };
}, token: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/sign`, {
        method: 'PUT',
        headers: withAuth(token),
        body: JSON.stringify(signRequest)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '서명에 실패했습니다.');
    }

    return response.json();
};

// 대직자 후보 목록 조회
export const fetchSubstituteCandidates = async (token: string) => {
    const response = await fetch(`${API_BASE}/leave-application/substitute-candidates`, {
        headers: withAuth(token)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '대직자 후보 목록을 불러올 수 없습니다.');
    }

    return response.json();
};

// PDF 다운로드
export const downloadLeaveApplicationPdf = async (id: number, token: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/pdf`, {
        headers: withAuth(token)
    });

    if (!response.ok) {
        throw new Error('PDF 다운로드에 실패했습니다.');
    }

    return response.blob();
};