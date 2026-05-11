import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axiosInstance from '../../views/Authentication/axiosInstance';
import './style.css';
import defaultProfileImage from './assets/images/profile.png';

import {
    Home, FileText, Calendar, ClipboardList, Users,
    ShieldCheck, BarChart3, UserCircle, LogOut,
    FileSignature, UserPlus, Building
} from 'lucide-react';
import {toSafeDataUrl} from "../../utils/imageUtils";

interface SidebarProps {
    isOpen: boolean;
    onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [consentCount, setConsentCount] = useState<number>(0);
    const [contractCount, setContractCount] = useState<number>(0);
    const [leaveCount, setLeaveCount] = useState<number>(0);
    const [workScheduleCount, setWorkScheduleCount] = useState<number>(0);
    const [profileName, setProfileName] = useState<string>('사용자');
    const [profileDepartment, setProfileDepartment] = useState<string>('');
    const [profileImage, setProfileImage] = useState<string>('');
    const [isAdmin, setIsAdmin] = useState<boolean>(false);
    const [jobLevel, setJobLevel] = useState<number>(0);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [canCreateConsent, setCanCreateConsent] = useState<boolean>(false);
    const [canManageConsent, setCanManageConsent] = useState<boolean>(false);

    const isMobile = () => window.innerWidth <= 768;
    const handleMenuClick = (path: string) => {
        navigate(path);
        if (isMobile() && onClose) onClose();
    };
    const isActive = (path: string) => location.pathname === path;

    useEffect(() => {
        // 5분 이내 캐시 있으면 API 호출 생략
        const cachedUser = localStorage.getItem('userCache');
        if (cachedUser) {
            try {
                const userData = JSON.parse(cachedUser);
                if (Date.now() - (userData.timestamp || 0) < 5 * 60 * 1000) {
                    setProfileName(userData.userName || '사용자');
                    setProfileDepartment(userData.deptName || '');
                    setJobLevel(Number(userData.jobLevel) || 0);
                    setIsAdmin(userData.role === 'ADMIN');
                    setPermissions(userData.permissions || []);
                    if (userData.userId) fetchProfileImage(userData.userId);
                    if (!userData.consentPermissions) {
                        checkConsentPermissions();
                    } else {
                        setCanCreateConsent(userData.consentPermissions.canCreate);
                        setCanManageConsent(userData.consentPermissions.canManage);
                    }
                    fetchPendingCounts();
                    return;
                }
            } catch {
                localStorage.removeItem('userCache');
            }
        }
        checkUserStatus();
        checkConsentPermissions();
        fetchPendingCounts();
    }, []);

    // ✅ 처리 완료 시 즉시 갱신을 위한 CustomEvent 리스너 추가 (별도 useEffect)
    useEffect(() => {
        window.addEventListener('pendingCountsChanged', fetchPendingCounts);
        return () => window.removeEventListener('pendingCountsChanged', fetchPendingCounts);
    }, []);

    const checkUserStatus = () => {
        axiosInstance.get('/user/me')
            .then((res) => {
                const userData = res.data;
                setProfileName(userData.userName || '사용자');
                setProfileDepartment(userData.deptName || userData.deptCode || '');
                const level = userData.jobLevel ?? userData.joblevel ?? 0;
                setJobLevel(Number(level));
                setIsAdmin(userData.role === 'ADMIN');
                setPermissions(Array.isArray(userData.permissions) ? userData.permissions : []);
                localStorage.setItem('userCache', JSON.stringify({
                    userName: userData.userName,
                    deptName: userData.deptName || userData.deptCode,
                    jobLevel: Number(level),
                    role: userData.role,
                    permissions: userData.permissions || [],
                    userId: userData.userId,
                    timestamp: Date.now()
                }));
                if (userData.userId) fetchProfileImage(userData.userId);
            })
            .catch((err) => console.error('사용자 정보 로드 실패', err));
    };

