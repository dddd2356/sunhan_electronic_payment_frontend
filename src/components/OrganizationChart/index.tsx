import React, { useState, useEffect } from 'react';
import { useCookies } from 'react-cookie';
import { ChevronRight, ChevronDown, User, Users } from 'lucide-react';
import './style.css';

interface Department {
    deptCode: string;
    deptName: string;
    parentDeptCode?: string;
    children?: Department[];
}

interface Employee {
    userId: string;
    userName: string;
    jobLevel: string;
    deptCode: string;
    phone: string;
}

interface OrganizationChartProps {
    onUserSelect: (userId: string, userName: string, jobLevel: string) => void;
    selectedUserId?: string;
}

const OrganizationChart: React.FC<OrganizationChartProps> = ({
                                                                 onUserSelect,
                                                                 selectedUserId
                                                             }) => {
    const [cookies] = useCookies(['accessToken']);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [employees, setEmployees] = useState<Record<string, Employee[]>>({});
    const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDepartments();
    }, []);

    const fetchDepartments = async () => {
        try {
            const response = await fetch('/api/v1/user/departments', {
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });
            const data = await response.json();
            setDepartments(buildDepartmentTree(data));
        } catch (error) {
            console.error('부서 목록 조회 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchEmployees = async (deptCode: string) => {
        if (employees[deptCode]) return;

        try {
            const response = await fetch(
                `/api/v1/user/department/${deptCode}`,
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );
            const data = await response.json();
            setEmployees(prev => ({ ...prev, [deptCode]: data }));
        } catch (error) {
            console.error('직원 목록 조회 실패:', error);
        }
    };

    const buildDepartmentTree = (depts: Department[]): Department[] => {
        const map = new Map<string, Department>();
        const roots: Department[] = [];

        depts.forEach(dept => {
            map.set(dept.deptCode, { ...dept, children: [] });
        });

        depts.forEach(dept => {
            const node = map.get(dept.deptCode)!;
            if (dept.parentDeptCode) {
                const parent = map.get(dept.parentDeptCode);
                if (parent) {
                    parent.children!.push(node);
                } else {
                    roots.push(node);
                }
            } else {
                roots.push(node);
            }
        });

        return roots;
    };

    const toggleDepartment = (deptCode: string) => {
        const newExpanded = new Set(expandedDepts);
        if (newExpanded.has(deptCode)) {
            newExpanded.delete(deptCode);
        } else {
            newExpanded.add(deptCode);
            fetchEmployees(deptCode);
        }
        setExpandedDepts(newExpanded);
    };

    const getJobLevelText = (jobLevel: string) => {
        const levels: Record<string, string> = {
            '0': '사원',
            '1': '부서장',
            '2': '진료센터장',
            '3': '원장',
            '4': '행정원장',
            '5': '대표원장',
            '6': '최고관리자'
        };
        return levels[jobLevel] || jobLevel;
    };

    const renderDepartment = (dept: Department, level: number = 0) => {
        const isExpanded = expandedDepts.has(dept.deptCode);
        const deptEmployees = employees[dept.deptCode] || [];

        return (
            <div key={dept.deptCode} className="org-dept-container">
                <div
                    className={`org-dept-item level-${level}`}
                    onClick={() => toggleDepartment(dept.deptCode)}
                >
                    <div className="org-dept-header">
                        {isExpanded ? (
                            <ChevronDown className="org-icon" />
                        ) : (
                            <ChevronRight className="org-icon" />
                        )}
                        <Users className="org-icon" />
                        <span className="org-dept-name">{dept.deptName}</span>
                    </div>
                </div>

                {isExpanded && (
                    <div className="org-dept-content">
                        {/* 직원 목록 */}
                        {deptEmployees.length > 0 && (
                            <div className="org-employee-list">
                                {deptEmployees.map(emp => (
                                    <div
                                        key={emp.userId}
                                        className={`org-employee-item ${
                                            selectedUserId === emp.userId ? 'selected' : ''
                                        }`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onUserSelect(emp.userId, emp.userName, emp.jobLevel);
                                        }}
                                    >
                                        <User className="org-icon" />
                                        <div className="org-employee-info">
                                            <span className="org-employee-name">
                                                {emp.userName}
                                            </span>
                                            <span className="org-employee-position">
                                                {getJobLevelText(emp.jobLevel)}
                                            </span>
                                        </div>
                                        {selectedUserId === emp.userId && (
                                            <span className="org-selected-badge">✓</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 하위 부서 */}
                        {dept.children && dept.children.length > 0 && (
                            <div className="org-subdepts">
                                {dept.children.map(child =>
                                    renderDepartment(child, level + 1)
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return <div className="org-loading">조직도를 불러오는 중...</div>;
    }

    return (
        <div className="org-chart-container">
            <div className="org-chart-header">
                <h3>조직도</h3>
                <p className="org-chart-description">
                    부서를 클릭하여 펼치고, 직원을 선택하세요
                </p>
            </div>
            <div className="org-chart-tree">
                {departments.map(dept => renderDepartment(dept))}
            </div>
        </div>
    );
};

export default OrganizationChart;