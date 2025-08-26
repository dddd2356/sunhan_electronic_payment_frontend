import axios, { AxiosError }  from 'axios';
import { SignatureState } from '../../types/signature';

interface LeaveApplicationData {
    id: number;
    applicantId: string;
    applicantName: string; // 추가
    applicantDept: string; // 추가
    applicantPosition: string; // 추가
    applicantContact: string; // 추가
    applicantPhone: string; // 추가
    substituteId: string;
    substituteName: string; // 추가
    currentApproverId: string | null;
    finalApprovalStep?: string; // 어느 단계에서 전결했는지
    // 전결 관련 필드 추가
    isFinalApproved?: boolean;
    finalApproverId?: string;
    finalApprovalDate?: string;

    leaveType: string; // string으로 변경 (LeaveType enum 대신)
    leaveDetail: string; // 추가
    startDate: string; // LocalDate -> string
    endDate: string; // LocalDate -> string
    totalDays: number; // Integer -> number
    applicationDate: string; // LocalDate -> string
    status: string; // LeaveApplicationStatus -> string
    currentApprovalStep?: string;
    rejectionReason?: string;

    isApplicantSigned: boolean; // Boolean -> boolean
    isSubstituteApproved: boolean; // Boolean -> boolean
    isDeptHeadApproved: boolean; // Boolean -> boolean
    isHrStaffApproved: boolean; // Boolean -> boolean
    isCenterDirectorApproved: boolean; // Boolean -> boolean
    isAdminDirectorApproved: boolean; // Boolean -> boolean
    isCeoDirectorApproved: boolean; // Boolean -> boolean

    createdAt: string; // LocalDateTime -> string
    updatedAt: string; // LocalDateTime -> string

    formDataJson: string; // 서명 정보만 포함
    pdfUrl?: string; // 추가 (nullable)
    printable: boolean; // 추가
}