    const fetchProfileImage = (userId: string) => {
        if (userId === 'administrator') {
            setProfileImage(defaultProfileImage);
            return;
        }
        axiosInstance.get(`/user/${userId}`)
            .then((res) => {
                const imageData = res.data?.profile_image;
                setProfileImage(imageData ? toSafeDataUrl(imageData) : defaultProfileImage);
            })
            .catch(() => setProfileImage(defaultProfileImage));
    };

    const fetchPendingCounts = async () => {
        try {
            const res = await axiosInstance.get('/user/me/pending-counts');
            setConsentCount(res.data.consentCount ?? 0);
            setContractCount(res.data.contractCount ?? 0);
            setLeaveCount(res.data.leaveCount ?? 0);
            setWorkScheduleCount(res.data.workScheduleCount ?? 0);
        } catch {
            // 실패해도 뱃지 없이 정상 표시
        }
    };

    const handleLogout = async () => {
        try {
            await axiosInstance.post('/auth/logout/web');
        } finally {
            localStorage.removeItem('userCache');
            window.location.href = '/';
        }
    };

    const checkConsentPermissions = async () => {
        try {
            const response = await axiosInstance.get('/consents/permissions');
            setCanCreateConsent(response.data.canCreate);
            setCanManageConsent(response.data.canManage);
            const cached = localStorage.getItem('userCache');
            if (cached) {
                const userData = JSON.parse(cached);
                userData.consentPermissions = {
                    canCreate: response.data.canCreate,
                    canManage: response.data.canManage
                };
                localStorage.setItem('userCache', JSON.stringify(userData));
            }
        } catch (error) {
            console.error('동의서 권한 확인 실패:', error);
        }
    };

    const canViewContractMemoAdmin = permissions.includes('HR_CONTRACT') || jobLevel === 6;
    const canViewVacationAdmin = permissions.includes('HR_LEAVE_APPLICATION') || jobLevel === 6;
    const canCreatePositionAdmin = isAdmin || jobLevel === 6 || permissions.includes("WORK_SCHEDULE_CREATE");
    const canViewUserManageAdmin = permissions.includes('MANAGE_USERS') || jobLevel === 6;

