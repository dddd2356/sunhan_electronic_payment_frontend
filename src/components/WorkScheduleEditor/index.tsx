import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCookies } from 'react-cookie';
import Layout from '../Layout';
import {
    fetchWorkScheduleDetail,
    updateWorkData,
    updateNightRequired,
    submitWorkSchedule,
    reviewWorkSchedule,
    approveWorkSchedule,
    WorkScheduleDetail,
    WorkScheduleEntry, ApprovalStepInfo
} from '../../apis/workSchedule';
import { fetchPositionsByDept, Position } from '../../apis/Position';
import './style.css';
import axios from "axios";
import ApprovalLineSelector from "../ApprovalLineSelector";
import RejectModal from "../RejectModal";

const WorkScheduleEditor: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [cookies] = useCookies(['accessToken']);

    const [scheduleData, setScheduleData] = useState<WorkScheduleDetail | null>(null);
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [currentUser, setCurrentUser] = useState<any>(null);

    // 선택된 셀 관리
    const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
    const [isSelecting, setIsSelecting] = useState(false);

    // 편집 모드
    const [isEditable, setIsEditable] = useState(false);

    const [entryPositions, setEntryPositions] = useState<Record<number, number | null>>({});
    const [isSaving, setIsSaving] = useState(false);

    const [isDragging, setIsDragging] = useState(false);
    const [dragStartCell, setDragStartCell] = useState<string | null>(null);

    // 작성자 서명 로컬 상태 추가
    const [localCreatorSigned, setLocalCreatorSigned] = useState(false);

    // 서명된 결재자 단계 추적
    const [signedSteps, setSignedSteps] = useState<Set<number>>(new Set());

    // 반려 모달 상태
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [viewRejectReasonModalOpen, setViewRejectReasonModalOpen] = useState(false);
    useEffect(() => {
        loadData();
    }, [id]);


    // 공휴일 API 추가 (한국천문연구원 API 사용)
    const [holidays, setHolidays] = useState<Set<string>>(new Set());

    const loadHolidays = async (year: number) => {
        try {
            // ✅ 백엔드 프록시를 통해 호출
            const response = await axios.get(
                `/api/v1/holidays?year=${year}`,
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );

            const holidaySet = new Set<string>();
            const items = response.data.response?.body?.items?.item;

            if (items) {
                (Array.isArray(items) ? items : [items]).forEach((item: any) => {
                    const date = item.locdate.toString();
                    const month = date.substring(4, 6);
                    const day = date.substring(6, 8);
                    holidaySet.add(`${parseInt(month)}-${parseInt(day)}`);
                });
            }

            setHolidays(holidaySet);
        } catch (error) {
            console.error('공휴일 조회 실패:', error);
            // 실패해도 계속 진행
        }
    };

    useEffect(() => {
        if (scheduleData) {
            const [year] = scheduleData.yearMonth.split('-').map(Number);
            loadHolidays(year);
            // ✅ 작성자 서명 초기화
            const creatorStep = scheduleData.approvalSteps?.find((s: any) => s.stepOrder === 0);
            if (creatorStep) {
                setLocalCreatorSigned(!!creatorStep.signatureUrl);
                setLocalCreatorSignatureUrl(creatorStep.signatureUrl || null);
            }
        }
    }, [scheduleData]);

    // 셀 렌더링 부분 수정
    const isWeekend = (dayOfWeek: string) => dayOfWeek === '토' || dayOfWeek === '일';
    const isHoliday = (day: number) => {
        if (!scheduleData) return false; // null 체크 추가
        const [year, month] = scheduleData.yearMonth.split('-');
        return holidays.has(`${parseInt(month)}-${day}`);
    };

    const [localCreatorSignatureUrl, setLocalCreatorSignatureUrl] = useState<string | null>(null);

    // 서명 처리 함수 추가
    const handleSignStep = async (stepOrder: number) => {
        // 작성자(0번)인 경우
        if (stepOrder === 0) {
            if (localCreatorSigned) {
                if (window.confirm('서명을 취소하시겠습니까?')) {
                    setLocalCreatorSigned(false);
                    setLocalCreatorSignatureUrl(null);

                    // 추가: scheduleData에서 작성자 서명 정보도 제거
                    setScheduleData(prev => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            schedule: {
                                ...prev.schedule,
                                creatorSignatureUrl: null,
                                creatorSignedAt: null
                            },
                            // approvalSteps의 작성자 서명 정보도 비우기 (선택)
                            approvalSteps: prev.approvalSteps?.map((s: any) =>
                                s.stepOrder === 0 ? { ...s, signatureUrl: null, signedAt: null, isSigned: false } : s
                            )
                        };
                    });
                }
            } else {
                if (window.confirm('서명하시겠습니까?')) {
                    try {
                        const userRes = await fetch('/api/v1/user/me', {
                            headers: { Authorization: `Bearer ${cookies.accessToken}` }
                        });
                        const userData = await userRes.json();

                        if (userData.signimage) {
                            const signatureUrl = `data:image/png;base64,${userData.signimage}`;
                            setLocalCreatorSignatureUrl(signatureUrl);
                            setLocalCreatorSigned(true);

                            // 추가: scheduleData에 즉시 반영 (제출 전 검사 통과용)
                            setScheduleData(prev => {
                                if (!prev) return prev;
                                return {
                                    ...prev,
                                    schedule: {
                                        ...prev.schedule,
                                        creatorSignatureUrl: signatureUrl,
                                        creatorSignedAt: new Date().toISOString()
                                    },
                                    approvalSteps: prev.approvalSteps?.map((s: any) =>
                                        s.stepOrder === 0 ? { ...s, signatureUrl: signatureUrl, signedAt: new Date().toISOString(), isSigned: true } : s
                                    )
                                };
                            });
                        } else {
                            alert('등록된 서명 이미지가 없습니다.');
                        }
                    } catch (err) {
                        alert('서명 이미지 조회 실패');
                    }
                }
            }
            return;
        }

        // ✅ [결재자 단계] 서명 여부 확인
        const isAlreadySigned = signedSteps.has(stepOrder);

        if (isAlreadySigned) {
            // ✅ 이미 서명된 경우 -> 취소 물어보기
            if (! window.confirm('서명을 취소하시겠습니까?')) {
                return;
            }

            // ✅ 서명 취소 처리
            setSignedSteps(prev => {
                const newSet = new Set(Array.from(prev));
                newSet.delete(stepOrder);
                return newSet;
            });

            // ✅ approvalSteps에서 서명 정보 제거
            setScheduleData(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    approvalSteps: prev.approvalSteps?.map((step: any) =>
                        step.stepOrder === stepOrder
                            ? {
                                ... step,
                                signatureUrl: null,
                                signedAt: null,
                                isSigned: false
                            }
                            : step
                    ) || []
                };
            });

            return;
        }

        // ✅ 아직 서명 안 된 경우 -> 서명 처리
        if (!window.confirm('서명하시겠습니까?')) {
            return;
        }

        try {
            // ✅ 서명 이미지 가져오기
            const userRes = await fetch('/api/v1/user/me', {
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });
            const userData = await userRes.json();

            if (!userData.signimage) {
                alert('등록된 서명 이미지가 없습니다.');
                return;
            }

            const signatureUrl = `data:image/png;base64,${userData. signimage}`;

            // ✅ API 호출 (서명 저장)
            await axios.post(
                `/api/v1/work-schedules/${id}/sign-step`,
                { stepOrder },
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );

            // ✅ [중요] 먼저 signedSteps에 추가
            setSignedSteps(prev => new Set(Array.from(prev).concat(stepOrder)));

            // ✅ approvalSteps 업데이트 (서명 이미지 + 날짜 추가)
            setScheduleData(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    approvalSteps: prev.approvalSteps?.map((step: any) =>
                        step.stepOrder === stepOrder
                            ?  {
                                ... step,
                                signatureUrl: signatureUrl,
                                signedAt: new Date().toISOString(),
                                isSigned: true
                            }
                            : step
                    ) || []
                };
            });

        } catch (err: any) {
            alert(err.response?.data?.error || '서명 실패');
        }
    };

    // 비고 변경 핸들러
    const handleRemarksChange = (entryId: number, value: string) => {
        setScheduleData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                entries: prev.entries.map(e =>
                    e.id === entryId ? { ...e, remarks: value } : e
                )
            };
        });
    };

    const handleScheduleRemarksChange = (value: string) => {
        setScheduleData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                schedule: { ...prev.schedule, remarks: value }
            };
        });
    };

    // 텍스트 모드로 전환 또는 해제
    const toggleRowTextMode = async () => {
        if (!scheduleData || selectedCells.size === 0) {
            alert("변경할 행의 셀을 하나 이상 선택해주세요.");
            return;
        }

        const firstCellId = Array.from(selectedCells)[0];
        const entryId = parseInt(firstCellId.split('-')[0]);

        const entry = scheduleData.entries.find(e => e.id === entryId);
        if (!entry) return;

        const currentData = entry.workData || {};
        const isTextMode = currentData['rowType'] === 'longText';

        const newWorkData = { ...currentData };
        if (isTextMode) {
            delete newWorkData['rowType'];
            delete newWorkData['longTextValue'];
        } else {
            newWorkData['rowType'] = 'longText';
            newWorkData['longTextValue'] = '';
        }

        // ✅ 로컬 상태만 업데이트
        setScheduleData({
            ...scheduleData,
            entries: scheduleData.entries.map(e =>
                e.id === entryId ? { ...e, workData: newWorkData } : e
            )
        });

        setSelectedCells(new Set());
        // ✅ API 호출 제거
    };

