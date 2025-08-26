import React, { useState, useEffect } from 'react';
import { useCookies } from 'react-cookie';
import Layout from '../Layout';
import './style.css';

interface User {
    userId: string;
    userName: string;
    totalVacationDays?: number;
    usedVacationDays?: number;
    deptCode?: string;
    jobLevel?: string;
}

interface VacationStatus {
    userId: string;
    userName: string;
    totalVacationDays: number;
    usedVacationDays: number;
    remainingVacationDays: number;
}

const AdminVacationManagement: React.FC = () => {
    const [cookies] = useCookies(['accessToken']);
    const [users, setUsers] = useState<User[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [vacationStatus, setVacationStatus] = useState<VacationStatus | null>(null);
    const [totalDays, setTotalDays] = useState<number>(15);
    const [updating, setUpdating] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        const filtered = users.filter(user =>
            user.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.deptCode && user.deptCode.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        setFilteredUsers(filtered);
    }, [users, searchTerm]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            setError('');

            const response = await fetch('/api/v1/admin/users', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cookies.accessToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setUsers(data);
            } else {
                throw new Error('사용자 목록을 가져오는데 실패했습니다.');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchVacationStatus = async (userId: string) => {
        try {
            const response = await fetch(`/api/v1/vacation/status/${userId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cookies.accessToken}`
                }
            });

            if (response.ok) {
                const data: VacationStatus = await response.json();
                setVacationStatus(data);
                setTotalDays(data.totalVacationDays);
            }
        } catch (err: any) {
            console.error('휴가 현황 조회 실패:', err);
        }
    };

    const handleUserSelect = (user: User) => {
        setSelectedUser(user);
        setSuccessMessage('');
        fetchVacationStatus(user.userId);
    };

    const handleUpdateVacationDays = async () => {
        if (!selectedUser) return;

        try {
            setUpdating(true);
            const response = await fetch(`/api/v1/vacation/total-days/${selectedUser.userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cookies.accessToken}`
                },
                body: JSON.stringify({
                    totalVacationDays: totalDays
                })
            });

            if (response.ok) {
                // 성공 시 로직
                setUsers(prev => prev.map(user =>
                    user.userId === selectedUser.userId
                        ? { ...user, totalVacationDays: totalDays }
                        : user
                ));
                if (vacationStatus) {
                    const updatedStatus = {
                        ...vacationStatus,
                        totalVacationDays: totalDays,
                        remainingVacationDays: totalDays - vacationStatus.usedVacationDays
                    };
                    setVacationStatus(updatedStatus);
                }
                setSuccessMessage('휴가일수가 성공적으로 업데이트되었습니다.');
                setTimeout(() => setSuccessMessage(''), 3000);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || '휴가일수 업데이트에 실패했습니다.');
            }
        } catch (err: any) {
            setError(err.message);
            // 🚀 실패 시 최신 데이터 다시 불러오기
            await fetchVacationStatus(selectedUser.userId);
        } finally {
            setUpdating(false);
        }
    };

    const getPositionByJobLevel = (jobLevel: string | undefined): string => {
        const level = String(jobLevel);
        switch (level) {
            case '0': return '사원';
            case '1': return '부서장';
            case '2': return '진료센터장';
            case '3': return '원장';
            case '4': return '행정원장';
            case '5': return '대표원장';
            default: return '미설정';
        }
    };

    const getUsagePercentage = () => {
        if (!vacationStatus || vacationStatus.totalVacationDays === 0) return 0;
        return (vacationStatus.usedVacationDays / vacationStatus.totalVacationDays) * 100;
    };

    const getProgressBarClass = () => {
        const percentage = getUsagePercentage();
        if (percentage >= 100) return 'vacation-progress-fill full-usage';
        if (percentage >= 80) return 'vacation-progress-fill high-usage';
        return 'vacation-progress-fill';
    };

    if (loading) {
        return (
            <Layout>
                <div className="vacation-management-container">
                    <div className="vacation-management-loading">
                        <div className="vacation-management-loading-spinner"></div>
                        <p>사용자 목록을 불러오는 중...</p>
                    </div>
                </div>
            </Layout>
        );
    }

    if (error && users.length === 0) {
        return (
            <Layout>
                <div className="vacation-management-container">
                    <div className="vacation-management-error">
                        <div className="vacation-management-error-icon">⚠️</div>
                        <p className="vacation-management-error-message">{error}</p>
                        <button
                            onClick={fetchUsers}
                            className="vacation-management-retry-btn"
                        >
                            다시 시도
                        </button>
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="vacation-management-container">
                <div className="vacation-management-header">
                    <h1 className="vacation-management-title">휴가일수 관리</h1>
                    <p className="vacation-management-subtitle">
                        직원들의 연간 휴가일수를 설정하고 관리할 수 있습니다
                    </p>
                </div>

                {error && (
                    <div className="vacation-management-error">
                        <div className="vacation-management-error-icon">⚠️</div>
                        <p className="vacation-management-error-message">{error}</p>
                    </div>
                )}

                <div className="vacation-management-grid">
                    {/* 사용자 목록 */}
                    <div className="vacation-users-section">
                        <div className="vacation-users-header">
                            사용자 목록
                        </div>

                        <div className="vacation-search-container">
                            <input
                                type="text"
                                placeholder="이름, 사용자 ID, 부서로 검색..."
                                className="vacation-search-input"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="vacation-users-list">
                            {filteredUsers.map((user) => (
                                <div
                                    key={user.userId}
                                    onClick={() => handleUserSelect(user)}
                                    className={`vacation-user-item ${
                                        selectedUser?.userId === user.userId ? 'selected' : ''
                                    }`}
                                >
                                    <div className="vacation-user-name">{user.userName}</div>
                                    <div className="vacation-user-info">
                                        {user.deptCode} / {getPositionByJobLevel(user.jobLevel)}
                                    </div>
                                    <div className="vacation-user-stats">
                                        <span className="vacation-user-stat total">
                                            총 {user.totalVacationDays || 15}일
                                        </span>
                                        <span className="vacation-user-stat used">
                                            사용 {user.usedVacationDays || 0}일
                                        </span>
                                        <span className="vacation-user-stat remaining">
                                            남음 {(user.totalVacationDays || 15) - (user.usedVacationDays || 0)}일
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 휴가일수 설정 */}
                    <div className="vacation-settings-section">
                        <div className="vacation-settings-header">
                            휴가일수 설정
                        </div>

                        <div className="vacation-settings-content">
                            {selectedUser && vacationStatus ? (
                                <>
                                    {successMessage && (
                                        <div className="vacation-success-message">
                                            {successMessage}
                                        </div>
                                    )}

                                    <div className="vacation-selected-user">
                                        <h4 className="vacation-selected-user-name">
                                            {selectedUser.userName}
                                        </h4>
                                        <p className="vacation-selected-user-info">
                                            {selectedUser.deptCode} / {getPositionByJobLevel(selectedUser.jobLevel)}
                                        </p>

                                        <div className="vacation-selected-user-current">
                                            <div className="vacation-current-stat total">
                                                <span className="vacation-current-stat-label">총 휴가일수</span>
                                                <span className="vacation-current-stat-value">
                                                    {vacationStatus.totalVacationDays}일
                                                </span>
                                            </div>
                                            <div className="vacation-current-stat used">
                                                <span className="vacation-current-stat-label">사용한 일수</span>
                                                <span className="vacation-current-stat-value">
                                                    {vacationStatus.usedVacationDays}일
                                                </span>
                                            </div>
                                            <div className="vacation-current-stat remaining">
                                                <span className="vacation-current-stat-label">남은 일수</span>
                                                <span className="vacation-current-stat-value">
                                                    {vacationStatus.remainingVacationDays}일
                                                </span>
                                            </div>
                                        </div>

                                        <div className="vacation-usage-progress">
                                            <div className="vacation-progress-label">
                                                <span>사용률: {Math.round(getUsagePercentage())}%</span>
                                            </div>
                                            <div className="vacation-progress-bar">
                                                <div
                                                    className={getProgressBarClass()}
                                                    style={{ width: `${Math.min(getUsagePercentage(), 100)}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="vacation-form-group">
                                        <label htmlFor="totalDays" className="vacation-form-label">
                                            새로운 총 휴가일수
                                        </label>
                                        <input
                                            type="number"
                                            id="totalDays"
                                            min="0"
                                            max="365"
                                            value={totalDays}
                                            onChange={(e) => setTotalDays(Number(e.target.value))}
                                            className="vacation-form-input"
                                        />
                                    </div>

                                    <div className="vacation-btn-group">
                                        <button
                                            onClick={handleUpdateVacationDays}
                                            disabled={updating}
                                            className={`vacation-btn vacation-btn-primary ${updating ? 'vacation-updating' : ''}`}
                                        >
                                            {updating ? '업데이트 중...' : '업데이트'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedUser(null);
                                                setVacationStatus(null);
                                                setSuccessMessage('');
                                                setError('');
                                            }}
                                            className="vacation-btn vacation-btn-secondary"
                                        >
                                            취소
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="vacation-settings-empty">
                                    <div className="vacation-settings-empty-icon">👆</div>
                                    <div className="vacation-settings-empty-text">
                                        사용자를 선택하세요
                                    </div>
                                    <div className="vacation-settings-empty-subtext">
                                        왼쪽 목록에서 휴가일수를 설정할 직원을 클릭해주세요
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default AdminVacationManagement;