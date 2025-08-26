export interface SignatureData {
    text: string;
    imageUrl?: string;
    isSigned: boolean;
    signatureDate?: string;
}

export interface SignatureState {
    [page: string]: SignatureData[];
}