import React, { useEffect, useState } from 'react';
import { useCookies } from 'react-cookie';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Copy, ToggleLeft, ToggleRight } from 'lucide-react';
import Layout from '../../components/Layout';
import './style.css';

interface ApprovalStep {
    stepOrder: number;
    stepName: string;
    approverType: string;
    approverName?: string;
    // optional fields that might or might not exist
    approverId?: string;
    jobLevel?: string;
    deptCode?: string;
    isOptional?: boolean;
    canSkip?: boolean;
    isFinalApprovalAvailable?: boolean;
}

interface ApprovalLine {
    id: number;
    name: string;
    description?: string;
    documentType: string;
    isActive: boolean;
    steps: ApprovalStep[]; // we'll normalize to always be an array
    createdBy?: string;
}

const MyApprovalLines: React.FC = () => {
    const [cookies] = useCookies(['accessToken']);
    const [lines, setLines] = useState<ApprovalLine[]>([]);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        fetchLines();
        // eslint-disable-next-line
    }, []);

    const normalizeLine = (raw: any): ApprovalLine => {
        return {
            id: raw.id,
            name: raw.name,
            description: raw.description,
            documentType: raw.documentType,
            isActive: raw.isActive ?? true,
            createdBy: raw.createdBy,
            steps: Array.isArray(raw.steps) ? raw.steps : [] // 중요: 항상 배열로 변환
        };
    };

    const fetchLines = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/approval-lines/my', {
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(`결재라인 목록 불러오기 실패: ${err.error || res.statusText}`);
                return;
            }
            const data = await res.json();
            // 안전하게 배열로 만들고 steps는 항상 배열로 맞춤
            const arr = Array.isArray(data) ? data : [];
            const normalized = arr.map(normalizeLine);
            setLines(normalized);
        } catch (e) {
            console.error(e);
            alert('목록 불러오기 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const onCreate = () => navigate('/detail/approval-lines/new');

    const onEdit = (id: number) => navigate(`/detail/approval-lines/${id}`);

    const onDelete = async (id: number) => {
        if (!window.confirm('정말 해당 결재라인을 삭제하시겠습니까?')) return;
        try {
            const res = await fetch(`/api/v1/approval-lines/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(`삭제 실패: ${err.error || res.statusText}`);
                return;
            }
            alert('삭제되었습니다.');
            fetchLines();
        } catch (e) {
            console.error(e);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    const onDuplicate = async (id: number) => {
        try {
            const res = await fetch(`/api/v1/approval-lines/${id}`, {
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });
            if (!res.ok) { alert('원본 불러오기 실패'); return; }
            const original = await res.json();

            // payload 안전하게 구성 (steps가 null이면 빈배열)
            const payload = {
                name: `${original.name || '복사본'} (복사)`,
                description: original.description || '',
                documentType: original.documentType || 'LEAVE_APPLICATION',
                steps: Array.isArray(original.steps) ? original.steps.map((s: any) => ({
                    stepOrder: s.stepOrder,
                    stepName: s.stepName,
                    approverType: s.approverType,
                    approverId: s.approverId ?? null,
                    jobLevel: s.jobLevel ?? null,
                    deptCode: s.deptCode ?? null,
                    isOptional: !!s.isOptional,
                    canSkip: !!s.canSkip,
                    isFinalApprovalAvailable: !!s.isFinalApprovalAvailable
                })) : []
            };

            const postRes = await fetch('/api/v1/approval-lines', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cookies.accessToken}` },
                body: JSON.stringify(payload)
            });
            if (!postRes.ok) { const err = await postRes.json().catch(()=>({})); alert(`복사 실패: ${err.error || postRes.statusText}`); return; }
            alert('복사되었습니다.');
            await fetchLines();
        } catch (e) {
            console.error(e);
            alert('복사 중 오류가 발생했습니다.');
        }
    };

    const toggleActive = async (line: ApprovalLine) => {
        const newIsActive = !line.isActive;
        try {
            const res = await fetch(`/api/v1/approval-lines/${line.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cookies.accessToken}` },
                body: JSON.stringify({
                    name: line.name,
                    description: line.description,
                    documentType: line.documentType,
                    isActive: newIsActive,
                    steps: (line.steps || []).map(s => ({
                        stepOrder: s.stepOrder,
                        stepName: s.stepName,
                        approverType: s.approverType,
                        approverId: (s as any).approverId ?? null,
                        jobLevel: (s as any).jobLevel ?? null,
                        deptCode: (s as any).deptCode ?? null,
                        isOptional: !!(s as any).isOptional,
                        canSkip: !!(s as any).canSkip,
                        isFinalApprovalAvailable: !!(s as any).isFinalApprovalAvailable
                    }))
                })
            });
            if (!res.ok) { const err = await res.json().catch(()=>({})); alert(`변경 실패: ${err.error || res.statusText}`); return; }
            setLines(prevLines =>
                prevLines.map(l =>
                    l.id === line.id
                        ? { ...l, isActive: newIsActive } // ID가 일치하면 isActive만 토글
                        : l
                )
            );
        } catch (e) {
            console.error(e);
            alert('상태 변경 중 오류 발생');
        }
    };

    if (loading) {
        return (
            <Layout>
                <div className="my-approval-lines">
                    <div className="loading">로딩중...</div>
                </div>
            </Layout>
        );
    }
    return (
        <Layout>
            <div className="my-approval-lines">
                {lines.length === 0 ? (
                    <div className="empty">
                        생성한 결재라인이 없습니다.
                        <div className="actions mt-4">
                            <button className="btn primary" onClick={onCreate}>
                                <Plus /> 새 결재라인
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="approval-lines-header">
                            <h1>결재라인 관리</h1>
                            <button className="btn primary" onClick={onCreate}>
                                <Plus/> 새 결재라인
                            </button>
                        </div>
                        <div className="list">
                            {lines.map(line => (
                                <div key={line.id} className="line-card">
                                    <div className="line-left">
                                        <h3>
                                            {line.name}
                                            {!line.isActive && <span className="badge">비활성</span>}
                                        </h3>
                                        {line.description && <p className="desc">{line.description}</p>}
                                        <div className="meta">
                                            단계 {(line.steps?.length ?? 0)}개 · {line.documentType}
                                        </div>
                                    </div>
                                    <div className="line-actions">
                                        <button title="편집" onClick={() => onEdit(line.id)}><Edit2/></button>
                                        <button title="복사" onClick={() => onDuplicate(line.id)}><Copy/></button>
                                        <button title={line.isActive ? '비활성화' : '활성화'}
                                                onClick={() => toggleActive(line)}>
                                            {line.isActive ? <ToggleLeft/> : <ToggleRight/>}
                                        </button>
                                        <button title="삭제" onClick={() => onDelete(line.id)}><Trash2/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </Layout>
    );
};

export default MyApprovalLines;