    return (
        <div className={`sidebar ${isOpen ? "active" : ""}`}>
            <div className="profile-section">
                <div className="profile-header">
                    <img src={profileImage || defaultProfileImage} alt="Profile" className="profile-img"/>
                    <div className="profile-info">
                        <div className="profile-name">{profileName}</div>
                        <div className="profile-title">{profileDepartment}</div>
                    </div>
                </div>
                <div className="profile-buttons">
                    <button className="info-button" onClick={() => handleMenuClick("/detail/my-page")}>
                        <UserCircle size={14} style={{marginRight: '4px'}}/> 정보
                    </button>
                    <button className="logout-button" onClick={handleLogout}>
                        <LogOut size={14} style={{marginRight: '4px'}}/> 로그아웃
                    </button>
                </div>
            </div>

            <ul className="main-menu">
                <div className="menu-section-label">General</div>
                <li onClick={() => handleMenuClick('/detail/main-page')}
                    className={`menu-item ${isActive('/detail/main-page') ? 'active' : ''}`}>
                    <Home size={18}/> <span>메인 화면</span>
                </li>
                <li onClick={() => handleMenuClick('/detail/consent/my-list')}
                    className={`menu-item ${isActive('/detail/consent/my-list') ? 'active' : ''}`}>
                    <FileSignature size={18}/> <span>동의서</span>
                    {consentCount > 0 && <span className="menu-badge">{consentCount}</span>}
                </li>
                <li onClick={() => handleMenuClick('/detail/employment-contract')}
                    className={`menu-item ${isActive('/detail/employment-contract') ? 'active' : ''}`}>
                    <FileText size={18}/> <span>근로계약서</span>
                    {contractCount > 0 && <span className="menu-badge">{contractCount}</span>}
                </li>
                <li onClick={() => handleMenuClick('/detail/leave-application')}
                    className={`menu-item ${isActive('/detail/leave-application') ? 'active' : ''}`}>
                    <Calendar size={18}/> <span>휴가원</span>
                    {leaveCount > 0 && <span className="menu-badge">{leaveCount}</span>}
                </li>
                <li onClick={() => handleMenuClick('/detail/work-schedule')}
                    className={`menu-item ${isActive('/detail/work-schedule') ? 'active' : ''}`}>
                    <ClipboardList size={18}/> <span>근무현황표</span>
                    {workScheduleCount > 0 && <span className="menu-badge">{workScheduleCount}</span>}
                </li>
                <li onClick={() => handleMenuClick('/detail/approval-lines')}
                    className={`menu-item ${isActive('/detail/approval-lines') ? 'active' : ''}`}>
                    <ShieldCheck size={18}/> <span>결재라인 관리</span>
                </li>

                {isAdmin && (
                    <>
                        <div className="menu-section-label">Administration</div>
                        {canViewUserManageAdmin && (
                            <li onClick={() => handleMenuClick('/admin/dashboard')}
                                className={`menu-item admin ${isActive('/admin/dashboard') ? 'active' : ''}`}>
                                <ShieldCheck size={18}/> <span>권한 관리자</span>
                            </li>
                        )}
                        {permissions.includes('MANAGE_USERS') && (
                            <li onClick={() => handleMenuClick('/admin/users/register')}
                                className={`menu-item admin ${isActive('/admin/users/register') ? 'active' : ''}`}>
                                <UserPlus size={18}/> <span>회원 등록</span>
                            </li>
                        )}
                        {permissions.includes('MANAGE_USERS') && (
                            <li onClick={() => handleMenuClick('/admin/departments/manage')}
                                className={`menu-item admin ${isActive('/admin/departments/manage') ? 'active' : ''}`}>
                                <Building size={18}/> <span>부서 관리</span>
                            </li>
                        )}
                        {canCreateConsent && (
                            <>
                                <li onClick={() => handleMenuClick('/admin/consent/issue')}
                                    className={`menu-item admin ${isActive('/admin/consent/issue') ? 'active' : ''}`}>
                                    <FileSignature size={18}/> <span>동의서 발송</span>
                                </li>
                                <li onClick={() => handleMenuClick('/admin/consent/my-issued')}
                                    className={`menu-item admin ${isActive('/admin/consent/my-issued') ? 'active' : ''}`}>
                                    <FileText size={18}/> <span>발송 현황</span>
                                </li>
                            </>
                        )}
                        {canManageConsent && (
                            <li onClick={() => handleMenuClick('/admin/consent/management')}
                                className={`menu-item admin ${isActive('/admin/consent/management') ? 'active' : ''}`}>
                                <BarChart3 size={18}/> <span>동의서 관리</span>
                            </li>
                        )}
                        {canViewContractMemoAdmin && (
                            <li onClick={() => handleMenuClick('/admin/memo-management')}
                                className={`menu-item admin ${isActive('/admin/memo-management') ? 'active' : ''}`}>
                                <BarChart3 size={18}/> <span>근로계약서 메모 관리</span>
                            </li>
                        )}
                        {canViewVacationAdmin && (
                            <>
                                <li onClick={() => handleMenuClick('/admin/vacation')}
                                    className={`menu-item admin ${isActive('/admin/vacation') ? 'active' : ''}`}>
                                    <BarChart3 size={18}/> <span>휴가원 관리</span>
                                </li>
                                <li onClick={() => handleMenuClick('/admin/vacation-statistics')}
                                    className={`menu-item admin ${isActive('/admin/vacation-statistics') ? 'active' : ''}`}>
                                    <BarChart3 size={18}/> <span>휴가 통계</span>
                                </li>
                            </>
                        )}
                        {canCreatePositionAdmin && (
                            <li onClick={() => handleMenuClick('/detail/positions')}
                                className={`menu-item admin ${isActive('/detail/positions') ? 'active' : ''}`}>
                                <Users size={18}/> <span>직책 관리</span>
                            </li>
                        )}
                    </>
                )}
            </ul>
        </div>
    );
};

export default Sidebar;