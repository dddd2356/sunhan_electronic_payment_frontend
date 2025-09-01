import React, { useState, useEffect } from 'react';
import { uploadAttachments, deleteAttachmentApi, downloadAttachmentApi } from '../../apis/leaveApplications';
import "./style.css";

type AttachmentDto = {
    id: number;
    originalFileName: string;
    fileType: string;
    fileSize: number;
};

interface Props {
    leaveApplicationId: number;
    token: string;
    initialAttachments?: AttachmentDto[];
    onChange?: (attachments: AttachmentDto[]) => void;
    disabled?: boolean; // 읽기전용 제어
    readOnly?: boolean;
}

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/(1024*1024)).toFixed(1)} MB`;
};

const prefixAttachmentName = (att: AttachmentDto) => {
    // 접두사 + id 로 중복 방지: attachment_{id}_{originalFileName}
    const safeName = att.originalFileName || 'file';
    return `attachment_${att.id}_${safeName}`;
};

const LeaveAttachments: React.FC<Props> = ({ leaveApplicationId, token, initialAttachments = [], onChange, disabled = false, readOnly = false }) => {
    const [attachments, setAttachments] = useState<AttachmentDto[]>(initialAttachments);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setAttachments(initialAttachments || []);
    }, [initialAttachments]);

    const handleFiles = async (files: FileList | null) => {
        if (disabled || readOnly) return;
        if (!files || files.length === 0) return;
        setError(null);
        setUploading(true);
        try {
            const fileArray = Array.from(files);
            const tooLarge = fileArray.find(f => f.size > 10*1024*1024);
            if (tooLarge) throw new Error(`${tooLarge.name} 파일이 너무 큽니다. (최대 10MB)`);

            const uploaded = await uploadAttachments(leaveApplicationId, fileArray, token);
            const newList = [...attachments, ...uploaded];
            setAttachments(newList);
            onChange?.(newList);
        } catch (e: any) {
            setError(e.message || '업로드 중 오류가 발생했습니다.');
        } finally {
            setUploading(false);
            const input = document.querySelector<HTMLInputElement>('input[type="file"][data-leave-attach-id="' + leaveApplicationId + '"]');
            if (input) input.value = '';
        }
    };

    const handleDelete = async (attachmentId: number) => {
        if (disabled || readOnly) return;
        setError(null);
        try {
            await deleteAttachmentApi(leaveApplicationId, attachmentId, token);
            const newList = attachments.filter(a => a.id !== attachmentId);
            setAttachments(newList);
            onChange?.(newList);
        } catch (e: any) {
            setError(e.message || '삭제 중 오류가 발생했습니다.');
        }
    };

    const handleDownload = async (attachmentId: number, att: AttachmentDto) => {
        try {
            const blob = await downloadAttachmentApi(attachmentId, token);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // 접두사가 붙은 파일명으로 다운로드
            a.download = prefixAttachmentName(att);
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e: any) {
            setError(e.message || '다운로드 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className="leave-attachments">
            {/* 라벨과 파일 입력을 같은 줄에 배치 */}
            {!readOnly ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
                    <label htmlFor={`file-input-${leaveApplicationId}`}>첨부파일</label>
                    <input
                        id={`file-input-${leaveApplicationId}`}
                        className="upload-input"
                        type="file"
                        multiple
                        data-leave-attach-id={leaveApplicationId}
                        onChange={(e) => handleFiles(e.target.files)}
                        disabled={uploading || disabled}
                    />
                </div>
            ) : (
                <div style={{ marginBottom: '8px' }}>
                    <label>첨부파일</label>
                </div>
            )}

            {uploading && <div className="uploading">업로드 중...</div>}
            {error && <div className="attach-error">{error}</div>}

            <ul className="attachment-list">
                {attachments.length === 0 && <li className="attachment-empty">첨부파일이 없습니다.</li>}
                {attachments.map(att => (
                    <li key={att.id} className="attachment-item">
                        <button
                            type="button"
                            className="file-link"
                            onClick={() => !uploading && handleDownload(att.id, att)}
                            disabled={uploading}
                            title={`다운로드: ${prefixAttachmentName(att)}`}
                        >
                            {prefixAttachmentName(att)}
                        </button>

                        <span className="attachment-size">({formatSize(att.fileSize)})</span>

                        {/* DRAFT 상태일 때만 삭제 버튼 표시 */}
                        {!readOnly && (
                            <button
                                type="button"
                                className="attachment-button btn-delete"
                                onClick={() => handleDelete(att.id)}
                                disabled={disabled || uploading}
                            >
                                삭제
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default LeaveAttachments;