// 긴 텍스트 입력 핸들러
    const handleLongTextChange = (entryId: number, text: string) => {
        setScheduleData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                entries: prev.entries.map(e => {
                    if (e.id === entryId) {
                        return {
                            ...e,
                            workData: { ...e.workData, longTextValue: text }
                        };
                    }
                    return e;
                })
            };
        });
    };

// 긴 텍스트 저장 (onBlur)
    const saveLongText = async (entryId: number, text: string) => {
        const entry = scheduleData?.entries.find(e => e.id === entryId);
        if (!entry) return;

        const newWorkData = { ...entry.workData, longTextValue: text };
        await updateWorkData(parseInt(id!), [{ entryId, workData: newWorkData }], cookies.accessToken);
    };

    // 임시저장 함수
    const handleTempSave = async () => {
        if (!scheduleData) {
            alert('저장할 데이터가 없습니다.');
            return;
        }

        setIsSaving(true);

        try {
            // ✅ workData + 직책 변경 저장
            const updates = scheduleData.entries.map(entry => ({
                entryId: entry.id,
                workData: entry.workData || {},
                remarks: entry.remarks || ""
            }));

            await updateWorkData(parseInt(id!), updates, cookies.accessToken);

            //하단 스케줄 비고(schedule.remarks) 저장
            if (scheduleData.schedule.remarks !== undefined) {
                await axios.put(
                    `/api/v1/work-schedules/${id}/remarks`,
                    { remarks: scheduleData.schedule.remarks },
                    { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
                );
            }

            // ✅ 직책 변경사항 저장
            for (const entry of scheduleData.entries) {
                if (entry.positionId !== undefined) {
                    await axios.put(
                        `/api/v1/work-schedules/entries/${entry.id}/position`,
                        { positionId: entry.positionId },
                        { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
                    );
                }
            }

            // ✅ 나이트 개수 변경사항 저장
            for (const entry of scheduleData.entries) {
                if (entry.nightDutyRequired !== undefined) {
                    await updateNightRequired(entry.id, entry.nightDutyRequired, cookies.accessToken);
                }
            }

            await axios.put(
                `/api/v1/work-schedules/${id}/creator-signature`,
                { isSigned: localCreatorSigned },
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );

            alert('임시저장되었습니다.');
        } catch (err: any) {
            alert(err.response?.data?.error || '임시저장 실패');
        } finally {
            setIsSaving(false);
        }
    };

    // 직책 변경 핸들러
    const handlePositionChange = (entryId: number, positionId: number | null) => {
        // ✅ 로컬 상태만 업데이트
        setScheduleData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                entries: prev.entries.map(e =>
                        e.id === entryId ? { ...e, positionId: positionId || undefined } : e
                    //                                    ↑ null을 undefined로 변환
                )
            };
        });
    };

