import axios from 'axios';

const API_BASE = '/api/v1/positions';

export interface Position {
    id: number;
    deptCode: string;
    positionName: string;
    displayOrder: number;
    isActive: boolean;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * 부서별 직책 목록 조회
 */
export const fetchPositionsByDept = async (
    deptCode: string,
    token: string
): Promise<Position[]> => {
    const response = await axios.get(`${API_BASE}/department/${deptCode}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

/**
 * 직책 생성
 */
export const createPosition = async (
    deptCode: string,
    positionName: string,
    displayOrder: number | null,
    token: string
): Promise<Position> => {
    const response = await axios.post(
        API_BASE,
        { deptCode, positionName, displayOrder },
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
};

/**
 * 직책 수정
 */
export const updatePosition = async (
    positionId: number,
    positionName: string,
    displayOrder: number | null,
    token: string
): Promise<Position> => {
    const response = await axios.put(
        `${API_BASE}/${positionId}`,
        { positionName, displayOrder },
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
};

/**
 * 직책 삭제
 */
export const deletePosition = async (
    positionId: number,
    token: string
): Promise<void> => {
    await axios.delete(`${API_BASE}/${positionId}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
};

/**
 * 직책 순서 변경
 */
export const reorderPositions = async (
    deptCode: string,
    positionIds: number[],
    token: string
): Promise<void> => {
    await axios.put(
        `${API_BASE}/department/${deptCode}/reorder`,
        { positionIds },
        { headers: { Authorization: `Bearer ${token}` } }
    );
};