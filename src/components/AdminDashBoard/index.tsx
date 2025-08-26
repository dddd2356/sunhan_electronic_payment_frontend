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
}

// Matches the response from the /api/v1/user/me/permissions endpoint
interface CurrentUserPermissions {
    userId: string;
    userName: string;
    jobLevel: string;
    role: string;
    deptCode: string;
    isAdmin: boolean;
}

/**
 * AdminDashboard component for managing users.
 * * Fetches and displays a list of users that the current admin is allowed to manage.
 * The backend handles the logic for filtering users based on the admin's jobLevel.
 * - jobLevel >= 2: Manages a broad set of users.
 * - jobLevel = 1: Manages only users within the same department.
 * * Provides functionality to:
 * - Grant or revoke ADMIN roles.
 * - Update a user's job level.
 */
export const AdminDashboard: React.FC = () => {
    // ## State Management ##
    const [currentUser, setCurrentUser] = useState<CurrentUserPermissions | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [newJobLevel, setNewJobLevel] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>('');
    const [cookies] = useCookies(['accessToken']); // Assuming the JWT is stored in 'authToken'
    // ## Search State ##
    const [searchTerm, setSearchTerm] = useState<string>('');

    // ## Pagination State ##
    const [currentPage, setCurrentPage] = useState<number>(1);
    const usersPerPage = 15; // 최대 15명으로 설정

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
            // This single endpoint correctly returns department-specific or all manageable users
            // based on the logged-in admin's jobLevel, as handled by the backend.
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

    // Initial data load: fetch current user's permissions, then fetch the user list.
    useEffect(() => {
        const initialize = async () => {
            setLoading(true);
            setError('');
            try {
                // 1. Fetch current admin's permissions to verify their status
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

                // 2. Fetch the appropriate list of users
                await fetchUsers();

            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };

        initialize();
    }, [getAuthHeaders, fetchUsers]);

    // ## Action Handlers ##
    const handleGrantAdmin = async (userId: string) => {
        console.log('권한 부여 요청 대상:', userId);

        try {
            const res = await fetch('/api/v1/admin/grant-admin-role', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ targetUserId: userId }),
            });
            if (!res.ok) throw new Error('Failed to grant admin role.');
            await fetchUsers(); // Refresh user list
        } catch (e: any) {
            setError(e.message);
        }

    };

    const handleRevokeAdmin = async (userId: string) => {
        console.log('권한 제거 요청 대상:', userId);

        if (!userId || userId.trim() === '') {
            setError('사용자 ID가 유효하지 않습니다.');
            return;
        }

        try {
            setError(''); // 기존 오류 메시지 제거
            const res = await fetch('/api/v1/admin/revoke-admin-role', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ targetUserId: userId.trim() }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                console.error('권한 제거 실패:', errorData);
                throw new Error(errorData.error || 'Failed to revoke admin role.');
            }

            const result = await res.json();
            console.log('권한 제거 성공:', result);
            await fetchUsers(); // Refresh user list
        } catch (e: any) {
            console.error('권한 제거 오류:', e);
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
            // Reset form and refresh list
            setSelectedUser(null);
            setNewJobLevel('');
            await fetchUsers();
        } catch (e: any) {
            setError(e.message);
        }
    };

    // Set initial job level in the input when a user is selected
    useEffect(() => {
        if (selectedUser) {
            setNewJobLevel(selectedUser.jobLevel);
        }
    }, [selectedUser]);


    // ## Search and Pagination Logic ##
    const filteredUsers = useMemo(() => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        return users.filter(user => {
            if (!lowerCaseSearchTerm) return true;
            return (
                user.userId.toLowerCase().includes(lowerCaseSearchTerm) ||
                user.userName.toLowerCase().includes(lowerCaseSearchTerm) ||
                user.deptCode.toLowerCase().includes(lowerCaseSearchTerm)
            );
        });
    }, [users, searchTerm]); // searchField 의존성 제거

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

    if (error && !users.length) {
        return <Layout><div className="admin-error-display-initial">Error: {error}</div></Layout>;
    }

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

                {/* Search Section */}
                <div className="admin-search-section">
                    {/* search-select 요소 제거 */}
                    <input
                        type="text"
                        placeholder="Search by User ID, Name, or Department..." // 플레이스홀더 텍스트 변경
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
                                        <span className={`admin-role-badge ${user.role === 'ADMIN' ? 'admin' : 'user'}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="admin-table-cell admin-action-buttons">
                                        {user.role === 'USER' ? (
                                            <button onClick={() => handleGrantAdmin(user.userId)} className="admin-action-button admin-button-grant-admin">Grant Admin</button>
                                        ) : (
                                            <button onClick={() => handleRevokeAdmin(user.userId)} className="admin-action-button admin-button-revoke-admin">Revoke Admin</button>
                                        )}
                                        <button onClick={() => setSelectedUser(user)} className="admin-action-button admin-button-update-level">Update Level</button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} className="admin-table-cell admin-no-results">No users found.</td>
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