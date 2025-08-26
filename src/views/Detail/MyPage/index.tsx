import React, {useEffect, useState, useRef} from 'react';
import {useCookies} from 'react-cookie';
import Layout from '../../../components/Layout';
import SignatureCanvas from 'react-signature-canvas';
import './style.css';

interface User {
    id?: string;
    userId?: string;
    userName?: string;
    phone?: string | null;
    address?: string | null;
    role?: string;
    jobLevel?: string;
    deptCode?: string;
    email?: string;
    signatureUrl?: string | null;
    signimage?: string | null;  // base64 이미지 문자열
    signpath?: string | null;   // 이미지 경로 URL
}

const MyPage: React.FC = () => {
    const [cookies] = useCookies(['accessToken']);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isEditMode, setIsEditMode] = useState(false);

    const [formData, setFormData] = useState({
        userName: '',
        phone: '',
        address: '',
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
    });

    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [sigError, setSigError] = useState('');
    const sigCanvas = useRef<SignatureCanvas>(null);

    const getPositionByJobLevel = (jobLevel: string | number | undefined): string => {
        const level = String(jobLevel);
        switch (level) {
            case '0':
                return '사원';
            case '1':
                return '부서장';
            case '2':
                return '진료센터장';
            case '3':
                return '원장';
            case '4':
                return '행정원장';
            case '5':
                return '대표원장';
            default:
                return '';
        }
    };

    useEffect(() => {
        fetchMyProfile();
    }, []);

    const fetchMyProfile = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/user/me', {
                headers: {
                    'Content-Type': 'application/json',
                    ...(cookies.accessToken ? {Authorization: `Bearer ${cookies.accessToken}`} : {})
                },
                credentials: 'include'
            });
            if (!res.ok) throw new Error('사용자 정보를 불러올 수 없습니다.');
            const data = await res.json();
            console.log('profile data:', data);
            const userData = {
                id: data.id || data.userId,
                userId: data.userId || data.id,
                userName: data.userName || data.name,
                phone: data.phone || '',
                address: data.address || '',
                role: data.role,
                jobLevel: data.jobLevel,
                deptCode: data.deptCode,
                email: data.email,
                signatureUrl: data.signatureUrl || '',
                signimage: data.signimage || null, // 서버 응답의 signimage 필드 사용
                signpath: data.signpath || null,   // 서버 응답의 signpath 필드 사용
            };
            setUser(userData);
            setFormData(prev => ({
                ...prev,
                userName: userData.userName || '',
                phone: userData.phone || '',
                address: userData.address || ''
            }));
        } catch (e: any) {
            setError(e.message || '프로필 로드 실패');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const {name, value} = e.target;
        setFormData(prev => ({...prev, [name]: value}));
    };

    const handleSave = async () => {
        if (formData.newPassword && formData.newPassword !== formData.confirmNewPassword) {
            alert('새 비밀번호가 일치하지 않습니다.');
            return;
        }
        if (formData.newPassword && formData.newPassword.length < 4) {
            alert('새 비밀번호는 최소 4자 이상이어야 합니다.');
            return;
        }

        try {
            const body: any = {
                userName: formData.userName,
                phone: formData.phone,
                address: formData.address
            };
            if (formData.newPassword) {
                body.currentPassword = formData.currentPassword;
                body.newPassword = formData.newPassword;
            }

            const res = await fetch(`/api/v1/user/update-profile/${user?.userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(cookies.accessToken ? {Authorization: `Bearer ${cookies.accessToken}`} : {})
                },
                credentials: 'include',
                body: JSON.stringify(body)
            });

            if (!res.ok) throw new Error('프로필 수정 실패');
            const updated = await res.json();
            setUser(prev => prev ? {...prev, ...updated} : updated);
            setIsEditMode(false);
        } catch (e: any) {
            alert(e.message);
        }
    };

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
            form.append('file', blob, `${user?.userId}_signature.png`);
            try {
                const resp = await fetch(`/api/v1/user/${user?.userId}/signature`, {
                    method: 'POST',
                    body: form,
                    credentials: 'include',
                });
                if (!resp.ok) throw new Error('서명 업로드 실패');
                alert('서명이 등록되었습니다.');
                setShowSignatureModal(false);
                window.location.reload();
            } catch (e: any) {
                setSigError(e.message);
            }
        }, 'image/jpg');
    };

    return (
        <Layout>
            <div className="mypage-container">
                <div className="mypage-header">
                    <h1 className="mypage-title">내 프로필</h1>
                    <div className="button-group">
                        {!isEditMode ? (
                            <button className="create-button" onClick={() => setIsEditMode(true)}>
                                프로필 수정
                            </button>
                        ) : (
                            <>
                                <button className="create-button" onClick={handleSave}>
                                    저장
                                </button>
                                <button className="cancel-button" onClick={() => setIsEditMode(false)}>
                                    취소
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="loading-state">로딩 중...</div>
                ) : error ? (
                    <div className="error-state">{error}</div>
                ) : user ? (
                    <div className="profile-content">
                        <div className="profile-grid">
                            <div className="profile-field">
                                <div className="field-label">이름</div>
                                <div className="field-value">
                                    {isEditMode ? (
                                        <input
                                            className="profile-input"
                                            name="userName"
                                            value={formData.userName}
                                            onChange={handleChange}
                                        />
                                    ) : (
                                        user.userName || '-'
                                    )}
                                </div>
                            </div>

                            <div className="profile-field">
                                <div className="field-label">아이디</div>
                                <div className="field-value">{user.userId || '-'}</div>
                            </div>

                            <div className="profile-field">
                                <div className="field-label">핸드폰</div>
                                <div className="field-value">
                                    {isEditMode ? (
                                        <input
                                            className="profile-input"
                                            name="phone"
                                            value={formData.phone}
                                            onChange={handleChange}
                                        />
                                    ) : (
                                        user.phone || '-'
                                    )}
                                </div>
                            </div>

                            <div className="profile-field">
                                <div className="field-label">주소</div>
                                <div className="field-value">
                                    {isEditMode ? (
                                        <input
                                            className="profile-input"
                                            name="address"
                                            value={formData.address}
                                            onChange={handleChange}
                                        />
                                    ) : (
                                        user.address || '-'
                                    )}
                                </div>
                            </div>

                            <div className="profile-field">
                                <div className="field-label">부서 / 직급</div>
                                <div className="field-value">
                                    {user.deptCode || '-'} {user.jobLevel ? ` / ${getPositionByJobLevel(user.jobLevel)}` : ''}
                                </div>
                            </div>

                            <div className="profile-field signature-field">
                                <div className="field-label">서명</div>
                                <div className="field-value mypage-signature-container">
                                    {user.signimage ? (
                                        <img
                                            src={`data:image/png;base64,${user.signimage.replace(/\s/g, '')}`}
                                            alt="signature"
                                            className="mypage-signature-image"
                                            style={{
                                                borderRadius: 4,
                                                border: "solid 1  #ddd",
                                                backgroundColor: "#fff"
                                            }}
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = '';
                                                console.error('base64 이미지 로드 실패');
                                                alert('서명 이미지 로드에 실패했습니다.');
                                            }}
                                        />
                                    ) : user.signpath ? (
                                        <img
                                            src={`${process.env.REACT_APP_SERVER_URL || ''}${user.signpath}`}
                                            alt="signature"
                                            className="mypage-signature-image signature-path"
                                            style={{
                                                borderRadius: 4,
                                                border: "solid 1  #ddd",
                                                backgroundColor: "#fff"
                                            }}
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = '';
                                                console.error('서버 이미지 로드 실패');
                                                alert('서명 이미지 로드에 실패했습니다.');
                                            }}
                                        />
                                    ) : (
                                        <div className="mypage-no-signature">등록된 서명이 없습니다.</div>
                                    )}
                                    {isEditMode && (
                                        <button
                                            className="mypage-signature-button"
                                            onClick={() => setShowSignatureModal(true)}
                                        >
                                            서명 등록/수정
                                        </button>
                                    )}
                                </div>
                            </div>

                            {isEditMode && (
                                <>
                                    <div className="profile-field">
                                        <div className="field-label">현재 비밀번호</div>
                                        <div className="field-value">
                                            <input
                                                className="profile-input"
                                                type="password"
                                                name="currentPassword"
                                                value={formData.currentPassword}
                                                onChange={handleChange}
                                            />
                                        </div>
                                    </div>

                                    <div className="profile-field">
                                        <div className="field-label">새 비밀번호</div>
                                        <div className="field-value">
                                            <input
                                                className="profile-input"
                                                type="password"
                                                name="newPassword"
                                                value={formData.newPassword}
                                                onChange={handleChange}
                                            />
                                        </div>
                                    </div>

                                    <div className="profile-field">
                                        <div className="field-label">새 비밀번호 확인</div>
                                        <div className="field-value">
                                            <input
                                                className="profile-input"
                                                type="password"
                                                name="confirmNewPassword"
                                                value={formData.confirmNewPassword}
                                                onChange={handleChange}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="empty-state">
                        <p>사용자 정보를 찾을 수 없습니다.</p>
                    </div>
                )}
            </div>

            {showSignatureModal && (
                <div className="popup-overlay">
                    <div className="popup-content">
                        <div className="popup-header">
                            <h3 className="popup-title">서명 등록</h3>
                        </div>
                        <div className="signature-canvas-container">
                            <SignatureCanvas
                                ref={sigCanvas}
                                penColor="black"
                                canvasProps={{
                                    width: 400,
                                    height: 200,
                                    className: 'signature-canvas'
                                }}
                            />
                        </div>
                        {sigError && <div className="error-message">{sigError}</div>}
                        <div className="popup-buttons">
                            <button className="secondary-button" onClick={() => sigCanvas.current?.clear()}>
                                지우기
                            </button>
                            <button className="primary-button" onClick={handleSaveSignature}>
                                저장
                            </button>
                            <button className="cancel-button" onClick={() => setShowSignatureModal(false)}>
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default MyPage;