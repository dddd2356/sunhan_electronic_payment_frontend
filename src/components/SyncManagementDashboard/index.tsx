import React, { useState, useCallback } from 'react';
import { useCookies } from 'react-cookie';
import Layout from "../Layout"; // 기존 Layout 컴포넌트 경로
import "./style.css"; // 생성할 CSS 파일

// API 응답 결과 타입 정의
interface SyncResult {
    totalCount: number;
    successCount: number;
    errorCount: number;
    errors: string[];
}

export const SyncManagementDashboard: React.FC = () => {
    // ## State Management ##
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
    const [isSyncing, setIsSyncing] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [userIdInput, setUserIdInput] = useState<string>('');
    const [cookies] = useCookies(['accessToken']);

    // ## API Helper for Authenticated Requests ##
    const getAuthHeaders = useCallback(() => {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cookies.accessToken}`,
        };
    }, [cookies.accessToken]);

    // ## API Action Handlers ##

    // 공통 동기화 실행 함수
    const handleSync = useCallback(async (endpoint: string, confirmationMessage: string) => {
        if (isSyncing) return;
        if (!window.confirm(confirmationMessage)) return;

        setIsSyncing(true);
        setError('');
        setSyncResult(null);

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: getAuthHeaders(),
            });

            const resultData = await res.json();
            if (!res.ok) {
                // 백엔드에서 SyncResult 형태로 에러를 보낼 경우를 대비
                const errorMessage = resultData.errors?.join(', ') || resultData.message || '동기화에 실패했습니다.';
                throw new Error(errorMessage);
            }

            setSyncResult(resultData);

        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSyncing(false);
        }
    }, [getAuthHeaders, isSyncing]);

    // 전체 동기화 핸들러
    const handleSyncAll = () => {
        handleSync('/api/admin/sync/useflag/all', '전체 사용자의 상태를 동기화하시겠습니까? 데이터 양에 따라 시간이 소요될 수 있습니다.');
    };

    // 변경된 내역만 동기화 핸들러
    const handleSyncChanged = () => {
        handleSync('/api/admin/sync/useflag/changed', '변경된 사용자 정보만 동기화하시겠습니까?');
    };

    // 개별 사용자 동기화 핸들러
    const handleSyncSingleUser = () => {
        if (!userIdInput.trim()) {
            setError('동기화할 사용자의 ID를 입력해주세요.');
            return;
        }
        handleSync(`/api/admin/sync/useflag/${userIdInput.trim()}`, `'${userIdInput.trim()}' 사용자의 상태를 동기화하시겠습니까?`);
    };

    // ## Render Logic ##
    return (
        <Layout>
            <div className="sync-dashboard-container">
                <h1 className="sync-dashboard-title">사용자 상태 동기화</h1>
                <p className="sync-welcome-message">
                    Oracle DB의 사용자 재직 상태(UseFlag)를 MySQL DB로 동기화하는 작업을 관리합니다.
                </p>

                {error && <div className="sync-error-message" role="alert">{error}</div>}

                {/* --- Action Controls --- */}
                <div className="sync-card">
                    <h2 className="sync-card-title">동기화 실행</h2>
                    <div className="sync-actions-wrapper">
                        {/* 전체 / 변경분 동기화 버튼 */}
                        <div className="sync-action-group">
                            <button
                                onClick={handleSyncChanged}
                                disabled={isSyncing}
                                className="sync-action-button sync-button-primary"
                            >
                                {isSyncing ? '처리 중...' : '변경된 내역 동기화'}
                            </button>
                            <button
                                onClick={handleSyncAll}
                                disabled={isSyncing}
                                className="sync-action-button sync-button-secondary"
                            >
                                {isSyncing ? '처리 중...' : '전체 동기화'}
                            </button>
                        </div>

                        {/* 개별 사용자 동기화 */}
                        <div className="sync-action-group-single">
                            <input
                                type="text"
                                placeholder="동기화할 사용자 ID 입력"
                                value={userIdInput}
                                onChange={(e) => setUserIdInput(e.target.value)}
                                disabled={isSyncing}
                                className="sync-form-input"
                            />
                            <button
                                onClick={handleSyncSingleUser}
                                disabled={isSyncing || !userIdInput.trim()}
                                className="sync-action-button sync-button-tertiary"
                            >
                                {isSyncing ? '처리 중...' : '개별 동기화'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* --- Results Display --- */}
                <div className="sync-card">
                    <h2 className="sync-card-title">처리 결과</h2>
                    <div className="sync-result-content">
                        {isSyncing && <p className="sync-loading-text">동기화 작업을 진행 중입니다...</p>}

                        {!isSyncing && !syncResult && !error && (
                            <p className="sync-no-data">실행할 동기화 작업을 선택해주세요.</p>
                        )}

                        {syncResult && (
                            <div className="sync-result-grid">
                                <div className="sync-result-item">
                                    <span className="sync-result-label">처리 대상</span>
                                    <span className="sync-result-value">{syncResult.totalCount}</span>
                                </div>
                                <div className="sync-result-item">
                                    <span className="sync-result-label success">성공</span>
                                    <span className="sync-result-value success">{syncResult.successCount}</span>
                                </div>
                                <div className="sync-result-item">
                                    <span className="sync-result-label error">실패</span>
                                    <span className="sync-result-value error">{syncResult.errorCount}</span>
                                </div>
                            </div>
                        )}

                        {syncResult?.errors && syncResult.errors.length > 0 && (
                            <div className="sync-error-details">
                                <strong>오류 상세 내역:</strong>
                                <ul>
                                    {syncResult.errors.map((e, index) => <li key={index}>{e}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default SyncManagementDashboard;