// 3. 텍스트 입력 모드 추가
    const [editMode, setEditMode] = useState<'button' | 'text'>('button');

// 상태 추가
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [cellTextValue, setCellTextValue] = useState('');

    // 셀 더블클릭 핸들러
    const handleCellDoubleClick = (entryId: number, day: number) => {
        if (!isEditable) return;

        const cellId = getCellId(entryId, day);
        const entry = scheduleData?.entries.find(e => e.id === entryId);
        const currentValue = entry?.workData?.[day.toString()] || '';

        setEditingCell(cellId);
        setCellTextValue(currentValue);
    };

    // 텍스트 입력 완료
    const handleCellTextSave = async (entryId: number, day: number) => {
        const entry = scheduleData?.entries.find(e => e.id === entryId);
        if (!entry) return;

        const newWorkData = { ...(entry.workData || {}), [day.toString()]: cellTextValue };

        // ✅ 로컬 상태만 업데이트 (백엔드 저장 제거)
        const stats = calculateEntryStatistics(newWorkData);

        setScheduleData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                entries: prev.entries.map(e =>
                    e.id === entryId
                        ? {
                            ...e,
                            workData: newWorkData,
                            nightDutyActual: stats.nightCount,
                            nightDutyAdditional: stats.nightCount - (e.nightDutyRequired || 0),
                            offCount: stats.offCount,
                            vacationUsedThisMonth: stats.vacationCount
                        }
                        : e
                )
            };
        });

        setEditingCell(null);
        // ✅ API 호출 제거
    };


// 4. 결재라인 선택 모달 추가
    const [showApprovalLineModal, setShowApprovalLineModal] = useState(false);
    const [approvalLines, setApprovalLines] = useState<any[]>([]);
    const [selectedLineId, setSelectedLineId] = useState<number | null>(null);

// 결재라인 목록 로드
    const loadApprovalLines = async () => {
        try {
            // ✅ 내가 생성한 결재라인만 조회
            const response = await axios.get(
                '/api/v1/approval-lines/my?documentType=WORK_SCHEDULE',
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );
            setApprovalLines(response.data);
        } catch (err) {
            console.error('결재라인 조회 실패:', err);
        }
    };

    const loadData = async () => {
        try {
            setLoading(true);

            // 현재 사용자 정보
            const userRes = await fetch('/api/v1/user/me', {
                headers: { Authorization: `Bearer ${cookies.accessToken}` }
            });
            const userData = await userRes.json();
            setCurrentUser(userData);

            // 근무표 상세 정보
            const detail = await fetchWorkScheduleDetail(parseInt(id!), cookies.accessToken);
            setScheduleData(detail);

            //서버의 JSON 문자열을 객체로 변환 (새로고침 시 데이터 유지용)
            const parsedEntries = detail.entries.map((entry: any) => ({
                ...entry,
                // workDataJson이 있으면 파싱하고, 없으면 빈 객체 할당
                workData: entry.workDataJson ? JSON.parse(entry.workDataJson) : {}
            }));

            setScheduleData({
                ...detail,
                entries: parsedEntries
            });

            // 직책 목록
            const positionsData = await fetchPositionsByDept(detail.schedule.deptCode, cookies.accessToken);
            setPositions(positionsData);

            // 편집 권한 확인
            const canEdit = detail.schedule.createdBy === userData.userId &&
                detail.schedule.approvalStatus === 'DRAFT';
            setIsEditable(canEdit);

        } catch (err: any) {
            setError(err.response?.data?.error || '데이터를 불러올 수 없습니다.');
        } finally {
            setLoading(false);
        }
    };

    const currentStep = scheduleData?.approvalSteps?.find((step: any) => step.isCurrent);

// handleApprovalAction
    const handleApprovalAction = async (approve: boolean) => {
        if (! approve) {
            setShowRejectModal(true);
            return;
        }

        try {
            const currentStep = scheduleData?.approvalSteps?.find((step: any) => step.isCurrent);

            await axios.post(
                `/api/v1/work-schedules/${id}/approve-step`,
                {
                    approve: true,
                    stepOrder: currentStep?.stepOrder
                },
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );

            alert('결재가 완료되었습니다.');
            navigate('/detail/work-schedule');

        } catch (err: any) {
            alert(err.response?.data?.error || '결재 처리 중 오류 발생');
        }
    };

