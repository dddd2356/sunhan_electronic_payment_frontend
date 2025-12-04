import React, {useEffect, useState, useRef} from 'react';
import {useCookies} from 'react-cookie';
import Layout from '../../../components/Layout';
import SignatureCanvas from 'react-signature-canvas';
import './style.css';
import NotificationPolicy from "../../../components/NotificationPolicy";
import axios from "axios";

interface User {
    id?: string;
    userId?: string;
    userName?: string;
    phone?: string | null;
    address?: string | null;
    detailAddress?: string | null;
    role?: string;
    jobLevel?: string;
    deptCode?: string;
    email?: string;
    signatureUrl?: string | null;
    signimage?: string | null;  // base64 이미지 문자열
    signpath?: string | null;   // 이미지 경로 URL
    privacyConsent?: boolean;
    notificationConsent?: boolean;
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
        detailAddress: '',
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
        privacyConsent: false,
        notificationConsent: false
    });

    // 전화번호 인증 관련 state
    const [isPhoneVerified, setIsPhoneVerified] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [serverCode, setServerCode] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [editingPhone, setEditingPhone] = useState(false);
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [timer, setTimer] = useState(0);

    // 마케팅 정책 모달 상태 추가
    const [showNotificationPolicyModal, setShowNotificationPolicyModal] = useState(false); // ✅ 상태 변수 이름을 변경합니다.
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [sigError, setSigError] = useState('');
    const sigCanvas = useRef<SignatureCanvas>(null);

    const [departmentNames, setDepartmentNames] = useState<Record<string, string>>({});

    const formatPhoneNumber = (value: string) => {
        const digits = value.replace(/\D/g, '');
        if (digits.length <= 3) return digits;
        if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
    };

    const isPhoneValid = (phone: string) => {
        const digits = phone.replace(/\D/g, '');
        return /^010\d{8}$/.test(digits);
    };

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
        const fetchDepartmentNames = async () => {
            try {
                const response = await axios.get('/api/v1/departments/names', {
                    headers: { Authorization: `Bearer ${cookies.accessToken}` }
                });
                setDepartmentNames(response.data);
            } catch (error) {
                console.error('부서 이름 조회 실패:', error);
            }
        };
        fetchDepartmentNames();
    }, []);

    // 분:초 형태로 변환
    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = time % 60;
        return `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
    };

    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        if (isCodeSent && timer > 0) {
            interval = setInterval(() => {
                setTimer(prev => prev - 1);
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isCodeSent, timer]);

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
                detailAddress: data.detailAddress || '',
                role: data.role,
                jobLevel: data.jobLevel,
                deptCode: data.deptCode,
                email: data.email,
                signatureUrl: data.signatureUrl || '',
                signimage: data.signimage || null, // 서버 응답의 signimage 필드 사용
                signpath: data.signpath || null,   // 서버 응답의 signpath 필드 사용
                privacyConsent: data.privacyConsent ?? false,
                notificationConsent: data.notificationConsent ?? false,
            };
            setUser(userData);
            setFormData(prev => ({
                ...prev,
                userName: userData.userName || '',
                phone: userData.phone || '',
                address: userData.address || '',
                detailAddress: userData.detailAddress || '',
                privacyConsent: userData.privacyConsent ?? false,
                notificationConsent: userData.notificationConsent ?? false,
            }));
        } catch (e: any) {
            setError(e.message || '프로필 로드 실패');
        } finally {
            setLoading(false);
        }
    };

    const handleAddressSearch = () => {
        if (typeof window.daum === 'undefined' || !window.daum.Postcode) {
            alert('주소 검색 스크립트를 불러오지 못했습니다. `public/index.html` 파일을 확인해주세요.');
            return;
        }

        new window.daum.Postcode({
            oncomplete: function(data: any) {
                // 도로명 주소를 formData.address에 저장
                setFormData(prev => ({ ...prev, address: data.roadAddress, detailAddress: '' }));
                // 상세 주소 입력 필드로 포커스 이동
                const detailAddressInput = document.getElementById('detail-address');
                if (detailAddressInput) {
                    detailAddressInput.focus();
                }
            }
        }).open();
    };

    // 인증번호 요청
    const handleSendVerificationCode = async () => {
        const phoneDigits = formData.phone.replace(/\D/g, '');

        if (!phoneDigits) {
            alert('전화번호를 입력하세요.');
            return;
        }

        if (!isPhoneValid(formData.phone)) {
            alert('올바른 휴대폰 번호 형식을 입력해주세요. (010-XXXX-XXXX)');
            return;
        }

        // 기존 번호와 동일한 경우 체크
        const originalPhoneDigits = user?.phone?.replace(/\D/g, '') || '';
        if (phoneDigits === originalPhoneDigits) {
            alert('현재 등록된 번호와 동일합니다.');
            return;
        }

        try {
            setIsVerifying(true);
            const res = await fetch('/api/v1/auth/send-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: phoneDigits }), // 숫자만 전송
                credentials: 'include'
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || '인증번호 발송 실패');
            }
            const data = await res.json();
            setServerCode(data.code);
            setIsCodeSent(true);
            setTimer(300);
            alert('인증번호가 발송되었습니다.');
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleVerifyCode = async () => {
        const code = verificationCode.replace(/\D/g, '');

        if (!code || code.length !== 6) {
            alert('6자리 인증번호를 정확히 입력해주세요.');
            return;
        }

        if (timer <= 0) {
            alert('인증 시간이 만료되었습니다. 다시 요청해주세요.');
            return;
        }

        try {
            setIsVerifying(true);
            const response = await fetch('/api/v1/auth/verify-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    phone: formData.phone.replace(/\D/g, ''),
                    code: code
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || '인증번호가 일치하지 않습니다.');
            }

            setIsPhoneVerified(true);
            setTimer(0);
            setIsCodeSent(false);
            setVerificationCode('');
            setEditingPhone(false);
            alert('전화번호 인증이 완료되었습니다.');
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleCancelPhoneEdit = () => {
        setFormData(prev => ({...prev, phone: user?.phone || ''}));
        setEditingPhone(false);
        setIsCodeSent(false);
        setVerificationCode('');
        setIsPhoneVerified(true);
        setTimer(0);
        setIsVerifying(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const {name, value} = e.target;

        if (name === 'phone') {
            const formatted = formatPhoneNumber(value);
            setFormData(prev => ({...prev, [name]: formatted}));

            // 전화번호가 변경되면 인증 상태 리셋
            const originalPhoneDigits = user?.phone?.replace(/\D/g, '') || '';
            const newPhoneDigits = formatted.replace(/\D/g, '');

            if (newPhoneDigits !== originalPhoneDigits) {
                setIsPhoneVerified(false);
                setIsCodeSent(false);
                setVerificationCode('');
                setTimer(0);
            } else if (newPhoneDigits === originalPhoneDigits && originalPhoneDigits) {
                setIsPhoneVerified(true);
            }
        } else if (name === 'notificationConsent') {
            setFormData(prev => ({...prev, [name]: e.target.checked}));
        } else {
            setFormData(prev => ({...prev, [name]: value}));
        }
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

        // 📌 번호가 변경되었는데 인증이 안 됐으면 저장 불가
        if (formData.phone !== user?.phone && !isPhoneVerified) {
            alert('휴대폰 번호 인증을 완료해주세요.');
            return;
        }

        try {
            const body: any = {
                userName: formData.userName,
                phone: formData.phone,
                address: formData.address,
                detailAddress: formData.detailAddress,
                privacyConsent: formData.privacyConsent,
                notificationConsent: formData.notificationConsent
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
                                    {user.userName || '-'}
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
                                        <div className="phone-edit-container">
                                            {!editingPhone ? (
                                                <div className="current-phone-display">
                                                    <span>{formData.phone || '-'}</span>
                                                    <button
                                                        type="button"
                                                        className="phone-button phone-change-btn"
                                                        onClick={() => setEditingPhone(true)}
                                                    >
                                                        번호변경
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* 전화번호 입력 및 버튼이 한 줄에 */}
                                                    <div className="phone-input-row">
                                                        <input
                                                            className="profile-input"
                                                            name="phone"
                                                            value={formData.phone}
                                                            onChange={handleChange}
                                                            placeholder="새 전화번호 입력 (010-0000-0000)"
                                                        />
                                                        <button
                                                            type="button"
                                                            className="phone-button phone-verify-btn"
                                                            onClick={handleSendVerificationCode}
                                                            disabled={isVerifying || timer > 0}
                                                        >
                                                            {isVerifying ? '발송중...' : isCodeSent ? `재발송${timer > 0 ? ` (${formatTime(timer)})` : ''}` : '인증번호 발송'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="phone-button phone-cancel-btn"
                                                            onClick={handleCancelPhoneEdit}
                                                        >
                                                            취소
                                                        </button>
                                                    </div>

                                                    {/* 인증번호 입력 (코드가 발송되었을 때만 표시) */}
                                                    {isCodeSent && !isPhoneVerified && (
                                                        <div className="verification-input-container">
                                                            <input
                                                                className="profile-input"
                                                                value={verificationCode}
                                                                onChange={(e) => setVerificationCode(e.target.value)}
                                                                placeholder="인증번호 6자리"
                                                                maxLength={6}
                                                            />
                                                            <button
                                                                type="button"
                                                                className="phone-button phone-verify-btn"
                                                                onClick={handleVerifyCode}
                                                                disabled={isVerifying}
                                                            >
                                                                {isVerifying ? '확인중...' : '인증확인'}
                                                            </button>
                                                            {timer > 0 && (
                                                                <span
                                                                    className="timer">남은 시간: {formatTime(timer)}</span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* 인증완료 표시 */}
                                                    {isPhoneVerified && formData.phone !== user?.phone && (
                                                        <span className="verified-text">✓ 인증완료</span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        user.phone || '-'
                                    )}
                                </div>
                            </div>

                            <div className="profile-field">
                                <div className="field-label">주소</div>
                                <div className="field-value">
                                    {isEditMode ? (
                                        <div style={{display: 'flex', alignItems: 'center'}}>
                                            <input
                                                className="profile-input"
                                                name="address"
                                                value={formData.address}
                                                readOnly // 주소를 직접 입력할 수 없도록 수정
                                                style={{flex: 1, marginRight: '10px'}}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddressSearch} // 주소 검색 함수 호출
                                                className="address-search-btn"
                                            >
                                                주소 검색
                                            </button>
                                        </div>
                                    ) : (
                                        user.address || '-'
                                    )}
                                </div>
                            </div>
                            <div className="profile-field">
                                <div className="field-label">상세 주소</div>
                                <div className="field-value">
                                    {isEditMode ? (
                                        <input
                                            className="profile-input"
                                            name="detailAddress"
                                            value={formData.detailAddress}
                                            onChange={handleChange}
                                        />
                                    ) : (
                                        user.detailAddress || '-' // <-- user 객체에도 detailAddress 필드가 있어야 함
                                    )}
                                </div>
                            </div>
                            <div className="profile-field">
                                <div className="field-label">부서 / 직급</div>
                                <div className="field-value">
                                    {user?.deptCode ? (departmentNames[user.deptCode] ?? user.deptCode) : '-'}
                                    {user.jobLevel ? ` / ${getPositionByJobLevel(user.jobLevel)}` : ''}
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

                            {/* 마케팅 수신동의 필드 추가 */}
                            <div className="profile-field marketing-consent-field">
                                <div className="field-label">문서 알림 수신동의</div>
                                <div className="field-value">
                                    {isEditMode ? (
                                        <div className="marketing-consent-container">
                                            <label className="marketing-consent-label">
                                                <input
                                                    type="checkbox"
                                                    name="notificationConsent"
                                                    checked={formData.notificationConsent}
                                                    onChange={handleChange}
                                                    className="marketing-consent-checkbox"
                                                />
                                                <span>SMS/알림톡을 통한 문서 알림 수신에 동의합니다.</span>
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setShowNotificationPolicyModal(true)}
                                                className="marketing-policy-btn"
                                            >
                                                자세히 보기
                                            </button>
                                        </div>
                                    ) : (
                                        <span
                                            className={`marketing-status ${user.notificationConsent ? 'agreed' : 'declined'}`}>
                                            {user.notificationConsent ? '✓ 수신동의' : '✗ 수신거부'}
                                        </span>
                                    )}
                                </div>
                            </div>
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

            {/* 마케팅 정책 모달 */}
            {showNotificationPolicyModal && (
                <div className="policy-modal-overlay">
                    <div className="policy-modal-content">
                        <div className="policy-modal-header">
                            <button
                                type="button"
                                onClick={() => setShowNotificationPolicyModal(false)}
                                className="policy-modal-close-btn"
                            >
                                ×
                            </button>
                        </div>
                        <div className="policy-modal-body">
                            <NotificationPolicy />
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default MyPage;