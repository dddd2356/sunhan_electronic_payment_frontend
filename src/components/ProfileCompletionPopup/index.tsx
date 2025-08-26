// src/components/ProfileCompletionPopup.tsx
import React, {useState, useEffect, useRef} from 'react';
import './style.css';
import SignatureCanvas from "react-signature-canvas";


interface ProfileCompletionPopupProps {
    isOpen: boolean;
    onClose: () => void;
    onUpdateSuccess: (updatedUser: any) => void; // 업데이트된 사용자 객체를 전달하도록 수정
    userId: string;
    initialPhone?: string | null;
    initialAddress?: string | null;
    requirePasswordChange?: boolean;
}

const ProfileCompletionPopup: React.FC<ProfileCompletionPopupProps> = ({
                                                                           isOpen,
                                                                           onClose,
                                                                           onUpdateSuccess,
                                                                           userId,
                                                                           initialPhone,
                                                                           initialAddress,
                                                                           requirePasswordChange = false,
                                                                       }) => {
    const [phone, setPhone] = useState(initialPhone || '');
    const [address, setAddress] = useState(initialAddress || '');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSignature, setShowSignature] = useState(false);
    const sigCanvas = useRef<SignatureCanvas>(null);
    const [sigError, setSigError] = useState<string>('');

    useEffect(() => {
        setPhone(initialPhone || '');
        setAddress(initialAddress || '');
        // 팝업이 다시 열릴 때 비밀번호 필드를 초기화
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setError('');
    }, [initialPhone, initialAddress, isOpen]); // isOpen이 변경될 때도 초기화

    if (!isOpen) {
        return null;
    }

    //npm install react-signature-canvas 설치 필요함
    const handleSaveSignature = async () => {
        if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
            setSigError('서명을 해주세요.');
            return;
        }
        setSigError('');
        // 캔버스를 Blob으로 변환
        sigCanvas.current.getCanvas().toBlob(async (blob) => {
            if (!blob) return;
            const form = new FormData();
            form.append('file', blob, `${userId}_signature.png`);
            try {
                const resp = await fetch(`/api/v1/user/${userId}/signature`, {
                    method: 'POST',
                    body: form,
                    credentials: 'include',
                });
                if (!resp.ok) throw new Error('서명 업로드 실패');
                alert('서명이 등록되었습니다.');
                setShowSignature(false);
            } catch (e: any) {
                setSigError(e.message);
            }
        }, 'image/jpg');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (requirePasswordChange || (newPassword && newPassword.length > 0)) {
            if (newPassword !== confirmNewPassword) {
                setError('새 비밀번호가 일치하지 않습니다.');
                return;
            }
            if (newPassword.length < 4) {
                setError('새 비밀번호는 최소 4자 이상이어야 합니다.');
                return;
            }
            if (!currentPassword || currentPassword.trim() === '') {
                setError('비밀번호 변경을 위해 현재 비밀번호를 입력해 주세요.');
                return;
            }
        }

        setLoading(true);
        try {
            const requestBody: {
                phone?: string;
                address?: string;
                currentPassword?: string;
                newPassword?: string;
            } = {};

            // phone과 address는 값이 있을 경우에만 포함
            if (phone.trim() !== '') requestBody.phone = phone.trim();
            if (address.trim() !== '') requestBody.address = address.trim();

            // newPassword가 입력되었을 때만 currentPassword와 newPassword 포함
            if (newPassword.trim() !== '') {
                requestBody.currentPassword = currentPassword.trim();
                requestBody.newPassword = newPassword.trim();
            }

            const response = await fetch(`/api/v1/user/update-profile/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include', // 중요: 쿠키를 포함하여 요청을 보낼 때 필요
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || '프로필 업데이트에 실패했습니다.');
            }

            const updatedUser = await response.json(); // 업데이트된 사용자 객체를 받음
            alert('프로필 정보가 성공적으로 업데이트되었습니다.');
            onUpdateSuccess(updatedUser); // 업데이트 성공 콜백 호출, 업데이트된 사용자 정보 전달
            onClose(); // 팝업 닫기

        } catch (err: any) {
            setError(err.message || '알 수 없는 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };



    return (
        <div className="popup-overlay">
            <div className="popup-content">
                <h2>프로필 정보 업데이트{<span style={{color: 'red'}}>(필수)</span>}</h2>
                <p>{requirePasswordChange ? '보안을 위해 비밀번호 및 필수 정보를 업데이트해 주세요.' : '필요한 프로필 정보를 업데이트해 주세요.'}</p>
                {error && <p className="error-message">{error}</p>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="phone">핸드폰 번호:</label>
                        <input
                            type="text"
                            id="phone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="예: 062-466-1000"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="address">주소:</label>
                        <input
                            type="text"
                            id="address"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="예: 광주광역시 서구 무진대로 975(광천동)"
                        />
                    </div>

                    <div className="password-change-section">
                        <h3>비밀번호 변경 {requirePasswordChange && <span style={{color: 'red'}}>(필수)</span>}</h3>
                        <div className="form-group">
                            <label htmlFor="currentPassword">현재 비밀번호:</label>
                            <input
                                type="password"
                                id="currentPassword"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required={requirePasswordChange || newPassword.length > 0}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="newPassword">새 비밀번호:</label>
                            <input
                                type="password"
                                id="newPassword"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required={requirePasswordChange}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="confirmNewPassword">새 비밀번호 확인:</label>
                            <input
                                type="password"
                                id="confirmNewPassword"
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                                required={requirePasswordChange || newPassword.length > 0}
                            />
                        </div>
                    </div>

                    <h3>서명 등록</h3>
                    {/* 1) 서명 등록 버튼 */}
                    <div className="form-group" style={{textAlign:"center"}}>
                        <button
                            type="button"
                            onClick={() => setShowSignature(true)}
                            className="signature-btn"
                        >
                            서명 등록하기
                        </button>
                    </div>

                    {/* 2) 서명 캔버스 모달 */}
                    {showSignature && (
                        <div className="signature-modal">
                            <h3>서명을 해주세요</h3>
                            <SignatureCanvas
                                ref={sigCanvas}
                                penColor="black"
                                canvasProps={{width: 400, height: 200, className: 'sigCanvas'}}
                            />
                            {sigError && <p className="error-message">{sigError}</p>}
                            <div className="signature-actions">
                                <button type="button" onClick={() => sigCanvas.current?.clear()}>
                                    지우기
                                </button>
                                <button type="button" onClick={handleSaveSignature}>
                                    저장
                                </button>
                                <button type="button" onClick={() => setShowSignature(false)}>
                                    취소
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="popup-actions">
                        <button type="submit" disabled={loading}>
                            {loading ? '저장 중...' : '정보 업데이트'}
                        </button>
                        {!requirePasswordChange && (
                            <button type="button" onClick={onClose} disabled={loading}>닫기</button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ProfileCompletionPopup;