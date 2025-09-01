import axios from '../../views/Authentication/axiosInstance';
import {AxiosResponse} from 'axios';

/** 타입 정의 (컴포넌트와 공유 가능하도록 간단히 작성) */
export interface Contract {
    id: number;
    creatorId: string;
    employeeId: string;
    status: string;
    formDataJson: string;
    pdfUrl?: string;
    jpgUrl?: string;
    createdAt: string;
    updatedAt: string;
    employeeName?: string;
    creatorName?: string;
    rejectionReason?: string;
}

export interface User {
    id: string;
    name: string;
    jobLevel: string; // 0: 직원, 1 : 부서장, 2: 진료센터장, 3:원장, 4 : 행정원장, 5 : 대표원장, 6 : Admin
    role: string;
    userId?: string;
    userName?: string;
    deptCode?: string;
    jobType?: string;
    phone?: string | null;
    address?: string | null;
    useFlag?: string;
    permissions?: string[];
}

export interface SignatureState {
    page1: Array<{ text: string; imageUrl?: string; isSigned: boolean }>;
    page2: Array<{ text: string; imageUrl?: string; isSigned: boolean }>;
    page3: Array<{ text: string; imageUrl?: string; isSigned: boolean }>;
    page4_consent: Array<{ text: string; imageUrl?: string; isSigned: boolean }>;
    page4_receipt: Array<{ text: string; imageUrl?: string; isSigned: boolean }>;
    page4_final: Array<{ text: string; imageUrl?: string; isSigned: boolean }>;
}

export interface ContractSignatures {
    signatures: SignatureState;
    agreements: { [page: string]: 'agree' | 'disagree' | '' };
}
const API_BASE = process.env.REACT_APP_API_URL || '/api/v1';

/** 유틸: 토큰이 있으면 Authorization 헤더 반환 */
const authHeader = (token?: string) =>
    token ? {headers: {Authorization: `Bearer ${token}`}} : undefined;

/** ---------- 조회 (GET) ---------- */

/** 단건 조회: response.data (Contract) 반환 */
export const fetchContract = async (id: number, token?: string): Promise<Contract> => {
    const resp = await axios.get<Contract>(`${API_BASE}/employment-contract/${id}`, authHeader(token));
    return resp.data;
};

/** 목록 조회: 기본(in-progress) 또는 completed 선택 가능 */
export const fetchContracts = async (completed = false, token?: string): Promise<Contract[]> => {
    const path = completed ? `${API_BASE}/employment-contract/completed` : `${API_BASE}/employment-contract`;
    const resp = await axios.get<Contract[]>(path, authHeader(token));
    return resp.data;
};

/** 사용자(조직도) 목록 조회 */
export const fetchUsers = async (token?: string): Promise<User[]> => {
    const resp = await axios.get<User[]>(`${API_BASE}/user/all`, authHeader(token));
    const data = resp.data || [];
    // 서버가 이미 재직자만 내려주면 filter는 무해합니다.
    const activeOnly = data.filter(u => String(u.useFlag ?? '1') === '1');
    return resp.data;
};

/** 현재 사용자 정보 조회 */
export const fetchCurrentUser = async (token?: string): Promise<User> => {
    const resp = await axios.get<User>(`${API_BASE}/user/me`, authHeader(token));
    return resp.data;
};

/** 사용자 서명 이미지 조회 */
export const fetchUserSignature = async (token?: string): Promise<{ imageUrl?: string; signatureUrl?: string }> => {
    const resp = await axios.get<{
        imageUrl?: string;
        signatureUrl?: string
    }>(`${API_BASE}/user/me/signature`, authHeader(token));
    return resp.data;
};

/** 계약서 서명 데이터 조회 */
export const fetchSignaturesForContract = async (token: string, contractId: number): Promise<ContractSignatures> => {
    const resp = await axios.get<ContractSignatures>(`${API_BASE}/employment-contract/${contractId}/signatures`, authHeader(token));
    return resp.data;
};

/** ---------- 생성 (POST) ---------- */

/** 계약서 생성: 새 Contract 반환 (response.data) */
export const createContract = async (employeeId: string, token?: string): Promise<Contract> => {
    const resp = await axios.post<Contract>(`${API_BASE}/employment-contract`, {employeeId}, authHeader(token));
    return resp.data;
};

/** ---------- 상태 변경 (PUT / POST) ---------- */
/** 주의: 아래 함수들은 전체 AxiosResponse를 반환합니다. (요청자 요구) */

/** 계약서 업데이트 — formData 객체는 JSON 직렬화하여 formDataJson에 담아 보냄 */
export const updateContract = async (
    id: number,
    saveData: any,
    token?: string
): Promise<AxiosResponse<any>> => {
    const payload = {formDataJson: JSON.stringify(saveData)};
    return axios.put(`${API_BASE}/employment-contract/${id}`, payload, authHeader(token));
};

/** 서명 요청 (직원 서명 등) — 전체 AxiosResponse 반환 */
export const signContract = async (
    id: number,
    formData: any,
    token?: string
): Promise<AxiosResponse<any>> => {
    const payload = {formDataJson: JSON.stringify(formData)};
    return axios.put(`${API_BASE}/employment-contract/${id}/sign`, payload, authHeader(token));
};

/** 발송(관리자가 직원에게 발송) — 전체 AxiosResponse 반환 */
export const sendContract = async (id: number, token?: string): Promise<AxiosResponse<any>> => {
    return axios.put(`${API_BASE}/employment-contract/${id}/send`, {}, authHeader(token));
};

/** 반송(관리자에게 반송) — 전체 AxiosResponse 반환 */
export const returnToAdmin = async (id: number, reason: string, token?: string): Promise<AxiosResponse<any>> => {
    return axios.put(`${API_BASE}/employment-contract/${id}/return`, {reason}, authHeader(token));
};

/** 승인(완료) — 전체 AxiosResponse 반환 */
export const approveContract = async (id: number, token?: string): Promise<AxiosResponse<any>> => {
    return axios.put(`${API_BASE}/employment-contract/${id}/approve`, {}, authHeader(token));
};

/** ---------- 파일 다운로드 ---------- */

/** 계약서 파일 다운로드 (PDF/JPG) */
export const downloadContract = async (id: number, type: 'pdf' | 'jpg', token?: string): Promise<Blob> => {
    const resp = await axios.get(`${API_BASE}/employment-contract/${id}/${type}`, {
        ...authHeader(token),
        responseType: 'blob'
    });
    return resp.data;
};

export const deleteContract = async (contractId: number, token: string): Promise<AxiosResponse<{ message: string }>> => {
    return axios.delete(`${API_BASE}/employment-contract/${contractId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
};