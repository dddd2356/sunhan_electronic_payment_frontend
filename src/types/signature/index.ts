export interface SignatureData {
    text: string;
    imageUrl?: string;
    isSigned: boolean;
    signatureDate?: string;
    isSkipped?: boolean;
    signerName?: string;
    isFinalApproval?: boolean;
}

export interface SignatureState {
    [page: string]: SignatureData[];
}