// handleRejectSubmit
    const handleRejectSubmit = async (reason: string) => {
        try {
            const currentStep = scheduleData?.approvalSteps?.find((step: any) => step.isCurrent);

            await axios. post(
                `/api/v1/work-schedules/${id}/approve-step`,
                {
                    approve: false,
                    rejectionReason: reason,
                    stepOrder: currentStep?.stepOrder
                },
                { headers: { Authorization: `Bearer ${cookies. accessToken}` } }
            );

            alert('근무표가 반려되었습니다.');
            navigate(-1);

        } catch (err: any) {
            alert(err. response?.data?.error || '반려 처리 중 오류 발생');
        }
    };

    // 요일 계산
    const daysInMonth = useMemo(() => {
        if (!scheduleData) return [];

        const [year, month] = scheduleData.yearMonth.split('-').map(Number);
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);

        const days = [];
        for (let d = 1; d <= lastDay.getDate(); d++) {
            const date = new Date(year, month - 1, d);
            const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
            days.push({ day: d, dayOfWeek });
        }
        return days;
    }, [scheduleData]);

    // 셀 ID 생성
    const getCellId = (entryId: number, day: number) => `${entryId}-${day}`;

    // 마우스 다운 핸들러
    const handleMouseDown = (entryId: number, day: number, event: React.MouseEvent) => {
        if (!isEditable) return;

        const cellId = getCellId(entryId, day);

        if (event.ctrlKey || event.metaKey) {
            // Ctrl+클릭: 개별 토글
            setSelectedCells(prev => {
                const newSet = new Set(prev);
                if (newSet.has(cellId)) {
                    newSet.delete(cellId);
                } else {
                    newSet.add(cellId);
                }
                return newSet;
            });
        } else {
            // 일반 클릭: 드래그 시작
            setIsDragging(true);
            setDragStartCell(cellId);
            setSelectedCells(new Set([cellId]));
        }
    };

    // 마우스 엔터 핸들러 (드래그)
    const handleMouseEnter = (entryId: number, day: number) => {
        if (!isDragging || !isEditable) return;

        const cellId = getCellId(entryId, day);

        // 같은 행 내에서만 드래그 허용
        if (dragStartCell) {
            const [startEntryId] = dragStartCell.split('-');
            if (startEntryId === entryId.toString()) {
                // ✅ Array.from()으로 변환하여 스프레드 연산자 사용
                setSelectedCells(prev => new Set([...Array.from(prev), cellId]));
            }
        }
    };

