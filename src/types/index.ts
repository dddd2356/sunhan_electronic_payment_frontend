import {ResponseDto} from "../apis/response";

type ResponseBody <T> = T | ResponseDto | null;

export type{
    ResponseBody,
}

export interface ContractResponseDto {
    id: number;
    creatorId: string;
    employeeId: string;
    status: string;
    formDataJson: string;
    pdfUrl?: string;
    jpgUrl?: string;
    createdAt: string;
    updatedAt: string;
}

export interface User {
    userId: string;
    userName: string;
    role: number;
}