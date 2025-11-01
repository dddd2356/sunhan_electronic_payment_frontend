import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import "./style.css"

interface RejectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit?: (reason: string) => void;
    initialReason?: string;
    isReadOnly?: boolean;
    title?: string;
    placeholder?: string;
}

const RejectModal: React.FC<RejectModalProps> = ({
                                                     isOpen,
                                                     onClose,
                                                     onSubmit,
                                                     initialReason = '',
                                                     isReadOnly = false,
                                                     title = "반려 사유",
                                                     placeholder = "반려 사유를 입력해주세요..."
                                                 }) => {
    const [reason, setReason] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            setReason(initialReason);
        }
    }, [isOpen, initialReason]);

    const handleSubmit = () => {
        if (!reason.trim() && !isReadOnly) {
            alert('반려 사유를 입력해주세요.');
            return;
        }
        if (onSubmit) {
            onSubmit(reason);
        }
        if (isReadOnly) {
            onClose();
        }
    };

    const handleClose = () => {
        if (!isReadOnly) {
            setReason('');
        }
        onClose();
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            handleClose();
        }
        if (e.key === 'Enter' && e.ctrlKey && !isReadOnly) {
            handleSubmit();
        }
    };

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            handleClose();
        }
    };

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setReason(e.target.value);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={handleOverlayClick} onKeyDown={handleKeyPress}>
            <div className="modal-content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button onClick={handleClose} className="close-button">
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    <textarea
                        value={reason}
                        onChange={handleTextareaChange}
                        placeholder={isReadOnly ? "" : placeholder}
                        rows={6}
                        className="reason-textarea"
                        readOnly={isReadOnly}
                        maxLength={500}
                        autoFocus={!isReadOnly}
                    />
                    {!isReadOnly && (
                        <div className="character-count">
                            {reason.length}/500
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button onClick={handleClose} className="btn-cancel">
                        {isReadOnly ? '닫기' : '취소'}
                    </button>
                    {!isReadOnly && (
                        <button
                            onClick={handleSubmit}
                            className="btn-submit"
                            disabled={!reason.trim()}
                        >
                            {title.includes('취소') ? '취소하기' : '반려하기'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RejectModal;