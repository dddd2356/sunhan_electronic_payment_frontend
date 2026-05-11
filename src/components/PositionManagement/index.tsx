import React, { useState, useEffect } from 'react';
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

    const [currentUser, setCurrentUser] = useState<any>(null);
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // 생성/수정 모달 상태
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
            const userRes = await fetch('/api/v1/user/me/permissions', { credentials: 'include' });
            const userData = await userRes.json();
            const permissions: string[] = userData.permissions || [];

            const hasCreatePermission = permissions.includes('WORK_SCHEDULE_CREATE');
            const isSuperAdmin = parseInt(userData.jobLevel) === 6;
            const isAdmin = userData.role === 'ADMIN';

            if (!hasCreatePermission && !isSuperAdmin && !isAdmin) {
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

    const loadData = async () => {
        try {
            setLoading(true);

            // 현재 사용자 정보 재조회 (필요 시)
            const userRes = await fetch('/api/v1/user/me', { credentials: 'include' });
            const userData = await userRes.json();
            setCurrentUser(userData);

            // 직책 목록
            const positionsData = await fetchPositionsByDept(userData.deptCode);
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
                    displayOrder
                );
            } else {
                // 생성
                await createPosition(
                    currentUser.deptCode,
                    positionName,
                    displayOrder
                );
            }
            setShowModal(false);
            await loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || '저장 실패');
        }
    };

    const handleDelete = async (positionId: number) => {
        if (!window.confirm('정말 삭제하시겠습니까? 해당 직책의 데이터가 유실될 수 있습니다.')) return;

        try {
            await deletePosition(positionId);
            await loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || '삭제 실패');
        }
    };

    // 순서 변경 (위/아래)는 생략 가능하나, Table UI에서도 구현 가능
    // 여기서는 간단히 숫자로 관리하거나, 추후 드래그앤드롭 도입 권장

    if (loading) return (
        <Layout>
            <div className="pm-loading-container">
                <div>데이터를 불러오는 중입니다...</div>
            </div>
        </Layout>
    );

    if (error) return (
        <Layout>
            <div className="pm-error-container">{error}</div>
        </Layout>
    );

    return (
        <Layout>
            <div className="position-management">
                <div className="pm-page-header">
                    <div className="pm-header-title">
                        <h1>직책 관리</h1>
                        <span className="pm-header-info">
                            근무표에 표시될 직책 목록을 관리합니다.
                        </span>
                    </div>
                    <button className="pm-btn-create" onClick={handleCreate}>
                        <span>+</span> 직책 등록
                    </button>
                </div>

                <div className="pm-table-container">
                    <table className="pm-table">
                        <thead>
                        <tr>
                            <th className="col-order">순서</th>
                            <th className="col-name">직책 명칭</th>
                            <th className="col-actions">관리</th>
                        </tr>
                        </thead>
                        <tbody>
                        {positions.length === 0 ? (
                            <tr>
                                <td colSpan={3}>
                                    <div className="pm-empty-state">
                                        등록된 직책이 없습니다.
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            positions.map((pos) => (
                                <tr key={pos.id}>
                                    <td className="col-order" style={{ color: '#9ca3af' }}>
                                        {pos.displayOrder}
                                    </td>
                                    <td className="col-name">
                                        {pos.positionName}
                                    </td>
                                    <td className="col-actions">
                                        <div className="pm-action-group">
                                            <button
                                                className="pm-btn-icon"
                                                onClick={() => handleEdit(pos)}
                                                title="수정"
                                            >
                                                수정
                                            </button>
                                            <button
                                                className="pm-btn-icon delete"
                                                onClick={() => handleDelete(pos.id)}
                                                title="삭제"
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                </div>

                {/* 모달 */}
                {showModal && (
                    <div className="pm-modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="pm-modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="pm-modal-header">
                                <h2>{editingPosition ? '직책 정보 수정' : '새 직책 등록'}</h2>
                            </div>

                            <div className="pm-modal-body">
                                <div className="pm-form-group">
                                    <label>직책 명칭</label>
                                    <input
                                        type="text"
                                        value={positionName}
                                        onChange={(e) => setPositionName(e.target.value)}
                                        placeholder="예: 수간호사, 팀장"
                                        className="pm-form-input"
                                        autoFocus
                                    />
                                </div>

                                <div className="pm-form-group">
                                    <label>표시 순서</label>
                                    <input
                                        type="number"
                                        value={displayOrder || ''}
                                        onChange={(e) => setDisplayOrder(e.target.value ? parseInt(e.target.value) : null)}
                                        placeholder="숫자 입력 (낮을수록 상단)"
                                        className="pm-form-input"
                                    />
                                    <span className="pm-form-helper">
                                        비워두면 목록의 가장 마지막 순서로 자동 지정됩니다.
                                    </span>
                                </div>
                            </div>

                            <div className="pm-modal-footer">
                                <button onClick={() => setShowModal(false)} className="pm-btn-cancel">
                                    취소
                                </button>
                                <button onClick={handleSave} className="pm-btn-confirm">
                                    {editingPosition ? '수정 사항 저장' : '등록하기'}
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