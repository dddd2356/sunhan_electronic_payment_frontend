import React, { useState, useEffect } from 'react';
import { useCookies } from 'react-cookie';
import { useNavigate } from 'react-router-dom';
import Layout from '../Layout';
import {
    fetchPositionsByDept,
    createPosition,
    updatePosition,
    deletePosition,
    reorderPositions,
    Position
} from '../../apis/Position';
import './style.css';

const PositionManagement: React.FC = () => {
    const [cookies] = useCookies(['accessToken']);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // 생성/수정 모달
    const [showModal, setShowModal] = useState(false);
    const [editingPosition, setEditingPosition] = useState<Position | null>(null);
    const [positionName, setPositionName] = useState('');
    const [displayOrder, setDisplayOrder] = useState<number | null>(null);
    const navigate = useNavigate();
    useEffect(() => {
        checkAccess();
    }, []);

    const checkAccess = async () => {
        try {
            const userRes = await fetch('/api/v1/user/me/permissions', {
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });
            const userData = await userRes.json();
            const permissions: string[] = userData.permissions || [];
            const hasWorkScheduleManage = permissions.includes('WORK_SCHEDULE_MANAGE'); // 근무현황표 관련 권한
            // 부서장(jobLevel=1) 이상 admin, 근무현황표 권한이 있는 사람만 접근 가능
            if (!userData.isAdmin || parseInt(userData.jobLevel) < 1)
            //      || !hasWorkScheduleManage)
            {
                alert('직책 관리 권한이 없습니다.');
                navigate('/detail/main-page');
                return;
            }

            setCurrentUser(userData);
            await loadData();
        } catch (err) {
            navigate('/detail/main-page');
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);

            // 현재 사용자 정보
            const userRes = await fetch('/api/v1/user/me', {
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });
            const userData = await userRes.json();
            setCurrentUser(userData);

            // 직책 목록
            const positionsData = await fetchPositionsByDept(userData.deptCode, cookies.accessToken);
            setPositions(positionsData);

        } catch (err: any) {
            setError(err.response?.data?.error || '데이터를 불러올 수 없습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingPosition(null);
        setPositionName('');
        setDisplayOrder(null);
        setShowModal(true);
    };

    const handleEdit = (position: Position) => {
        setEditingPosition(position);
        setPositionName(position.positionName);
        setDisplayOrder(position.displayOrder);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!positionName.trim()) {
            alert('직책명을 입력하세요.');
            return;
        }

        try {
            if (editingPosition) {
                // 수정
                await updatePosition(
                    editingPosition.id,
                    positionName,
                    displayOrder,
                    cookies.accessToken
                );
                alert('직책이 수정되었습니다.');
            } else {
                // 생성
                await createPosition(
                    currentUser.deptCode,
                    positionName,
                    displayOrder,
                    cookies.accessToken
                );
                alert('직책이 생성되었습니다.');
            }

            setShowModal(false);
            await loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || '저장 실패');
        }
    };

    const handleDelete = async (positionId: number) => {
        if (!window.confirm('이 직책을 삭제하시겠습니까?')) return;

        try {
            await deletePosition(positionId, cookies.accessToken);
            alert('직책이 삭제되었습니다.');
            await loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || '삭제 실패');
        }
    };

    const moveUp = async (position: Position, index: number) => {
        if (index === 0) return;

        const newPositions = [...positions];
        [newPositions[index - 1], newPositions[index]] = [newPositions[index], newPositions[index - 1]];

        try {
            await reorderPositions(
                currentUser.deptCode,
                newPositions.map(p => p.id),
                cookies.accessToken
            );
            await loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || '순서 변경 실패');
        }
    };

    const moveDown = async (position: Position, index: number) => {
        if (index === positions.length - 1) return;

        const newPositions = [...positions];
        [newPositions[index], newPositions[index + 1]] = [newPositions[index + 1], newPositions[index]];

        try {
            await reorderPositions(
                currentUser.deptCode,
                newPositions.map(p => p.id),
                cookies.accessToken
            );
            await loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || '순서 변경 실패');
        }
    };

    if (loading) return <Layout><div className="pm-loading">로딩 중...</div></Layout>;
    if (error) return <Layout><div className="pm-error">{error}</div></Layout>;

    return (
        <Layout>
            <div className="position-management">
                <div className="pm-page-header">
                    <h1>직책 관리</h1>
                    <div className="pm-header-info">
                        <span>부서: {currentUser?.deptCode}</span>
                    </div>
                </div>

                <div className="pm-position-actions">
                    <button onClick={handleCreate} className="pm-btn-create">
                        + 새 직책 추가
                    </button>
                </div>

                <div className="pm-position-list">
                    {positions.length === 0 ? (
                        <div className="pm-empty-state">
                            <p>등록된 직책이 없습니다.</p>
                        </div>
                    ) : (
                        <table className="pm-position-table">
                            <thead>
                            <tr>
                                <th>순서</th>
                                <th>직책명</th>
                                <th>표시 순서</th>
                                <th>상태</th>
                                <th>생성일</th>
                                <th>작업</th>
                            </tr>
                            </thead>
                            <tbody>
                            {positions.map((position, index) => (
                                <tr key={position.id}>
                                    <td>
                                        <div className="pm-order-controls">
                                            <button
                                                onClick={() => moveUp(position, index)}
                                                disabled={index === 0}
                                                className="pm-btn-order"
                                                title="위로"
                                            >
                                                ▲
                                            </button>
                                            <button
                                                onClick={() => moveDown(position, index)}
                                                disabled={index === positions.length - 1}
                                                className="pm-btn-order"
                                                title="아래로"
                                            >
                                                ▼
                                            </button>
                                        </div>
                                    </td>
                                    <td className="pm-position-name">{position.positionName}</td>
                                    <td>{position.displayOrder}</td>
                                    <td>
                                            <span className={`pm-status-badge ${position.isActive ? 'active' : 'inactive'}`}>
                                                {position.isActive ? '활성' : '비활성'}
                                            </span>
                                    </td>
                                    <td>{new Date(position.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        <div className="pm-action-buttons">
                                            <button
                                                onClick={() => handleEdit(position)}
                                                className="pm-btn-edit"
                                            >
                                                수정
                                            </button>
                                            <button
                                                onClick={() => handleDelete(position.id)}
                                                className="pm-btn-delete"
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* 생성/수정 모달 */}
                {showModal && (
                    <div className="pm-modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="pm-modal-content" onClick={(e) => e.stopPropagation()}>
                            <h2>{editingPosition ? '직책 수정' : '새 직책 추가'}</h2>

                            <div className="pm-form-group">
                                <label>직책명 *</label>
                                <input
                                    type="text"
                                    value={positionName}
                                    onChange={(e) => setPositionName(e.target.value)}
                                    placeholder="예: 수간호사, 간호사, 팀장 등"
                                    className="pm-form-input"
                                />
                            </div>

                            <div className="pm-form-group">
                                <label>표시 순서 (선택)</label>
                                <input
                                    type="number"
                                    value={displayOrder || ''}
                                    onChange={(e) => setDisplayOrder(e.target.value ? parseInt(e.target.value) : null)}
                                    placeholder="숫자가 작을수록 상위 표시"
                                    className="pm-form-input"
                                />
                                <small>비워두면 자동으로 마지막에 추가됩니다.</small>
                            </div>

                            <div className="pm-modal-actions">
                                <button onClick={() => setShowModal(false)} className="pm-btn-cancel">
                                    취소
                                </button>
                                <button onClick={handleSave} className="pm-btn-confirm">
                                    저장
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default PositionManagement;