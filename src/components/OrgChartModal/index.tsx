import React, { useState } from 'react';
import OrganizationChart from '../OrganizationChart';
import './style.css';

interface OrgChartModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (users: {id: string, name: string}[]) => void;
    multiSelect?: boolean;
    allDepartments?: boolean;
}

const OrgChartModal: React.FC<OrgChartModalProps> = ({
                                                         isOpen,
                                                         onClose,
                                                         onSelect,
                                                         multiSelect = false,
                                                         allDepartments = false
                                                     }) => {
    const [selectedUsers, setSelectedUsers] = useState<{id: string, name: string}[]>([]); // ✅ 객체 배열
    if (!isOpen) return null;
    const handleUserSelect = (userId: string, userName: string, jobLevel: string) => {
        if (multiSelect) {
            setSelectedUsers(prev => {
                if (prev.some(u => u.id === userId)) {
                    return prev.filter(u => u.id !== userId);
                }
                return [...prev, {id: userId, name: userName}];
            });
        } else {
            setSelectedUsers([{id: userId, name: userName}]);
        }
    };
    const handleConfirm = () => {
        if (selectedUsers.length === 0) {
            alert('인원을 선택해주세요.');
            return;
        }
        onSelect(selectedUsers); // ✅ 객체 배열 전달
        setSelectedUsers([]);
        onClose();
    };

    return (
        <div className="org-modal-overlay" onClick={onClose}>
            <div className="org-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="org-modal-header">
                    <h2>인원 선택</h2>
                    <button className="org-modal-close" onClick={onClose}>×</button>
                </div>

                <div className="org-modal-body">
                    <OrganizationChart
                        onUserSelect={handleUserSelect}
                        selectedUserId={multiSelect ? undefined : selectedUsers[0]?.id}
                        selectedUserIds={selectedUsers.map(u => u.id)}
                        multiSelect={multiSelect}
                        allDepartments={allDepartments}  // ✅ prop 전달
                    />
                    {multiSelect && selectedUsers.length > 0 && (
                        <div className="org-selected-info">
                            선택된 인원:{selectedUsers.length}명
                        </div>
                    )}
                </div>

                <div className="org-modal-footer">
                    <button className="org-btn-cancel" onClick={onClose}>
                        취소
                    </button>
                    <button className="org-btn-confirm" onClick={handleConfirm}>
                        확인
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OrgChartModal;