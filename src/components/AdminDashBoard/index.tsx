import React, {useState, useEffect, useCallback, useMemo} from 'react';
import { useCookies } from 'react-cookie';
import Layout from "../Layout";
import "./style.css";

interface User {
    userId: string;
    userName: string;
    deptCode: string;
    jobLevel: string;
    role: string;
    useFlag: string;
}

interface CurrentUserPermissions {
    userId: string;
    userName: string;
    jobLevel: string;
    role: string;
    deptCode: string;
    isAdmin: boolean;
}

interface PermissionType {
    name: string;
    displayName: string;
}

interface UserPermission {
    id: number;
    userId: string;
    permissionType: string;
    createdAt: string;
}

interface DeptPermission {
    id: number;
    deptCode: string;
    permissionType: string;
    createdAt: string;
}

interface Department {
    deptCode: string;
    deptName: string;
}

// Tab enum for managing different sections
enum Tab {
    USER_MANAGEMENT = 'user-management',
    HR_PERMISSIONS = 'hr-permissions'
}

const PERMISSION_DISPLAY_MAP: Record<string, string> = {
    'HR_LEAVE_APPLICATION': '휴가원 관리',
    'HR_CONTRACT': '근로계약서 관리',
    'WORK_SCHEDULE_MANAGE': '근무현황표 관리',
    // 필요하면 여기에 다른 타입 추가
};