// 1) 반환 타입 정의 추가
export interface ContractSignatures {
    signatures: SignatureState;
    agreements: { [page: string]: 'agree' | 'disagree' | '' };
}
const API_BASE = process.env.REACT_APP_API_URL || '/api/v1';
// 사용자의 DB 저장 서명을 가져오는 함수 추가
export async function fetchUserSignatureFromDB(
    token: string,
    userId?: string
): Promise<string | null> {
    const baseEndpoint = userId
        ? `${API_BASE}/user/${userId}/signature`
        : `${API_BASE}/user/me/signature`;

    try {
        // 1) 먼저 JSON으로 내려오는 imageUrl or signatureUrl 시도
        const respJson = await axios.get(baseEndpoint, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const { imageUrl, signatureUrl } = respJson.data;
        if (imageUrl || signatureUrl) {
            return imageUrl ?? signatureUrl!;
        }

        // 2) 없으면 /signature/image 로 직접 PNG 바이너리 가져오기
        const respImg = await axios.get(
            userId
                ? `${API_BASE}/user/${userId}/signature/image`
                : `${API_BASE}/user/me/signature/image`,
            {
                headers: { Authorization: `Bearer ${token}` },
                responseType: "arraybuffer",
            }
        );
        // arraybuffer → Base64
        const b64 = Buffer.from(respImg.data, "binary").toString("base64");
        return `data:image/png;base64,${b64}`;
    } catch (e) {
        console.error("서명 이미지 조회 실패:", e);
        return null;
    }
}


export async function fetchSignaturesForUser(token: string, userId?: string): Promise<SignatureState> {
    const resp = await axios.get<any>(`${API_BASE}/user/me/signature`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    // 사용자의 DB 저장 서명 이미지 가져오기
    const userSignatureImage = await fetchUserSignatureFromDB(token, userId);

    // API 응답을 새로운 SignatureState 형식으로 변환
    const convertedData: SignatureState = {};

    Object.keys(resp.data).forEach(page => {
        if (page === 'page4') {
            // 기존 page4 데이터를 3개의 독립적인 섹션으로 분리
            const page4Data = resp.data[page].map((sig: any) => ({
                text: sig.text || '',
                imageUrl: sig.imageUrl || userSignatureImage, // DB 서명 이미지 사용
                isSigned: !!(sig.imageUrl || userSignatureImage)
            }));

            convertedData['page4_consent'] = [...page4Data];
            convertedData['page4_receipt'] = [...page4Data];
            convertedData['page4_final'] = [...page4Data];
        } else {
            convertedData[page] = resp.data[page].map((sig: any) => ({
                text: sig.text || '',
                imageUrl: sig.imageUrl || userSignatureImage, // DB 서명 이미지 사용
                isSigned: !!(sig.imageUrl || userSignatureImage)
            }));
        }
    });

    // 새로운 개별 서명 데이터가 있다면 우선 적용
    ['page4_consent', 'page4_receipt', 'page4_final'].forEach(pageKey => {
        if (resp.data[pageKey]) {
            convertedData[pageKey] = resp.data[pageKey].map((sig: any) => ({
                text: sig.text || '',
                imageUrl: sig.imageUrl || userSignatureImage, // DB 서명 이미지 사용
                isSigned: !!(sig.imageUrl || userSignatureImage)
            }));
        }
    });

    // 기본값 설정 (데이터가 없는 경우)
    ['page1', 'page2', 'page3', 'page4_consent', 'page4_receipt', 'page4_final'].forEach(pageKey => {
        if (!convertedData[pageKey]) {
            convertedData[pageKey] = [{
                text: '',
                imageUrl: userSignatureImage || undefined, // DB 서명 이미지 사용
                isSigned: !!userSignatureImage
            }];
        }
    });

    return convertedData;
}

export async function fetchSignaturesForContract(
    token: string,
    contractId: number
): Promise<ContractSignatures> {
    // 1) 계약서 DTO 가져오기
    const resp = await axios.get<{
        formDataJson: string;
        signatures?: SignatureState;
        agreements?: { [page: string]: 'agree' | 'disagree' | '' };
    }>(`${API_BASE}/employment-contract/${contractId}`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    // 2) formDataJson 파싱
    const form = JSON.parse(resp.data.formDataJson);

    // 3) 서명·동의 정보가 있으면 그대로, 없으면 빈 상태로 초기화
    const signatures: SignatureState = form.signatures || {
        page1: [{ text: '', imageUrl: undefined, isSigned: false }],
        page2: [{ text: '', imageUrl: undefined, isSigned: false }],
        page3: [{ text: '', imageUrl: undefined, isSigned: false }],
        page4_consent: [{ text: '', imageUrl: undefined, isSigned: false }],
        page4_receipt: [{ text: '', imageUrl: undefined, isSigned: false }],
        page4_final: [{ text: '', imageUrl: undefined, isSigned: false }],
    };

    const agreements = form.agreements || { page1: '', page4: '' };

    // 4) 두 데이터를 합쳐서 반환
    return { signatures, agreements };
}

// 4. 서명 정보 확인 함수
export async function checkUserSignatureExists(token: string, userId?: string): Promise<boolean> {
    try {
        const endpoint = userId ? `${API_BASE}/user/${userId}/signature-info` : `${API_BASE}/user/me/signature-info`;

        const response = await axios.get(endpoint, {
            headers: { Authorization: `Bearer ${token}` }
        });

        return response.data.exists || false;
    } catch (error) {
        console.error('서명 존재 확인 실패:', error);
        return false;
    }
}

/**
 * 휴가신청서 단위로 DB 저장된 서명 상태 로드
 * - 백엔드에서 formDataJson 내부에 signatures 객체를 관리하므로,
 * 휴가원 상세 정보를 가져온 후 formDataJson에서 파싱하여 반환합니다.
 * - 이 함수는 더 이상 별도의 API 호출을 하지 않습니다.
 */
export async function parseSignaturesFromLeaveApplicationData(
    applicationData: LeaveApplicationData,
    currentUserSignatureImageUrl: string | null // 현재 로그인된 사용자의 서명 이미지 URL
): Promise<SignatureState> {
    const defaultSignatureEntry = (imageUrl?: string | null) => ({
        text: '',
        imageUrl: imageUrl || undefined, // 기본 이미지 URL은 undefined로 설정
        isSigned: !!imageUrl, // imageUrl이 있으면 isSigned true
        signatureDate: undefined
    });

    try {
        if (!applicationData || !applicationData.formDataJson) {
            console.warn('Leave application data or formDataJson is missing.');
            // 이전에 수정된 LeaveApplicationData의 필드들 (creatorId, employeeId)은 formDataJson에 직접적으로 관련되지 않습니다.
            // 따라서 formDataJson이 없어도 기본 서명 상태를 반환하는 것은 변함 없습니다.
            return {
                applicant: [defaultSignatureEntry()],
                substitute: [defaultSignatureEntry()],
                departmentHead: [defaultSignatureEntry()],
                hrStaff: [defaultSignatureEntry()],
                centerDirector: [defaultSignatureEntry()],
                adminDirector: [defaultSignatureEntry()],
                ceoDirector: [defaultSignatureEntry()],
            };
        }

        // formDataJson이 null 또는 undefined일 경우를 대비하여 빈 객체 파싱하도록 변경
        const formData = JSON.parse(applicationData.formDataJson || '{}');
        const rawSignatures = formData.signatures || {}; // formDataJson 내의 signatures 객체

        const convertedSignatures: SignatureState = {};

        const signatureTypes: Array<keyof SignatureState> = [
            'applicant',
            'substitute',
            'departmentHead',
            'hrStaff',
            'centerDirector',
            'adminDirector',
            'ceoDirector'
        ];

        signatureTypes.forEach(type => {
            if (rawSignatures[type] && Array.isArray(rawSignatures[type])) {
                convertedSignatures[type] = rawSignatures[type].map((sig: any) => ({
                    text: sig.text || '',
                    imageUrl: sig.imageUrl || undefined, // DB에 저장된 URL 사용
                    isSigned: !!sig.isSigned, // 백엔드에서 isSigned 필드를 전달한다고 가정
                    signatureDate: sig.signatureDate ?? undefined
                }));
            } else {
                // 해당 타입의 서명 데이터가 없는 경우 기본값 설정
                convertedSignatures[type] = [defaultSignatureEntry()];
            }
        });

        return convertedSignatures;

    } catch (error) {
        console.error('휴가원 서명 정보 파싱 실패:', error);
        // 에러 시에도 기본 상태 반환하여 앱이 크래시되지 않도록 함
        return {
            applicant: [defaultSignatureEntry()],
            substitute: [defaultSignatureEntry()],
            departmentHead: [defaultSignatureEntry()],
            hrStaff: [defaultSignatureEntry()],
            centerDirector: [defaultSignatureEntry()],
            adminDirector: [defaultSignatureEntry()],
            ceoDirector: [defaultSignatureEntry()],
        };
    }
}

// 백엔드에 서명 정보를 업데이트하는 API 함수 추가
// 이 함수는 서명 클릭 시 호출되어 formDataJson을 업데이트하는 역할을 합니다.
export async function updateLeaveApplicationSignature(
    leaveApplicationId: number,
    signatureType: string, // signatureKey -> signatureType으로 변경
    signatureImageUrl: string | null, // null이면 서명 취소
    token: string
): Promise<any> {
    try {
        // 서명 취소인 경우와 서명 추가인 경우를 구분하여 payload 구성
        const payload = signatureImageUrl ? {
            text: '승인',
            imageUrl: signatureImageUrl,
            isSigned: true
        } : {
            text: '',
            imageUrl: null,
            isSigned: false
        };

        const response = await axios.put(
            `${API_BASE}/leave-application/${leaveApplicationId}/signature/${signatureType}`,
            payload, // Map<String, Object> signatureData에 해당
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error(`서명 업데이트 실패 (${signatureType}):`, error);
        throw error;
    }
}