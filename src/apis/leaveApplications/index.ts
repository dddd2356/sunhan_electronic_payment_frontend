const API_BASE = process.env.REACT_APP_API_URL || '/api/v1';

const defaultHeaders = { 'Content-Type': 'application/json' };

interface PaginationResponse {
    content: any[];
    totalElements: number;
    totalPages: number;
    currentPage: number;
    size: number;
}
// 사용자 정보 조회
export const fetchCurrentUser = async () => {
    const response = await fetch(`${API_BASE}/user/me`, {
        headers: defaultHeaders,
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error('사용자 정보를 불러올 수 없습니다.');
    }

    return response.json();
};

// 휴가원 목록 조회
export const fetchLeaveApplications = async (
    type: 'my' | 'pending' | 'completed',
    canViewCompleted?: boolean,
    page: number = 0, // Default to page 0
    size: number = 10, // Default to size 10
    searchTerm: string = '',
    searchType: string = 'applicant',
    startDate: string = '',
    endDate: string = ''
): Promise<PaginationResponse> => {
    let path = '';

    switch (type) {
        case 'my':
            path = `${API_BASE}/leave-application/my?page=${page}&size=${size}&searchTerm=${encodeURIComponent(searchTerm)}&searchType=${searchType}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`;
            break;
        case 'pending':
            path = `${API_BASE}/leave-application/pending/me?page=${page}&size=${size}&searchTerm=${encodeURIComponent(searchTerm)}&searchType=${searchType}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`;
            break;
        case 'completed':
            path = canViewCompleted
                ? `${API_BASE}/leave-application/completed?page=${page}&size=${size}&searchTerm=${encodeURIComponent(searchTerm)}&searchType=${searchType}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`
                : `${API_BASE}/leave-application/completed/me?page=${page}&size=${size}&searchTerm=${encodeURIComponent(searchTerm)}&searchType=${searchType}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`;
            break;
    }

    const response = await fetch(path, {
        headers: defaultHeaders,
        credentials: 'include'
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

// 전체 진행중 휴가원 조회 (HR 권한자용)
export const fetchAllPendingApplications = async (
    page: number = 0,
    size: number = 10,
    searchTerm: string = '',
    searchType: string = 'applicant',
    startDate: string = '',
    endDate: string = ''
): Promise<PaginationResponse> => {
    const path = `${API_BASE}/leave-application/pending/all?page=${page}&size=${size}`
        + `&searchTerm=${encodeURIComponent(searchTerm)}&searchType=${searchType}`
        + `${startDate ? `&startDate=${startDate}` : ''}`
        + `${endDate ? `&endDate=${endDate}` : ''}`;

    const response = await fetch(path, {
        headers: defaultHeaders,
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error('전체 진행중 휴가원 목록을 불러올 수 없습니다.');
    }

    const data = await response.json();
    return {
        content: data.content || [],
        totalElements: data.totalElements,
        totalPages: data.totalPages,
        currentPage: data.number,
        size: data.size
    } as PaginationResponse;
};

// 반려된 휴가원 조회 (HR 권한자: 전체 / 일반: 본인)
export const fetchRejectedApplications = async (
    page: number = 0,
    size: number = 10,
    searchTerm: string = '',
    searchType: string = 'applicant',
    startDate: string = '',
    endDate: string = ''
): Promise<PaginationResponse> => {
    const path = `${API_BASE}/leave-application/rejected?page=${page}&size=${size}`
        + `&searchTerm=${encodeURIComponent(searchTerm)}&searchType=${searchType}`
        + `${startDate ? `&startDate=${startDate}` : ''}`
        + `${endDate ? `&endDate=${endDate}` : ''}`;

    const response = await fetch(path, {
        headers: defaultHeaders,
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error('반려된 휴가원 목록을 불러올 수 없습니다.');
    }

    const data = await response.json();
    return {
        content: data.content || [],
        totalElements: data.totalElements,
        totalPages: data.totalPages,
        currentPage: data.number,
        size: data.size
    } as PaginationResponse;
};

// 새 휴가원 생성
export const createLeaveApplication = async () => {
    const response = await fetch(`${API_BASE}/leave-application`, {
        method: 'POST',
        headers: defaultHeaders,
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error('휴가원 생성에 실패했습니다.');
    }

    return response.json();
};

// 휴가원 저장/수정 (임시저장) - 수정된 payload 구조
// API 함수도 수정 (paste-3.txt의 saveLeaveApplication 함수 대체)
export const saveLeaveApplication = async (id: number, updateData: any) => {
    // 데이터 유효성 검사
    if (!updateData.leaveTypes || updateData.leaveTypes.length === 0) {
        throw new Error('휴가 종류를 선택해주세요.');
    }

    // 백엔드 LeaveApplicationUpdateFormRequestDto 구조에 맞는 payload 생성
    const payload = {
        applicantInfo: updateData.applicantInfo || {},
        substituteInfo: updateData.substituteInfo,
        departmentHeadInfo: updateData.departmentHeadInfo,
        leaveTypes: updateData.leaveTypes,
        leaveContent: updateData.leaveContent || {},
        flexiblePeriods: updateData.flexiblePeriods || [],
        consecutivePeriod: updateData.consecutivePeriod,
        totalDays: Math.max(updateData.totalDays, 0.5), // 최소값 보장
        applicationDate: updateData.applicationDate,
        signatures: updateData.signatures || {},
        currentApprovalStep: updateData.currentApprovalStep
    };

    const response = await fetch(`${API_BASE}/leave-application/${id}`, {
        method: 'PUT',
        headers: defaultHeaders,
        credentials: 'include',
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP ${response.status}: 휴가원 저장에 실패했습니다.`;
        throw new Error(errorMessage);
    }

    return response.json();
};

// 휴가원 승인
export const approveLeaveApplication = async (id: number, signatureDate: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/approve`, {
        method: 'PUT',
        headers: defaultHeaders,
        credentials: 'include',
        body: JSON.stringify({ signatureDate })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '휴가원 승인에 실패했습니다.');
    }

    return response.json();
};

// 휴가원 반려
export const rejectLeaveApplication = async (id: number, reason: string) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/reject`, {
        method: 'PUT',
        headers: defaultHeaders,
        credentials: 'include',
        body: JSON.stringify({ rejectionReason: reason })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '휴가원 반려에 실패했습니다.');
    }

    return response.json();
};

// 휴가원 전결 승인
export const finalApproveLeaveApplication = async (id: number) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/final-approve`, {
        method: 'PUT',
        headers: defaultHeaders,
        credentials: 'include'
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '휴가원 전결 승인에 실패했습니다.');
    }

    return response.json();
};

// 휴가원 삭제
export const deleteLeaveApplication = async (id: number) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}`, {
        method: 'DELETE',
        headers: defaultHeaders,
        credentials: 'include'
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '휴가원 삭제에 실패했습니다.');
    }

    return response.json();
};

// 서명 정보 조회
export const fetchLeaveApplicationSignatures = async (id: number) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/signatures`, {
        headers: defaultHeaders,
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error('서명 정보를 불러올 수 없습니다.');
    }

    return response.json();
};

// 서명 업데이트/취소
export const updateSignature = async (id: number, signatureType: string, signatureData: any) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/signature/${signatureType}`, {
        method: 'PUT',
        headers: defaultHeaders,
        credentials: 'include',
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
}) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/sign`, {
        method: 'PUT',
        headers: defaultHeaders,
        credentials: 'include',
        body: JSON.stringify(signRequest)
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '서명에 실패했습니다.');
    }

    return response.json();
};

// 대직자 후보 목록 조회
export const fetchSubstituteCandidates = async () => {
    const response = await fetch(`${API_BASE}/leave-application/substitute-candidates`, {
        headers: defaultHeaders,
        credentials: 'include'
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '대직자 후보 목록을 불러올 수 없습니다.');
    }

    return response.json();
};

// PDF 다운로드
export const downloadLeaveApplicationPdf = async (id: number) => {
    const response = await fetch(`${API_BASE}/leave-application/${id}/pdf`, {
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error('PDF 다운로드에 실패했습니다.');
    }

    return response.blob();
};

// 첨부파일 업로드 (단일 파일). 백엔드는 'file' 파라미터를 기대합니다.
export const uploadAttachment = async (leaveApplicationId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/leave-application/${leaveApplicationId}/attachments`, {
        method: 'POST',
        credentials: 'include',
        body: formData
        // Content-Type 헤더 없음 - FormData면 브라우저가 자동 설정
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '첨부파일 업로드에 실패했습니다.');
    }
    // AttachmentResponseDto 반환
    return response.json();
};

// 멀티 파일을 한 번에 업로드하려면 Promise.all로 여러 파일 호출
export const uploadAttachments = async (leaveApplicationId: number, files: File[]) => {
    const results = await Promise.all(files.map(f => uploadAttachment(leaveApplicationId, f)));
    return results;
};

// 첨부파일 삭제
export const deleteAttachmentApi = async (leaveApplicationId: number, attachmentId: number) => {
    const response = await fetch(`${API_BASE}/leave-application/${leaveApplicationId}/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: defaultHeaders,
        credentials: 'include'
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '첨부파일 삭제에 실패했습니다.');
    }

    return response.json();
};

// 첨부파일 다운로드 (blob)
export const downloadAttachmentApi = async (attachmentId: number) => {
    const response = await fetch(`${API_BASE}/leave-application/attachments/${attachmentId}/download`, {
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error('첨부파일 다운로드에 실패했습니다.');
    }

    return response.blob();
};
