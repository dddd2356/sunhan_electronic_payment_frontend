import React, { useState, useEffect } from 'react';
import { useCookies } from 'react-cookie';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Layout from '../Layout';
import './style.css';

interface EmployeeVacation {
    userId: string;
    userName: string;
    jobLevel: string;
    jobType: string;
    totalDays: number;
    usedDays: number;
    remainingDays: number;
    usageRate: number;
}

interface DepartmentStatistics {
    deptCode: string;
    deptName: string;
    totalEmployees: number;
    avgUsageRate: number;
    totalVacationDays: number;
    totalUsedDays: number;
    totalRemainingDays: number;
    employees: EmployeeVacation[];
}

const AdminVacationStatistics: React.FC = () => {
    const [cookies] = useCookies(['accessToken']);
    const [statistics, setStatistics] = useState<DepartmentStatistics[]>([]);
    const [selectedDept, setSelectedDept] = useState<DepartmentStatistics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    useEffect(() => {
        fetchStatistics();
    }, []);

    const fetchStatistics = async () => {
        try {
            setLoading(true);
            setError('');

            const response = await fetch('/api/v1/vacation/statistics', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cookies.accessToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setStatistics(data);
                if (data.length > 0) {
                    setSelectedDept(data[0]);
                }
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || '통계를 가져오는데 실패했습니다.');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getPositionByJobLevel = (jobLevel: string): string => {
        switch (jobLevel) {
            case '0': return '사원';
            case '1': return '부서장';
            case '2': return '진료센터장';
            case '3': return '원장';
            case '4': return '행정원장';
            case '5': return '대표원장';
            default: return '미설정';
        }
    };

    const getDeptChartData = () => {
        return statistics.map(dept => ({
            name: dept.deptName,
            사용률: dept.avgUsageRate,
            직원수: dept.totalEmployees
        }));
    };

    const getEmployeeChartData = () => {
        if (!selectedDept) return [];
        return selectedDept.employees.map(emp => ({
            name: emp.userName,
            총휴가: emp.totalDays,
            사용: emp.usedDays,
            남은휴가: emp.remainingDays
        }));
    };

    const getUsagePieData = () => {
        if (!selectedDept) return [];
        return [
            { name: '사용', value: selectedDept.totalUsedDays },
            { name: '남은휴가', value: selectedDept.totalRemainingDays }
        ];
    };

    if (loading) {
        return (
            <Layout>
                <div className="vs-loading-container">
                    <div className="vs-loading-spinner"></div>
                    <p>통계를 불러오는 중...</p>
                </div>
            </Layout>
        );
    }

    if (error) {
        return (
            <Layout>
                <div className="vs-error-container">
                    <div className="vs-error-icon">⚠️</div>
                    <p className="vs-error-message">{error}</p>
                    <button onClick={fetchStatistics} className="vs-retry-btn">
                        다시 시도
                    </button>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="vs-container">
                {/* 헤더 */}
                <div className="vs-header">
                    <h1 className="vs-title">휴가 사용 통계</h1>
                    <p className="vs-subtitle">부서별 및 직원별 휴가 사용 현황을 확인할 수 있습니다</p>
                </div>

                {/* 부서별 평균 사용률 차트 */}
                <div className="vs-chart-card">
                    <h2 className="vs-chart-title">부서별 평균 휴가 사용률</h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={getDeptChartData()}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis label={{ value: '사용률 (%)', angle: -90, position: 'insideLeft' }} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="사용률" fill="#3b82f6" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* 부서 선택 및 상세 통계 */}
                <div className="vs-content-grid">
                    {/* 부서 목록 */}
                    <div className="vs-dept-list-card">
                        <h3 className="vs-dept-list-title">부서 목록</h3>
                        <div className="vs-dept-list">
                            {statistics.map((dept) => (
                                <div
                                    key={dept.deptCode}
                                    onClick={() => setSelectedDept(dept)}
                                    className={`vs-dept-item ${selectedDept?.deptCode === dept.deptCode ? 'selected' : ''}`}
                                >
                                    <div className="vs-dept-name">{dept.deptName}</div>
                                    <div className="vs-dept-employee-count">
                                        직원 {dept.totalEmployees}명
                                    </div>
                                    <div className="vs-dept-stats">
                                        <span className="vs-stat total">총 {dept.totalVacationDays}일</span>
                                        <span className="vs-stat used">사용 {dept.totalUsedDays}일</span>
                                        <span className="vs-stat remaining">남음 {dept.totalRemainingDays}일</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 선택된 부서 상세 정보 */}
                    {selectedDept && (
                        <div className="vs-detail-container">
                            {/* 부서 요약 카드 */}
                            <div className="vs-summary-card">
                                <h3 className="vs-summary-title">
                                    {selectedDept.deptName} 부서 현황
                                </h3>
                                <div className="vs-summary-grid">
                                    <div className="vs-summary-item employees">
                                        <div className="vs-summary-label">직원 수</div>
                                        <div className="vs-summary-value">{selectedDept.totalEmployees}명</div>
                                    </div>
                                    <div className="vs-summary-item rate">
                                        <div className="vs-summary-label">평균 사용률</div>
                                        <div className="vs-summary-value">{selectedDept.avgUsageRate}%</div>
                                    </div>
                                    <div className="vs-summary-item used">
                                        <div className="vs-summary-label">사용 휴가</div>
                                        <div className="vs-summary-value">{selectedDept.totalUsedDays}일</div>
                                    </div>
                                    <div className="vs-summary-item remaining">
                                        <div className="vs-summary-label">남은 휴가</div>
                                        <div className="vs-summary-value">{selectedDept.totalRemainingDays}일</div>
                                    </div>
                                </div>
                            </div>

                            {/* 파이 차트와 막대 차트 */}
                            <div className="vs-charts-grid">
                                {/* 파이 차트 */}
                                <div className="vs-pie-chart-card">
                                    <h4 className="vs-chart-subtitle">휴가 사용 비율</h4>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <PieChart>
                                            <Pie
                                                data={getUsagePieData()}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={({ name, value }) => `${name}: ${value}일`}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                {getUsagePieData().map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* 직원별 막대 차트 */}
                                <div className="vs-bar-chart-card">
                                    <h4 className="vs-chart-subtitle">직원별 휴가 현황</h4>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={getEmployeeChartData()}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip />
                                            <Legend />
                                            <Bar dataKey="사용" fill="#10b981" />
                                            <Bar dataKey="남은휴가" fill="#f59e0b" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* 직원별 상세 테이블 */}
                            <div className="vs-table-card">
                                <h4 className="vs-table-title">직원별 상세 현황</h4>
                                <div className="vs-table-wrapper">
                                    <table className="vs-table">
                                        <thead>
                                        <tr>
                                            <th>이름</th>
                                            <th>직급</th>
                                            <th>총 휴가</th>
                                            <th>사용</th>
                                            <th>남은휴가</th>
                                            <th>사용률</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {selectedDept.employees.map((emp) => (
                                            <tr key={emp.userId}>
                                                <td className="vs-table-name">{emp.userName}</td>
                                                <td className="vs-table-position">
                                                    {getPositionByJobLevel(emp.jobLevel)}
                                                </td>
                                                <td className="vs-table-total">{emp.totalDays}일</td>
                                                <td className="vs-table-used">{emp.usedDays}일</td>
                                                <td className="vs-table-remaining">{emp.remainingDays}일</td>
                                                <td className="vs-table-rate">
                                                        <span className={`vs-rate-badge ${
                                                            emp.usageRate >= 80 ? 'high' :
                                                                emp.usageRate >= 50 ? 'medium' : 'low'
                                                        }`}>
                                                            {emp.usageRate}%
                                                        </span>
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
};

export default AdminVacationStatistics;