// 마우스 업 핸들러
    const handleMouseUp = () => {
        setIsDragging(false);
        setDragStartCell(null);
    };


    // 근무 타입 적용
    const applyWorkType = async (workType: string) => {
        if (!scheduleData || selectedCells.size === 0) return;

        const entriesMap = new Map<number, Set<number>>();

        selectedCells.forEach(cellId => {
            const [entryIdStr, dayStr] = cellId.split('-');
            const entryId = parseInt(entryIdStr);
            const day = parseInt(dayStr);

            if (!entriesMap.has(entryId)) {
                entriesMap.set(entryId, new Set());
            }
            entriesMap.get(entryId)!.add(day);
        });

        // ✅ 로컬 상태만 업데이트 (백엔드 저장 제거)
        const updatedEntries = scheduleData.entries.map(entry => {
            if (!entriesMap.has(entry.id)) return entry;

            const days = entriesMap.get(entry.id)!;
            const updatedWorkData = { ...(entry.workData || {}) };

            days.forEach((day: number) => {
                updatedWorkData[day.toString()] = workType;
            });

            // ✅ 연속 패턴 검사
            const warnings = checkConsecutivePattern(updatedWorkData);
            if (warnings.length > 0) {
                alert(`⚠️ 경고:\n${warnings.join('\n')}`);
            }

            const stats = calculateEntryStatistics(updatedWorkData);

            return {
                ...entry,
                workData: updatedWorkData,
                nightDutyActual: stats.nightCount,
                nightDutyAdditional: stats.nightCount - (entry.nightDutyRequired || 0),
                offCount: stats.offCount,
                vacationUsedThisMonth: stats.vacationCount
            };
        });

        setScheduleData({
            ...scheduleData,
            entries: updatedEntries
        });

        setSelectedCells(new Set());

        // ✅ 백엔드 저장 제거 - 임시저장 버튼을 눌러야 저장됨
    };

    // ✅ 통계 계산 헬퍼 함수 추가
    const calculateEntryStatistics = (workData: Record<string, string>) => {
        let nightCount = 0;
        let offCount = 0;
        let vacationCount = 0.0; // 정수 카운트 (0.5 단위)

        Object.values(workData).forEach(value => {
            if (!value || value.trim() === '') return;

            const trimmed = value.trim().toUpperCase();

            // 나이트 카운트
            if (trimmed === 'N' || trimmed.startsWith('NIGHT')) {
                nightCount++;
            }
            // HN은 나이트 + 0.5 연차
            else if (trimmed === 'HN') {
                nightCount++;
                vacationCount += 0.5;
            }
            // Off 카운트
            else if (trimmed.startsWith('OFF')) {
                offCount++;
            }
            // 연차 (1일)
            else if (trimmed.includes('연') || trimmed === 'AL' || trimmed === 'ANNUAL') {
                vacationCount += 1;
            }
            // 반차 (0.5일)
            else if (trimmed === '반차' || trimmed === 'HD' || trimmed === 'HE') {
                vacationCount += 0.5;
            }
        });

        return { nightCount, offCount, vacationCount };
    };

    const checkConsecutivePattern = (workData: Record<string, string>): string[] => {
        const warnings: string[] = [];
        const sortedDays = Object.keys(workData)
            .map(Number)
            .sort((a, b) => a - b);

        for (let i = 0; i < sortedDays.length - 2; i++) {
            const day1 = sortedDays[i];
            const day2 = sortedDays[i + 1];
            const day3 = sortedDays[i + 2];

            // 연속된 날짜인지 확인
            if (day2 === day1 + 1 && day3 === day2 + 1) {
                const v1 = workData[day1].trim().toUpperCase();
                const v2 = workData[day2].trim().toUpperCase();
                const v3 = workData[day3].trim().toUpperCase();

                const isNight = (v: string) => v === 'N' || v.startsWith('NIGHT') || v === 'HN';
                const isOff = (v: string) => v.startsWith('OFF');
                const isDay = (v: string) => v === 'D' || v === 'D1' || v === '대';

                // N → Off → D 패턴
                if (isNight(v1) && isOff(v2) && isDay(v3)) {
                    warnings.push(`${day1}일(N) → ${day2}일(Off) → ${day3}일(D) 연속 근무 패턴 발견`);
                }
            }
        }

        return warnings;
    };

    // 의무 나이트 개수 변경
    const handleNightRequiredChange = async (entryId: number, value: number) => {
        // ✅ 로컬 상태만 즉시 업데이트 (백엔드 저장 제거)
        setScheduleData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                entries: prev.entries.map(e => {
                    if (e.id === entryId) {
                        const actual = e.nightDutyActual || 0;
                        return {
                            ...e,
                            nightDutyRequired: value,
                            nightDutyAdditional: actual - value
                        };
                    }
                    return e;
                })
            };
        });
        // ✅ API 호출 제거
    };

    // 나이트 표시 문자열 생성
    const getNightDisplay = (entry: WorkScheduleEntry) => {
        const { nightDutyRequired, nightDutyActual } = entry;

        if (nightDutyRequired === nightDutyActual) {
            return '.';
        }

        const diff = nightDutyActual - nightDutyRequired;
        const sign = diff > 0 ? '+' : '';
        return `${nightDutyActual}/${nightDutyRequired} (${sign}${diff})`;
    };

    // 제출
    const handleSubmit = async () => {
        if (!scheduleData) return;

        // ✅ 작성자 서명 확인
        if (!(scheduleData.schedule.creatorSignatureUrl || localCreatorSigned)) {
            alert('제출 전에 작성자 서명이 필요합니다. 결재란의 "작성" 칸을 클릭하여 서명해주세요.');
            return;
        }

        setIsSaving(true);

        try {
            // 1. workData 저장
            const updates = scheduleData.entries.map(entry => ({
                entryId: entry.id,
                workData: entry.workData || {}
            }));
            await updateWorkData(parseInt(id!), updates, cookies.accessToken);

            // 2. 직책 저장
            for (const entry of scheduleData.entries) {
                if (entry.positionId !== undefined) {
                    await axios.put(
                        `/api/v1/work-schedules/entries/${entry.id}/position`,
                        { positionId: entry.positionId },
                        { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
                    );
                }
            }

            // 3. 나이트 개수 저장
            for (const entry of scheduleData.entries) {
                if (entry.nightDutyRequired !== undefined) {
                    await updateNightRequired(entry.id, entry.nightDutyRequired, cookies.accessToken);
                }
            }

            // 4. 비고 저장
            if (scheduleData.schedule.remarks !== undefined) {
                await axios.put(
                    `/api/v1/work-schedules/${id}/remarks`,
                    { remarks: scheduleData.schedule.remarks },
                    { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
                );
            }

            await axios.put(
                `/api/v1/work-schedules/${id}/creator-signature`,
                { isSigned: localCreatorSigned },
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );

            // 5. 결재라인 선택 모달 표시
            await loadApprovalLines();
            setShowApprovalLineModal(true);

        } catch (err: any) {
            alert('제출 전 저장 실패: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsSaving(false);
        }
    };

    const handleApprovalLineConfirm = async () => {
        if (!selectedLineId) {
            alert('결재라인을 선택해주세요.');
            return;
        }

        try {
            await axios.post(
                `/api/v1/work-schedules/${id}/submit`,
                { approvalLineId: selectedLineId },
                { headers: { Authorization: `Bearer ${cookies.accessToken}` } }
            );

            alert('제출되었습니다.');
            navigate('/detail/work-schedule');
        } catch (err: any) {
            alert(err.response?.data?.error || '제출 실패');
        }
    };

    // 검토
    const handleReview = async (approve: boolean) => {
        try {
            await reviewWorkSchedule(parseInt(id!), approve, cookies.accessToken);
            alert(approve ? '검토 승인되었습니다.' : '반려되었습니다.');
            navigate('/detail/work-schedule');
        } catch (err: any) {
            alert(err.response?.data?.error || '처리 실패');
        }
    };

    // 승인
    const handleApprove = async (approve: boolean) => {
        try {
            await approveWorkSchedule(parseInt(id!), approve, cookies.accessToken);
            alert(approve ? '최종 승인되었습니다.' : '반려되었습니다.');
            navigate('/detail/work-schedule');
        } catch (err: any) {
            alert(err.response?.data?.error || '처리 실패');
        }
    };

    if (loading) return <Layout><div className="wse-loading">로딩 중...</div></Layout>;
    if (error) return <Layout><div className="wse-error">{error}</div></Layout>;
    if (!scheduleData) return <Layout><div className="wse-error">데이터를 찾을 수 없습니다.</div></Layout>;

    const { schedule, entries, users } = scheduleData;

    return (
        <Layout>
            <div className="work-schedule-editor" onMouseUp={handleMouseUp}>
                {/* 헤더 */}
                <div className="wse-schedule-header">
                    <div className="wse-header-logo">
                        <img src="/newExecution.ico" alt="로고"/>
                        <span>선한병원</span>
                    </div>
                    <h1 className="wse-schedule-title">
                        {scheduleData.yearMonth.replace('-', '년 ')}월 근무현황표
                    </h1>
                    <div className="wse-header-info">
                        <span>부서: {schedule.deptCode}</span>
                    </div>
                </div>

                {/* 결재란 */}
                <div className="wse-approval-section">
                    <table className="wse-approval-table">
                        <tbody>
                        <tr>
                            <th></th>
                            {scheduleData.approvalSteps?.map((step: any, index: number) => (
                                <th key={index}>{step.stepName}</th>
                            ))}
                        </tr>
                        <tr>
                            <th>성명</th>
                            {scheduleData.approvalSteps?.map((step: any, index: number) => (
                                <td key={index}>{step.name}</td>
                            ))}
                        </tr>
                        <tr>
                            <th>서명</th>
                            {scheduleData.approvalSteps?. map((step: any, index: number) => {
                                // 작성자 단계 여부 확인
                                const isCreatorStep = step.stepOrder === 0;

                                // 서명 권한 확인
                                const canSign = step.isCurrent &&
                                    step.approverId === currentUser?. userId &&
                                    ! step.isSigned;

                                // signedSteps 확인 로직
                                const isSigned = isCreatorStep
                                    ? localCreatorSigned
                                    : (signedSteps. has(step.stepOrder) || !!step.signatureUrl);

                                const showSignature = isSigned;

                                // 표시할 서명 이미지
                                const displaySignature = isCreatorStep
                                    ? localCreatorSignatureUrl
                                    : step.signatureUrl;

                                return (
                                    <td
                                        key={index}
                                        className="wse-signature-cell"
                                        onClick={() => {
                                            // ✅ [중요] 현재 사용자가 이 칸의 결재자인지 확인
                                            const isCurrentUserApprover = step.approverId === currentUser?.userId;
                                            const canClickSign = isCreatorStep || isCurrentUserApprover;

                                            if (canClickSign) {
                                                handleSignStep(step. stepOrder);
                                            }
                                        }}
                                        style={{
                                            cursor: (isCreatorStep || (step.approverId === currentUser?. userId)) ? 'pointer' : 'default',
                                            backgroundColor: (isCreatorStep && isEditable) || (step.approverId === currentUser?.userId) ? '#FFF' : 'transparent'
                                        }}
                                    >
                                        {showSignature ?  (
                                            displaySignature ?  (
                                                <img
                                                    src={displaySignature}
                                                    alt="서명"
                                                    style={{maxWidth: '80px', maxHeight: '60px'}}
                                                />
                                            ) : (
                                                <span style={{color: 'blue', fontWeight: 'bold'}}>서명(저장대기)</span>
                                            )
                                        ) : (
                                            // 서명 안 된 상태
                                            (isCreatorStep || (step. approverId === currentUser?.userId)) ? (
                                                <span className="sign-placeholder">클릭하여 서명</span>
                                            ) : (
                                                <span style={{color: '#ccc'}}>-</span>
                                            )
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                        <tr>
                            <th>일자</th>
                            {scheduleData.approvalSteps?.map((step: any, index: number) => {
                                const isCreatorStep = step.stepOrder === 0;

                                // ✅ [수정 3] 날짜 표시 로직
                                let displayDate = '-';

                                if (isCreatorStep) {
                                    // 작성자: 로컬 상태가 true일 때만 날짜 표시
                                    if (localCreatorSigned) {
                                        // 기존 날짜가 있으면 그 날짜, 방금 서명했다면 '오늘' 표시
                                        displayDate = step.signedAt
                                            ? new Date(step.signedAt).toLocaleDateString('ko-KR')
                                            : new Date().toLocaleDateString('ko-KR');
                                    } else {
                                        // 취소했거나 서명 안 했으면 빈 값
                                        displayDate = '-';
                                    }
                                } else {
                                    // 결재자: DB 데이터 그대로 표시
                                    displayDate = step.signedAt ? new Date(step.signedAt).toLocaleDateString('ko-KR') : '-';
                                }

                                return (
                                    <td key={index} className="wse-date-cell">
                                        {displayDate}
                                    </td>
                                );
                            })}
                        </tr>
                        </tbody>
                    </table>
                </div>



                {/* 근무 타입 버튼 (편집 가능할 때만) */}
                {isEditable && selectedCells.size > 0 && (
                    <div className="wse-work-type-buttons">
                        <button onClick={() => applyWorkType('D')} className="wse-btn-work-type wse-btn-d">D</button>
                        <button onClick={() => applyWorkType('D1')} className="wse-btn-work-type wse-btn-d1">D1</button>
                        <button onClick={() => applyWorkType('N')} className="wse-btn-work-type wse-btn-n">N</button>
                        <button onClick={() => applyWorkType('E')} className="wse-btn-work-type wse-btn-e">E</button>
                        <button onClick={() => applyWorkType('HD')} className="wse-btn-work-type wse-btn-half">HD
                        </button>
                        <button onClick={() => applyWorkType('HE')} className="wse-btn-work-type wse-btn-half">HE
                        </button>
                        <button onClick={() => applyWorkType('HN')} className="wse-btn-work-type wse-btn-half">HN
                        </button>
                        <button onClick={() => applyWorkType('Off')} className="wse-btn-work-type wse-btn-off">Off
                        </button>
                        <button onClick={() => applyWorkType('연')} className="wse-btn-work-type wse-btn-leave">연차
                        </button>
                        <button onClick={() => applyWorkType('반차')} className="wse-btn-work-type wse-btn-half">반차
                        </button>
                        <button onClick={() => applyWorkType('대')} className="wse-btn-work-type wse-btn-d1">대</button>
                        <button onClick={() => applyWorkType('')} className="wse-btn-work-type wse-btn-clear">지우기
                        </button>
                        <button onClick={toggleRowTextMode} className="wse-btn-work-type"
                                style={{backgroundColor: '#6c757d', color: 'white'}}>
                            텍스트/셀 전환
                        </button>
                        <span className="wse-selected-count">{selectedCells.size}개 선택됨</span>
                    </div>
                )}

                {/* 근무표 */}
                <div className="wse-schedule-table-container">
                    <table className="wse-schedule-table">
                    <thead>
                        <tr>
                            <th rowSpan={2}>No</th>
                            <th rowSpan={2}>직책</th>
                            <th rowSpan={2}>성명</th>
                            {daysInMonth.map(d => {
                                const isWeekendOrHoliday = isWeekend(d.dayOfWeek) || isHoliday(d.day);
                                return (
                                    <th
                                        key={d.day}
                                        rowSpan={2}
                                        className={`wse-day-header ${isWeekendOrHoliday ? 'weekend-holiday' : ''}`}
                                    >
                                        <div className="wse-day-number">{d.day}일</div>
                                        <div className="wse-day-of-week">{d.dayOfWeek}</div>
                                    </th>
                                );
                            })}
                            <th colSpan={3}>나이트</th>
                            <th rowSpan={2}>OFF 개수</th>
                            <th colSpan={3}>휴가</th>
                            <th rowSpan={2}>비고</th>
                        </tr>
                        <tr>
                            <th>의무 개수</th>
                            <th>실제 개수</th>
                            <th>추가 개수</th>
                            <th>총 휴가수</th>
                            <th>이달 사용수</th>
                            <th>사용 총계</th>
                        </tr>
                        </thead>
                        <tbody>
                        {entries.map((entry, idx) => {
                            const user = users[entry.userId];
                            const position = positions.find(p => p.id === entry.positionId);
                            const isLongTextMode = entry.workData?.['rowType'] === 'longText';

                            return (
                                <tr key={entry.id}>
                                    <td>{idx + 1}</td>
                                    <td style={{padding: '0'}}>
                                        {isEditable ? (
                                            <select
                                                value={entry.positionId || ''}
                                                onChange={(e) => handlePositionChange(entry.id, Number(e.target.value))}
                                                className="wse-position-select"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{
                                                    display: 'block',
                                                    width: '100%',
                                                    height: '100%',
                                                    border: 'none',
                                                    padding: '5px',
                                                    minWidth: '70px', // 최소 너비 보장
                                                    backgroundColor: 'transparent'
                                                }}
                                            >
                                                <option value="" disabled>선택</option>
                                                {positions.map(pos => (
                                                    <option key={pos.id} value={pos.id}>{pos.positionName}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            position?.positionName || '-'
                                        )}
                                    </td>
                                    <td>{user?.userName || entry.userId}</td>

                                    {/* 일별 근무 */}
                                    {isLongTextMode ? (
                                        <td colSpan={daysInMonth.length} className="wse-long-text-cell"
                                            style={{padding: 0}}>
                                            <input
                                                type="text"
                                                value={entry.workData?.['longTextValue'] || ''}
                                                onChange={(e) => handleLongTextChange(entry.id, e.target.value)}
                                                placeholder="내용을 입력하세요 (예: 장기 휴가, 병가 등)"
                                                style={{
                                                    width: '90%',
                                                    height: '80px',
                                                    border: 'none',
                                                    textAlign: 'center',
                                                    backgroundColor: '#f9f9f9',
                                                    fontSize: '14px'
                                                }}
                                                // 클릭 시 행 선택을 위해 이벤트 전파
                                                onClick={(e) => handleMouseDown(entry.id, 1, e)}
                                            />
                                        </td>
                                    ) : (
                                        daysInMonth.map(d => {
                                            const cellId = getCellId(entry.id, d.day);
                                            const workType = entry.workData?.[d.day.toString()] || '';
                                            const isSelected = selectedCells.has(cellId);

                                            return editingCell === cellId ? (
                                                <td key={d.day}>
                                                    <input
                                                        type="text"
                                                        value={cellTextValue}
                                                        onChange={(e) => setCellTextValue(e.target.value)}
                                                        onBlur={() => handleCellTextSave(entry.id, d.day)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleCellTextSave(entry.id, d.day);
                                                            else if (e.key === 'Escape') setEditingCell(null);
                                                        }}
                                                        autoFocus
                                                        className="cell-input"
                                                    />
                                                </td>
                                            ) : (
                                                <td
                                                    key={d.day}
                                                    className={`wse-work-cell ${isSelected ? 'selected' : ''} ${workType.toLowerCase()} ${(isWeekend(d.dayOfWeek) || isHoliday(d.day)) ? 'weekend-holiday' : ''}`}
                                                    onDoubleClick={() => handleCellDoubleClick(entry.id, d.day)}
                                                    onMouseDown={(e) => handleMouseDown(entry.id, d.day, e)}
                                                    onMouseEnter={() => handleMouseEnter(entry.id, d.day)}
                                                >
                                                    {workType}
                                                </td>
                                            );
                                        })
                                    )}

                                    {/* 통계 및 기타 컬럼 */}
                                    <td>
                                        {isEditable ? (
                                            <input
                                                type="text"
                                                value={entry.nightDutyRequired || 0}
                                                onChange={(e) => handleNightRequiredChange(entry.id, parseInt(e.target.value) || 0)}  // ✅ onBlur → onChange
                                                className="number-input-text"
                                                min="0"
                                            />
                                        ) : entry.nightDutyRequired}
                                    </td>
                                    <td>{entry.nightDutyActual}</td>
                                    <td>{getNightDisplay(entry)}</td>
                                    <td>{entry.offCount}</td>
                                    <td>{entry.vacationTotal}</td>
                                    <td>{entry.vacationUsedThisMonth}</td>
                                    <td>{entry.vacationUsedTotal}</td>

                                    {/* 행 비고 입력 */}
                                    <td>
                                        {isEditable ? (
                                            <input
                                                type="text"
                                                value={entry.remarks || ''}
                                                onChange={(e) => handleRemarksChange(entry.id, e.target.value)}
                                                className="remarks-input"
                                            />
                                        ) : (
                                            entry.remarks
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>

                {/* 하단 비고 */}
                <div className="wse-bottom-remarks">
                    <label>비고:</label>
                    {isEditable ? (
                        <textarea
                            value={schedule.remarks || ''}
                            onChange={(e) => handleScheduleRemarksChange(e.target.value)}
                            className="wse-remarks-textarea"
                            rows={3}
                        />
                    ) : (
                        <div className="wse-remarks-display">{schedule.remarks}</div>
                    )}
                </div>

                {/* 버튼 */}
                <div className="wse-action-buttons">
                    <button onClick={() => navigate('/detail/work-schedule')} className="wse-btn-list">
                        목록
                    </button>

                    {/* 반려된 상태 - REJECTED */}
                    {schedule.approvalStatus === 'REJECTED' && (
                        <button
                            onClick={() => setViewRejectReasonModalOpen(true)}
                            className="wse-btn-view-reason"
                        >
                            반려 사유 확인
                        </button>
                    )}

                    {isEditable && schedule.approvalStatus === 'DRAFT' && (
                        <>
                            <button onClick={handleTempSave} className="wse-btn-temp-save" disabled={isSaving}>
                                {isSaving ? '저장중...' : '임시저장'}
                            </button>
                            <button onClick={handleSubmit} className="wse-btn-submit">
                                제출
                            </button>
                        </>
                    )}

                    {schedule. approvalStatus === 'SUBMITTED' &&
                        (() => {
                            const currentStep = scheduleData?. approvalSteps?.find((step: any) => step.isCurrent);
                            return currentStep && signedSteps. has(currentStep.stepOrder);
                        })() && (
                            <>
                                <button onClick={() => handleApprovalAction(false)} className="wse-btn-reject">
                                    반려
                                </button>
                                <button onClick={() => handleApprovalAction(true)} className="wse-btn-approve">
                                    승인
                                </button>
                            </>
                        )}

                    {/* 승인자 - REVIEWED */}
                    {schedule.approvalStatus === 'REVIEWED' && currentUser?.userId === schedule.approverId && (
                        <>
                            <button onClick={() => handleApprove(false)} className="wse-btn-reject">
                                반려
                            </button>
                            <button onClick={() => handleApprove(true)} className="wse-btn-approve">
                                최종 승인
                            </button>
                        </>
                    )}

                    {/* 승인 완료 - APPROVED */}
                    {schedule.approvalStatus === 'APPROVED' && schedule.isPrintable && (
                        <button className="wse-btn-print">
                            PDF 다운로드
                        </button>
                    )}
                </div>
                {/* 반려 모달 */}
                {showRejectModal && (
                    <RejectModal
                        isOpen={showRejectModal}
                        onClose={() => setShowRejectModal(false)}
                        onSubmit={handleRejectSubmit}
                        title="반려 사유"
                        placeholder="반려 사유를 입력해주세요..."
                    />
                )}

                {showApprovalLineModal && (
                    <ApprovalLineSelector
                        approvalLines={approvalLines}
                        selectedLineId={selectedLineId}
                        onSelect={(lineId) => setSelectedLineId(lineId)}
                        onConfirm={(data) => {
                            // ✅ 확인 버튼 클릭 시 제출 진행
                            setSelectedLineId(data.id);
                            setShowApprovalLineModal(false);
                            handleApprovalLineConfirm();
                        }}
                        onCancel={() => {
                            // ✅ 취소 버튼 클릭 시 모달만 닫기
                            setShowApprovalLineModal(false);
                            setSelectedLineId(null);
                        }}
                    />
                )}
                {viewRejectReasonModalOpen && scheduleData.approvalSteps && (
                    <RejectModal
                        isOpen={viewRejectReasonModalOpen}
                        onClose={() => setViewRejectReasonModalOpen(false)}
                        initialReason={(() => {
                            // ✅ 반려된 단계 찾기
                            const rejectedStep = scheduleData.approvalSteps?.find(
                                (step: ApprovalStepInfo) => step.isRejected === true
                            );

                            // ✅ 반려 사유 반환 (없으면 기본 메시지)
                            return rejectedStep?.rejectionReason || '반려 사유가 기록되지 않았습니다.';
                        })()}
                        isReadOnly={true}
                        title="반려 사유 확인"
                    />
                )}
            </div>
        </Layout>
    );
};

export default WorkScheduleEditor;