export const AdminDashboard: React.FC = () => {
    // ## State Management ##
    const [currentUser, setCurrentUser] = useState<CurrentUserPermissions | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [newJobLevel, setNewJobLevel] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>('');
    const [cookies] = useCookies(['accessToken']);

    // ## Tab Management ##
    const [activeTab, setActiveTab] = useState<Tab>(Tab.USER_MANAGEMENT);

    // ## Search State ##
    const [searchTerm, setSearchTerm] = useState<string>('');

    // ## Pagination State ##
    const [currentPage, setCurrentPage] = useState<number>(1);
    const usersPerPage = 15;

    // ## HR Permissions State ##
    const [permissionTypes, setPermissionTypes] = useState<PermissionType[]>([]);
    const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
    const [deptPermissions, setDeptPermissions] = useState<DeptPermission[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [hrPermissionLoading, setHrPermissionLoading] = useState<boolean>(false);

    // ## HR Permission Form State ##
    const [selectedPermissionType, setSelectedPermissionType] = useState<string>('');
    const [selectedTargetUserId, setSelectedTargetUserId] = useState<string>('');
    const [selectedTargetDeptCode, setSelectedTargetDeptCode] = useState<string>('');
    const [permissionAction, setPermissionAction] = useState<'grant' | 'revoke'>('grant');
    const [permissionTarget, setPermissionTarget] = useState<'user' | 'department'>('user');

    // 컴포넌트에 추가할 상태 및 함수들
    const [selectedUserForFlag, setSelectedUserForFlag] = useState<User | null>(null);
    const [newUseFlag, setNewUseFlag] = useState<string>('');
    const [showAllUsers, setShowAllUsers] = useState<boolean>(false); // 전체/재직자 토글

    // ## API Helper for Authenticated Requests ##
    const getAuthHeaders = useCallback(() => {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cookies.accessToken}`,
        };
    }, [cookies.accessToken]);

    // ## Data Fetching ##
    const fetchUsers = useCallback(async () => {
        setError('');
        try {
            const res = await fetch('/api/v1/admin/my-department-users', {
                headers: getAuthHeaders(),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to load users');
            }

            const data: User[] = await res.json();
            setUsers(data);
        } catch (e: any) {
            setError(e.message);
        }
    }, [getAuthHeaders]);

// API 요청 함수 (기존 fetchUsers는 그대로 사용)
    const fetchAllUsersIncludingInactive = useCallback(async () => {
        // 실제로는 같은 엔드포인트를 사용하되, 프론트엔드에서 필터링
        await fetchUsers(); // 이미 모든 권한 내 사용자를 가져옴
    }, [fetchUsers]);

    // 필터링된 사용자 목록 (기존 filteredUsers 수정)
    const filteredUsers = useMemo(() => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();

        let usersToFilter = users;

        // showAllUsers가 false면 재직자만 표시
        if (!showAllUsers) {
            usersToFilter = users.filter(user => user.useFlag === '1');
        }

        return usersToFilter.filter(user => {
            if (!lowerCaseSearchTerm) return true;
            return (
                user.userId.toLowerCase().includes(lowerCaseSearchTerm) ||
                user.userName.toLowerCase().includes(lowerCaseSearchTerm) ||
                user.deptCode.toLowerCase().includes(lowerCaseSearchTerm)
            );
        });
    }, [users, searchTerm, showAllUsers]);

// 토글 함수 (API 호출 없이 상태만 변경)
    const handleToggleUserView = () => {
        setShowAllUsers(!showAllUsers);
    };


    const fetchPermissionTypes = useCallback(async () => {
        try {
            const res = await fetch('/api/v1/admin/permissions/types', {
                headers: getAuthHeaders(),
            });

            if (!res.ok) throw new Error('Failed to load permission types');

            const data = await res.json();
            const hrPermissions = data.permissionTypes
                .filter((type: string) => type.startsWith('HR_')  || type === 'WORK_SCHEDULE_MANAGE' )
                .map((type: string) => ({
                    name: type,
                    displayName: type === 'HR_LEAVE_APPLICATION' ? '휴가원 관리' :
                        type === 'HR_CONTRACT' ? '근로계약서 관리' :
                        type === 'WORK_SCHEDULE_MANAGE' ? '근무현황표 관리' : type
                }));

            setPermissionTypes(hrPermissions);
        } catch (e: any) {
            console.error('Permission types fetch error:', e.message);
        }
    }, [getAuthHeaders]);

    const fetchUserPermissions = useCallback(async () => {
        try {
            setHrPermissionLoading(true);
            const hrTypes = ['HR_CONTRACT', 'HR_LEAVE_APPLICATION', 'WORK_SCHEDULE_MANAGE'];
            const userPermissionMap = new Map<string, string[]>();

            for (const type of hrTypes) {
                const res = await fetch(`/api/v1/admin/permissions/users/${type}`, {
                    headers: getAuthHeaders(),
                });

                if (res.ok) {
                    const data = await res.json();
                    data.userIds.forEach((userId: string) => {
                        if (!userPermissionMap.has(userId)) {
                            userPermissionMap.set(userId, []);
                        }
                        userPermissionMap.get(userId)?.push(type);
                    });
                }
            }

            const groupedPermissions: UserPermission[] = Array.from(userPermissionMap.entries()).map(([userId, permissions], index) => ({
                id: index,
                userId,
                permissionType: permissions.join(','), // 여러 권한을 쉼표로 구분
                createdAt: new Date().toISOString()
            }));

            setUserPermissions(groupedPermissions);
        } catch (e: any) {
            console.error('User permissions fetch error:', e.message);
        } finally {
            setHrPermissionLoading(false);
        }
    }, [getAuthHeaders]);

    const fetchDeptPermissions = useCallback(async () => {
        try {
            const hrTypes = ['HR_CONTRACT', 'HR_LEAVE_APPLICATION', 'WORK_SCHEDULE_MANAGE'];
            const deptPermissionMap = new Map<string, string[]>();

            for (const type of hrTypes) {
                const res = await fetch(`/api/v1/admin/permissions/departments/${type}`, {
                    headers: getAuthHeaders(),
                });

                if (res.ok) {
                    const data = await res.json();
                    data.deptCodes.forEach((deptCode: string) => {
                        if (!deptPermissionMap.has(deptCode)) {
                            deptPermissionMap.set(deptCode, []);
                        }
                        deptPermissionMap.get(deptCode)?.push(type);
                    });
                }
            }

            const groupedPermissions: DeptPermission[] = Array.from(deptPermissionMap.entries()).map(([deptCode, permissions], index) => ({
                id: index,
                deptCode,
                permissionType: permissions.join(','), // 여러 권한을 쉼표로 구분
                createdAt: new Date().toISOString()
            }));

            setDeptPermissions(groupedPermissions);
        } catch (e: any) {
            console.error('Dept permissions fetch error:', e.message);
        }
    }, [getAuthHeaders]);

    const fetchDepartments = useCallback(async () => {
        try {
            // 실제 부서 목록 API가 있다고 가정
            // 없다면 기존 사용자들의 부서 코드를 활용
            const uniqueDeptsSet = new Set(users.map(user => user.deptCode));
            const uniqueDepts = Array.from(uniqueDeptsSet);
            const depts: Department[] = uniqueDepts.map(code => ({
                deptCode: code,
                deptName: code // 실제로는 부서명 매핑 필요
            }));
            setDepartments(depts);
        } catch (e: any) {
            console.error('Departments fetch error:', e.message);
        }
    }, [users]);

    // Initial data load
    useEffect(() => {
        const initialize = async () => {
            setLoading(true);
            setError('');
            try {
                const permRes = await fetch('/api/v1/user/me/permissions', {
                    headers: getAuthHeaders(),
                });

                if (!permRes.ok) {
                    throw new Error('Could not verify admin permissions. Please log in again.');
                }

                const permData: CurrentUserPermissions = await permRes.json();

                if (!permData.isAdmin) {
                    throw new Error('You do not have access to the admin dashboard.');
                }

                setCurrentUser(permData);
                await fetchUsers();
                await fetchPermissionTypes();

            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };

        initialize();
    }, [getAuthHeaders, fetchUsers, fetchPermissionTypes]);

    // Fetch HR permissions data when tab changes
    useEffect(() => {
        if (activeTab === Tab.HR_PERMISSIONS) {
            fetchUserPermissions();
            fetchDeptPermissions();
            fetchDepartments();
        }
    }, [activeTab, fetchUserPermissions, fetchDeptPermissions, fetchDepartments]);

    // ## Action Handlers ##
    const handleGrantAdmin = async (userId: string) => {
        try {
            const res = await fetch('/api/v1/admin/grant-admin-role', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ targetUserId: userId }),
            });
            if (!res.ok) throw new Error('Failed to grant admin role.');
            await fetchUsers();
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleRevokeAdmin = async (userId: string) => {
        if (!userId || userId.trim() === '') {
            setError('사용자 ID가 유효하지 않습니다.');
            return;
        }

        try {
            setError('');
            const res = await fetch('/api/v1/admin/revoke-admin-role', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ targetUserId: userId.trim() }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to revoke admin role.');
            }

            await fetchUsers();
        } catch (e: any) {
            setError(e.message || '권한 제거에 실패했습니다.');
        }
    };

    const handleUpdateJobLevel = async () => {
        if (!selectedUser || !newJobLevel) return;
        try {
            const res = await fetch('/api/v1/admin/update-job-level', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ targetUserId: selectedUser.userId, newJobLevel }),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to update job level');
            }
            setSelectedUser(null);
            setNewJobLevel('');
            await fetchUsers();
        } catch (e: any) {
            setError(e.message);
        }
    };

    // ## HR Permission Handlers ##
    const handleHrPermissionSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedPermissionType) {
            setError('권한 타입을 선택해주세요.');
            return;
        }

        const targetId = permissionTarget === 'user' ? selectedTargetUserId : selectedTargetDeptCode;
        if (!targetId) {
            setError(`${permissionTarget === 'user' ? '사용자' : '부서'}를 선택해주세요.`);
            return;
        }

        try {
            setError('');
            const endpoint = permissionTarget === 'user'
                ? `/api/v1/admin/permissions/user/${permissionAction}`
                : `/api/v1/admin/permissions/department/${permissionAction}`;

            const body = permissionTarget === 'user'
                ? { targetUserId: targetId, permissionType: selectedPermissionType }
                : { deptCode: targetId, permissionType: selectedPermissionType };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Failed to ${permissionAction} permission`);
            }

            // Reset form
            setSelectedPermissionType('');
            setSelectedTargetUserId('');
            setSelectedTargetDeptCode('');

            // Refresh data
            await fetchUserPermissions();
            await fetchDeptPermissions();
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleRemoveUserPermission = async (userId: string, permissionTypes: string) => {
        try {
            setError('');

            // 여러 권한이 있는 경우 각각 제거 (공백 제거)
            const types = permissionTypes.split(',').map(t => t.trim()).filter(t => t);
            for (const type of types) {
                const res = await fetch('/api/v1/admin/permissions/user/revoke', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ targetUserId: userId, permissionType: type }),
                });

                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || `Failed to revoke ${type} permission`);
                }
            }

            await fetchUserPermissions();
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleRemoveDeptPermission = async (deptCode: string, permissionTypes: string) => {
        try {
            setError('');

            // 여러 권한이 있는 경우 각각 제거 (공백 제거)
            const types = permissionTypes.split(',').map(t => t.trim()).filter(t => t);
            for (const type of types) {
                const res = await fetch('/api/v1/admin/permissions/department/revoke', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ deptCode, permissionType: type }),
                });

                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || `Failed to revoke ${type} permission`);
                }
            }

            await fetchDeptPermissions();
        } catch (e: any) {
            setError(e.message);
        }
    };

    // Helper function to format permission types for display
    const formatPermissionTypes = (permissionTypes: string) => {
        if (!permissionTypes) return '';
        return permissionTypes
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0)
            .map(t => PERMISSION_DISPLAY_MAP[t] || t)
            .join(', ');
    };

    // Set initial job level in the input when a user is selected
    useEffect(() => {
        if (selectedUser) {
            setNewJobLevel(selectedUser.jobLevel);
        }
    }, [selectedUser]);

    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);

    const paginatedUsers = useMemo(() => {
        const startIndex = (currentPage - 1) * usersPerPage;
        const endIndex = startIndex + usersPerPage;
        return filteredUsers.slice(startIndex, endIndex);
    }, [filteredUsers, currentPage, usersPerPage]);

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    // ## Render Logic ##
    if (loading) {
        return <Layout><div className="admin-loading-text">Loading Admin Dashboard...</div></Layout>;
    }

    if (error && !users.length && activeTab === Tab.USER_MANAGEMENT) {
        return <Layout><div className="admin-error-display-initial">Error: {error}</div></Layout>;
    }



    const renderUserManagementTab = () => (
        <>
            {/* Search Section */}
            {/* 컨트롤 섹션 - 검색 위에 추가 */}
            <div className="admin-controls-section">
                <button
                    onClick={handleToggleUserView}
                    className={`admin-toggle-button ${showAllUsers ? 'active' : ''}`}
                >
                    {showAllUsers ? '재직자만 보기' : '전체 보기 (퇴사자 포함)'}
                </button>
            </div>

            {/* 기존 검색 섹션 */}
            <div className="admin-search-section">
                <input
                    type="text"
                    placeholder="Search by User ID, Name, or Department..."
                    className="admin-search-input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="admin-table-container">
                <table className="admin-user-table">
                    <thead className="admin-table-header">
                    <tr>
                        <th className="admin-table-cell">User ID</th>
                        <th className="admin-table-cell">Name</th>
                        <th className="admin-table-cell">Department</th>
                        <th className="admin-table-cell">Job Level</th>
                        <th className="admin-table-cell">재직상태</th>
                        <th className="admin-table-cell">Role</th>
                        <th className="admin-table-cell admin-action-buttons">Actions</th>
                    </tr>
                    </thead>
                    <tbody className="admin-table-body">
                    {paginatedUsers.length > 0 ? (
                        paginatedUsers.map(user => (
                            <tr key={user.userId} className="admin-table-row">
                                <td className="admin-table-cell">{user.userId}</td>
                                <td className="admin-table-cell">{user.userName}</td>
                                <td className="admin-table-cell">{user.deptCode}</td>
                                <td className="admin-table-cell">{user.jobLevel}</td>
                                <td className="admin-table-cell">
                                <span className={`admin-status-badge ${user.useFlag === '1' ? 'active' : 'inactive'}`}>
                                    {user.useFlag === '1' ? '재직' : '퇴사'}
                                </span>
                                </td>
                                <td className="admin-table-cell">
                                <span className={`admin-role-badge ${user.role === 'ADMIN' ? 'admin' : 'user'}`}>
                                    {user.role}
                                </span>
                                </td>
                                <td className="admin-table-cell admin-action-buttons">
                                    {user.role === 'USER' ? (
                                        <button onClick={() => handleGrantAdmin(user.userId)}
                                                className="admin-action-button admin-button-grant-admin">Grant
                                            Admin</button>
                                    ) : (
                                        <button onClick={() => handleRevokeAdmin(user.userId)}
                                                className="admin-action-button admin-button-revoke-admin">Revoke
                                            Admin</button>
                                    )}
                                    <button onClick={() => setSelectedUser(user)}
                                            className="admin-action-button admin-button-update-level">Update Level
                                    </button>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={7} className="admin-table-cell admin-no-results">No users found.</td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="admin-pagination-controls">
                    <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="admin-pagination-button"
                    >
                        Previous
                    </button>
                    {[...Array(totalPages)].map((_, index) => (
                        <button
                            key={index + 1}
                            onClick={() => handlePageChange(index + 1)}
                            className={`admin-pagination-button ${currentPage === index + 1 ? 'active' : ''}`}
                        >
                            {index + 1}
                        </button>
                    ))}
                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="admin-pagination-button"
                    >
                        Next
                    </button>
                </div>
            )}
        </>
    );

    const renderHrPermissionsTab = () => (
        <div className="hr-permissions-container">
            {/* HR Permission Form */}
            <div className="hr-permission-form-section">
                <h3>HR 권한 관리</h3>
                <form onSubmit={handleHrPermissionSubmit} className="hr-permission-form">
                    <div className="form-row">
                        <div className="form-group">
                            <label>권한 타입</label>
                            <select
                                value={selectedPermissionType}
                                onChange={(e) => setSelectedPermissionType(e.target.value)}
                                className="form-select"
                                required
                            >
                                <option value="">권한 선택</option>
                                {permissionTypes.map(type => (
                                    <option key={type.name} value={type.name}>
                                        {type.displayName}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>대상</label>
                            <select
                                value={permissionTarget}
                                onChange={(e) => setPermissionTarget(e.target.value as 'user' | 'department')}
                                className="form-select"
                            >
                                <option value="user">개인</option>
                                <option value="department">부서</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>작업</label>
                            <select
                                value={permissionAction}
                                onChange={(e) => setPermissionAction(e.target.value as 'grant' | 'revoke')}
                                className="form-select"
                            >
                                <option value="grant">권한 부여</option>
                                <option value="revoke">권한 제거</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        {permissionTarget === 'user' ? (
                            <div className="form-group">
                                <label>사용자</label>
                                <select
                                    value={selectedTargetUserId}
                                    onChange={(e) => setSelectedTargetUserId(e.target.value)}
                                    className="form-select"
                                    required
                                >
                                    <option value="">사용자 선택</option>
                                    {users.map(user => (
                                        <option key={user.userId} value={user.userId}>
                                            {user.userName} ({user.userId})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="form-group">
                                <label>부서</label>
                                <select
                                    value={selectedTargetDeptCode}
                                    onChange={(e) => setSelectedTargetDeptCode(e.target.value)}
                                    className="form-select"
                                    required
                                >
                                    <option value="">부서 선택</option>
                                    {departments.map(dept => (
                                        <option key={dept.deptCode} value={dept.deptCode}>
                                            {dept.deptName} ({dept.deptCode})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="form-group">
                            <button type="submit" className="submit-button">
                                {permissionAction === 'grant' ? '권한 부여' : '권한 제거'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* Current Permissions Display */}
            <div className="hr-permissions-display">
                <div className="permissions-section">
                    <h4>개인 HR 권한</h4>
                    {hrPermissionLoading ? (
                        <div>Loading...</div>
                    ) : (
                        <div className="permissions-table-container">
                            <table className="permissions-table">
                                <thead>
                                <tr>
                                    <th>사용자 ID</th>
                                    <th>권한 타입</th>
                                    <th>작업</th>
                                </tr>
                                </thead>
                                <tbody>
                                {userPermissions.length > 0 ? (
                                    userPermissions.map((permission, index) => (
                                        <tr key={`${permission.userId}-${permission.permissionType}-${index}`}>
                                            <td>{permission.userId}</td>
                                            <td>{formatPermissionTypes(permission.permissionType)}</td>
                                            <td>
                                                <button
                                                    onClick={() => handleRemoveUserPermission(permission.userId, permission.permissionType)}
                                                    className="remove-permission-button"
                                                >
                                                    제거
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={3} className="no-data">개인 HR 권한이 없습니다.</td>
                                    </tr>
                                )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="permissions-section">
                    <h4>부서 HR 권한</h4>
                    <div className="permissions-table-container">
                        <table className="permissions-table">
                            <thead>
                            <tr>
                                <th>부서 코드</th>
                                <th>권한 타입</th>
                                <th>작업</th>
                            </tr>
                            </thead>
                            <tbody>
                            {deptPermissions.length > 0 ? (
                                deptPermissions.map((permission, index) => (
                                    <tr key={`${permission.deptCode}-${permission.permissionType}-${index}`}>
                                        <td>{permission.deptCode}</td>
                                        <td>{formatPermissionTypes(permission.permissionType)}</td>
                                        <td>
                                            <button
                                                onClick={() => handleRemoveDeptPermission(permission.deptCode, permission.permissionType)}
                                                className="remove-permission-button"
                                            >
                                                제거
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={3} className="no-data">부서 HR 권한이 없습니다.</td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <Layout>
            <div className="admin-dashboard-container">
                <h1 className="admin-dashboard-title">Admin Dashboard</h1>
                {currentUser && (
                    <p className="admin-welcome-message">
                        Welcome, {currentUser.userName} (Job Level: {currentUser.jobLevel}).
                        {currentUser.jobLevel === "1" && " You are viewing users in your department."}
                    </p>
                )}

                {error && <div className="admin-error-message" role="alert">{error}</div>}

                {/* Tab Navigation */}
                <div className="tab-navigation">
                    <button
                        className={`tab-button ${activeTab === Tab.USER_MANAGEMENT ? 'active' : ''}`}
                        onClick={() => setActiveTab(Tab.USER_MANAGEMENT)}
                    >
                        사용자 관리
                    </button>
                    <button
                        className={`tab-button ${activeTab === Tab.HR_PERMISSIONS ? 'active' : ''}`}
                        onClick={() => setActiveTab(Tab.HR_PERMISSIONS)}
                    >
                        HR 권한 관리
                    </button>
                </div>

                {/* Tab Content */}
                <div className="tab-content">
                    {activeTab === Tab.USER_MANAGEMENT && renderUserManagementTab()}
                    {activeTab === Tab.HR_PERMISSIONS && renderHrPermissionsTab()}
                </div>

                {/* Job Level Update Modal */}
                {selectedUser && (
                    <div className="admin-modal-overlay">
                        <div className="admin-modal-content">
                            <h2 className="admin-modal-title">Update Job Level for {selectedUser.userName}</h2>
                            <div className="admin-form-group">
                                <label htmlFor="jobLevelInput" className="admin-form-label">
                                    New Job Level (0-6)
                                </label>
                                <input
                                    id="jobLevelInput"
                                    type="number"
                                    min="0"
                                    max="6"
                                    value={newJobLevel}
                                    onChange={e => setNewJobLevel(e.target.value)}
                                    className="admin-form-input"
                                />
                            </div>
                            <div className="admin-modal-actions">
                                <button onClick={() => setSelectedUser(null)} className="admin-modal-button admin-modal-cancel-button">Cancel</button>
                                <button onClick={handleUpdateJobLevel} className="admin-modal-button admin-modal-save-button">Save</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default AdminDashboard;