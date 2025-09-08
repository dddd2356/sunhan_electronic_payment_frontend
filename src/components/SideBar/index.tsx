import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './style.css';
import defaultProfileImage from './assets/images/profile.png';
import axios from 'axios';
import { useCookies } from 'react-cookie';

interface SidebarProps {
    isOpen: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
    const [isOrganizationMenuOpen, setIsOrganizationMenuOpen] = useState(false);
    const [isMessageMenuOpen, setIsMessageMenuOpen] = useState(false);
    const [cookies, setCookie, removeCookie] = useCookies([
        "accessToken"
    ]);
    const [profileName, setProfileName] = useState<string>('홍길동'); // 초기값 빈 문자열
    const [profileDepartment, setProfileDepartment] = useState<string>('');
    const [profileImage, setProfileImage] = useState<string>('');
    const [role, setRole] = useState<string>('');
    const navigate = useNavigate();
    // ===== 관리자 여부를 저장할 상태 추가 =====
    const [isAdmin, setIsAdmin] = useState<boolean>(false);
    const [jobLevel, setJobLevel] = useState<number>(0);
    const [permissions, setPermissions] = useState<string[]>([]);
    const fetchProfileData = (user_id: string) => {
        axios
            .get(`http://localhost:8080/api/v1/user/${user_id}`, {
                headers: { Authorization: `Bearer ${cookies.accessToken}` },
                withCredentials: true,
            })
            .then((employeeRes) => {
                const employeeData = employeeRes.data;
                if (employeeData) {
                    const imageData = employeeData.profile_image;
                    setProfileImage(imageData ? `data:image/png;base64,${imageData}` : defaultProfileImage);
                }
            })
            .catch((error) => {
                console.error('직원 프로필 정보 가져오기 실패:', error.response?.data || error.message);
                setProfileImage(defaultProfileImage);
            });
    };

    const fetchProfile = () => {
        if (cookies.accessToken) {
            checkUserStatus(); // accessToken만 있는 경우 바로 user 확인
        }
    };

    // 3. checkUserStatus 함수 수정
    const checkUserStatus = () => {
        axios
            .get('http://localhost:8080/api/v1/user/me', {
                headers: { Authorization: `Bearer ${cookies.accessToken}` },
            })
            .then((res) => {
                const userData = res.data;
                const user_id = userData.userId; // userId 사용
                const userName = userData.userName; // userName 사용
                const dept = userData.dept; // 부서 정보 추가
                const userJobLevel = userData.jobLevel;
                const userPermissions = userData.permissions;
                if (userName) {
                    setProfileName(userName);
                }
                if (dept) {
                    setProfileDepartment(dept); // 부서 정보 설정
                }
                if (userJobLevel !== undefined && userJobLevel !== null) {
                    setJobLevel(userJobLevel);
                }
                // ===== 사용자의 role이 'ADMIN'인지 확인하여 상태 업데이트 =====
                // UserEntity의 role 필드를 직접 확인합니다.
                if (userData.role === 'ADMIN') {
                    setIsAdmin(true);
                    console.log("✅ Admin user detected.");
                } else {
                    setIsAdmin(false);
                }

                if (userPermissions && Array.isArray(userPermissions)) {
                    setPermissions(userPermissions); // permissions 상태 저장
                }
                if (user_id) fetchProfileData(user_id);
            })
            .catch((error) => {
                console.error('웹 사용자 정보 가져오기 실패', error);
            });
    };

    useEffect(() => {
        if (cookies.accessToken) {
            checkUserStatus();
        }
    }, [cookies.accessToken]);

    useEffect(() => {
        console.log("🔍 Profile Name Change Detected:", {
            newName: profileName,
            stackTrace: new Error().stack
        });
    }, [profileName]);

    const handleLogout = async () => {
        const loginMethod = "web";
        const logoutUrl = `http://localhost:8080/api/v1/auth/logout/${loginMethod}`;
        const accessToken = cookies.accessToken;
        try {
            const response = await axios.post(logoutUrl, {}, {
                withCredentials: true,
                headers: { "Authorization": `Bearer ${accessToken}` },
            });
            console.log("✅ 서버 로그아웃 응답:", response.data);
            removeCookie("accessToken", { path: "/", secure: true, sameSite: "none" });

            console.log("✅ 클라이언트 쿠키 삭제 완료");
            navigate("/auth/sign-in");
        } catch (error: any) {
            console.error("❌ 로그아웃 실패:", error.response?.data || error.message);
            removeCookie("accessToken", { path: "/", secure: true, sameSite: "none" });
            console.log("✅ 클라이언트 쿠키 삭제 완료 (실패 시)");
            navigate("/auth/sign-in");
        }
    };
    const canViewVacationAdmin = isAdmin && (((jobLevel == 0 || jobLevel == 1)&& permissions.includes('HR_LEAVE_APPLICATION')) || jobLevel >= 2);

    const handleMypage = () => navigate("/detail/my-page");
    return (
        <div className={`sidebar ${isOpen ? "active" : ""}`}>
            <div className="profile-section">
                <div className="profile-header">
                    <img src={profileImage || defaultProfileImage} alt="Profile" className="profile-img"/>
                    <div className="profile-info">
                        <div className="profile-name">{profileName}</div>
                        {profileDepartment && <div className="profile-title">{profileDepartment}</div>}
                    </div>
                </div>
                <div className="profile-buttons">
                    <button className="info-button" onClick={handleMypage}>나의 정보</button>
                    <button className="logout-button" onClick={handleLogout}>로그아웃</button>
                </div>
            </div>
            <hr className="divider"/>
            <ul className="main-menu">
                <li onClick={() => navigate('/detail/main-page')} className="menu-title cursor-pointer">메인 화면</li>

                <li onClick={() => navigate('/detail/employment-contract')}
                    className="menu-title cursor-pointer">근로계약서
                </li>
                <li onClick={() => navigate('/detail/leave-application')} className="menu-title cursor-pointer">휴가원</li>
                {/* ===== isAdmin 상태가 true일 때만 관리자 페이지 메뉴를 렌더링 ===== */}
                {isAdmin && jobLevel >= 1 && (
                    <li onClick={() => navigate('/admin/dashboard')}
                        className="menu-title cursor-pointer font-bold text-purple-600">
                        권한 관리자 페이지
                    </li>
                )}
                {/* 휴가원 관리자 페이지는 새로운 조건에 따라 렌더링 */}
                {canViewVacationAdmin && (
                    <li onClick={() => navigate('/admin/vacation')}
                        className="menu-title cursor-pointer font-bold text-purple-600">
                        휴가원 관리자 페이지
                    </li>
                )}
                {isAdmin  && (
                    <li onClick={() => navigate('/admin/sync-management-dashboard')}
                        className="menu-title cursor-pointer font-bold text-purple-600">
                        동기화 페이지
                    </li>
                )}
            </ul>
        </div>
    );
};

export default Sidebar;