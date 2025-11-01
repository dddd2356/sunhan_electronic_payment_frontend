import React, { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from 'react-router-dom';
import { useCookies } from 'react-cookie';
import axios from 'axios';
import './style.css';
import Layout from "../../../components/Layout";
import {  updateLeaveApplicationSignature, fetchUserSignatureFromDB } from '../../../apis/signatures'
import {
    approveLeaveApplication, fetchLeaveApplicationDetail, fetchLeaveApplicationSignatures, finalApproveLeaveApplication,
    rejectLeaveApplication,
    saveLeaveApplication,
    signLeaveApplication, submitLeaveApplication
} from '../../../apis/leaveApplications'; // <-- import 경로 확인 및 추가 (e.g. `../../../apis/leaveApplications`)
import { SignatureData } from "../../../types/signature";
import { SignatureState } from "../../../types/signature";
import dayjs from 'dayjs'; // 날짜 계산을 위해 dayjs 라이브러리 추가
import isBetween from 'dayjs/plugin/isBetween'; // 플러그인 추가
import RejectModal from '../../../components/RejectModal';
import LeaveAttachments from "../../../components/LeaveAttachments";
import ApprovalLineSelector from "../../../components/ApprovalLineSelector";

dayjs.extend(isBetween);

interface FlexiblePeriod {
    startDate: string;
    endDate: string;
    halfDayOption: 'all_day' | 'morning' | 'afternoon';
}

interface ApprovalData {
    position: string;
    signature: string;
    date: string;
    signatureImageUrl?: string;
    isSigned: boolean;
}

interface ApprovalLine {
    id: number;
    name: string;
    description?: string;
    steps: {
        stepOrder: number;
        stepName: string;
        approverType: string;
        approverName?: string;
        approverId?: string;
        jobLevel?: string;
        deptCode?: string;
        isOptional?: boolean;
        canSkip?: boolean;
        isFinalApprovalAvailable?: boolean;
    }[];
}

interface UserInfo {
    userId?: string;
    department: string;
    name: string;
    position: string;
    contact: string;
    phone: string;
}

interface User {
    id: string;
    name: string;
    jobLevel: string;
    role: string;
    signatureImageUrl?: string;
    deptCode?: string;
    jobType?: string;
    permissions?: string[];
}

interface AttachmentDto {
    id: number;
    originalFileName: string;
    fileType: string;
    fileSize: number;
}

interface LeaveApplicationData {
    id: number;
    applicantId: string;
    applicantName: string; // 추가
    applicantDept: string; // 추가
    applicantPosition: string; // 추가
    applicantContact: string; // 추가
    applicantPhone: string; // 추가
    substituteId: string;
    substituteName: string; // 추가
    currentApproverId: string | null;
    finalApprovalStep?: string; // 어느 단계에서 전결했는지
    // 전결 관련 필드 추가
    isFinalApproved?: boolean;
    finalApproverId?: string;
    finalApprovalDate?: string;

    leaveType: string; // string으로 변경 (LeaveType enum 대신)
    leaveDetail: string; // 추가
    startDate: string; // LocalDate -> string
    endDate: string; // LocalDate -> string
    totalDays: number; // Integer -> number
    applicationDate: string; // LocalDate -> string
    status: string; // LeaveApplicationStatus -> string
    currentApprovalStep?: string;
    rejectionReason?: string;

    isApplicantSigned: boolean; // Boolean -> boolean
    isSubstituteApproved: boolean; // Boolean -> boolean
    isDeptHeadApproved: boolean; // Boolean -> boolean
    isHrStaffApproved: boolean; // Boolean -> boolean
    isCenterDirectorApproved: boolean; // Boolean -> boolean
    isAdminDirectorApproved: boolean; // Boolean -> boolean
    isCeoDirectorApproved: boolean; // Boolean -> boolean

    createdAt: string; // LocalDateTime -> string
    updatedAt: string; // LocalDateTime -> string

    formDataJson: string; // 서명 정보만 포함
    pdfUrl?: string; // 추가 (nullable)
    printable: boolean; // 추가
    attachments?: AttachmentDto[];

    // 결재라인 추가
    approvalLine?: ApprovalLine;
    currentStepOrder?: number;
}


const LeaveApplication = () => {
    const { id } = useParams<{ id: string }>();
    const [cookies] = useCookies(['accessToken']);
    const token = cookies.accessToken;
    const navigate = useNavigate();
    const [candidates, setCandidates] = useState<{ userId: string; userName: string; jobLevel: string }[]>([]);
    const [signatures, setSignatures] = useState<Record<string, SignatureData[]>>({
        applicant: [{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
        substitute: [{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
        departmentHead: [{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
        hrStaff:        [{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
        centerDirector:[{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
        adminDirector: [{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
        ceoDirector:   [{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
    });
    const [approvalData, setApprovalData] = useState<ApprovalData[]>([
        { position: '인사담당', signature: '', date: '', signatureImageUrl: '', isSigned: false },
        { position: '진료지원센터장', signature: '', date: '', signatureImageUrl: '', isSigned: false },
        { position: '행정원장', signature: '', date: '', signatureImageUrl: '', isSigned: false },
        { position: '대표원장', signature: '', date: '', signatureImageUrl: '', isSigned: false }
    ]);
    const [isFormReadOnly, setIsFormReadOnly] = useState<boolean>(true);
    const managerKeys: (keyof SignatureState)[] = [
        'hrStaff',
        'centerDirector',
        'adminDirector',
        'ceoDirector'
    ];
    const [selectedApprovalLineId, setSelectedApprovalLineId] = useState<number | null>(null);
    const [approvalLines, setApprovalLines] = useState<ApprovalLine[]>([]);
    const [showApprovalLineSelector, setShowApprovalLineSelector] = useState(false);

    // jobLevel을 직책명으로 변환하는 함수
    const getPositionByJobLevel = (jobLevel: string | undefined): string => {
        switch (jobLevel) {
            case '0': return '사원';
            case '1': return '부서장';
            case '2': return '진료센터장';
            case '3': return '원장';
            case '4': return '행정원장';
            case '5': return '대표원장';
            default: return '';
        }
    };

    // 신청자 정보 (데이터베이스에서 가져올 예정)
    const [applicantInfo, setApplicantInfo] = useState<UserInfo>({
        department: '',
        name: '',
        position: '',
        contact: '',
        phone: ''
    });

    // 대직자 정보 (데이터베이스에서 가져올 예정)
    const [substituteInfo, setSubstituteInfo] = useState<UserInfo>({
        userId: '',
        department: '',
        name: '',
        position: '',
        contact: '',
        phone: ''
    });

    const [leaveApplication, setLeaveApplication] = useState<LeaveApplicationData | null>(null);
    const [applicationStatus, setApplicationStatus] = useState<string>('DRAFT'); // status 대신 applicationStatus 사용
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userSignatureImage, setUserSignatureImage] = useState<string | null>(null);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [viewRejectReasonModalOpen, setViewRejectReasonModalOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [canFinalApprove, setCanFinalApprove] = useState(false);
    const [isApprovable, setIsApprovable] = useState<boolean>(false); // <-- useState 선언 추가
    const [isRejectable, setIsRejectable] = useState<boolean>(false); // <-- useState 선언 추가
    const [isManager, setIsManager] = useState<boolean>(false); // <-- useState 선언 추가
    const [showRejectModal, setShowRejectModal] = useState<boolean>(false); // <-- useState 선언 추가
    const [attachments, setAttachments] = useState<AttachmentDto[]>([]);
    const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
    const [cancelReason, setCancelReason] = useState<string>('');
    const [hasHrPermission, setHasHrPermission] = useState<boolean>(false);
    // 휴가 종류 선택
    const [leaveTypes, setLeaveTypes] = useState<Record<string, boolean>>({
        연차휴가: false,
        경조휴가: false,
        특별휴가: false,
        생리휴가: false,
        보민휴가: false,
        유산사산휴가: false,
        병가: false,
        기타: false
    });

    // 휴가 내용
    const [leaveContent, setLeaveContent] = useState({
        경조휴가: '',
        특별휴가: '',
        병가: ''
    });

    //기간 정보 상태 변경
    const [flexiblePeriods, setFlexiblePeriods] = useState<FlexiblePeriod[]>([
        { startDate: '', endDate: '', halfDayOption: 'all_day' }
    ]);
    const [consecutivePeriod, setConsecutivePeriod] = useState({
        startDate: '',
        endDate: '',
    });
    const [totalDays, setTotalDays] = useState(0);
    const [applicationDate, setApplicationDate] = useState(() => {
        // 오늘 날짜를 YYYY-MM-DD 형식으로 반환
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });

    const handleFlexiblePeriodChange = (index: number, field: keyof FlexiblePeriod, value: string) => {
        setFlexiblePeriods(prev => {
            const newPeriods = [...prev];
            if (field === 'halfDayOption') {
                newPeriods[index][field] = value as 'all_day' | 'morning' | 'afternoon';
            } else {
                newPeriods[index][field] = value;
            }
            return newPeriods;
        });
    };

    const handleAddFlexiblePeriod = () => {
        setFlexiblePeriods(prev => [...prev, { startDate: '', endDate: '', halfDayOption: 'all_day' }]);
    };

    const handleRemoveFlexiblePeriod = (index: number) => {
        setFlexiblePeriods(prev => prev.filter((_, i) => i !== index));
    };

    // 기간 계산 함수
    const calculateTotalDays = useCallback(() => {
        let total = 0;
        // 연차휴가가 선택되지 않은 경우 일수 계산하지 않음
        if (!leaveTypes.연차휴가) {
            setTotalDays(0);
            return;
        }

        // 첫 번째 칸(유연한 기간) 계산
        flexiblePeriods.forEach(period => {
            if (period.startDate && period.endDate) {
                const start = dayjs(period.startDate);
                const end = dayjs(period.endDate);
                let days = end.diff(start, 'day') + 1;

                if (period.halfDayOption === 'morning' || period.halfDayOption === 'afternoon') {
                    days *= 0.5;
                }
                total += days;
            }
        });

        // 두 번째 칸(연속 기간) 계산
        if (consecutivePeriod.startDate && consecutivePeriod.endDate) {
            const start = dayjs(consecutivePeriod.startDate);
            const end = dayjs(consecutivePeriod.endDate);
            const days = end.diff(start, 'day') + 1;
            total += days;
        }

        setTotalDays(total);
    }, [flexiblePeriods, consecutivePeriod]);

    // 결재라인 목록 조회
    useEffect(() => {
        if (applicationStatus === 'DRAFT' && currentUser && id) {
            fetchApprovalLines();
            // 기존에 선택된 결재라인이 있으면 로드
            if (leaveApplication?.approvalLine) {
                setSelectedApprovalLineId(leaveApplication.approvalLine.id);
            }
        }
    }, [applicationStatus, currentUser, id]);

    const fetchApprovalLines = async () => {
        try {
            const response = await fetch(
                '/api/v1/approval-lines?documentType=LEAVE_APPLICATION',
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            if (response.ok) {
                const data = await response.json();
                setApprovalLines(data);
            }
        } catch (error) {
            console.error('결재라인 조회 실패:', error);
        }
    };
    // 결재라인 선택 모달 취소 핸들러
    const handleApprovalLineCancel = useCallback(() => {
        // 1. 모달을 닫습니다.
        setShowApprovalLineSelector(false);

        // 2. ✅ 필수 수정: 모달을 닫을 때, 이전에 선택했던 결재라인 ID를 초기화합니다.
        //    이렇게 해야 다음 제출 시 ID가 null로 인식되어 기존 제출 방식으로 돌아갈 수 있습니다.
        setSelectedApprovalLineId(null);

        // *주의: approvalLines 데이터 자체는 유지하여 다음에 모달을 열 때 즉시 보이도록 합니다.
    }, []);
    // 기간 상태 변경 시 총 기간 재계산
    useEffect(() => {
        calculateTotalDays();
    }, [flexiblePeriods, consecutivePeriod, calculateTotalDays]);

    const getCurrentDate = () => {
        return new Date().toLocaleDateString('ko-KR');
    };

    const handleLeaveTypeChange = (type: string) => {
        setLeaveTypes(prev => {
            const updated = {
                ...prev,
                [type]: !prev[type]
            };
            // 연차휴가가 선택/해제되었을 때 총 일수 재계산
            if (type === '연차휴가') {
                // 연차휴가가 해제되면 totalDays를 0으로 설정
                if (!updated[type]) {
                    setTotalDays(0);
                } else {
                    // 연차휴가가 선택되면 기존 계산 로직 실행
                    calculateTotalDays();
                }
            }

            console.log('휴가 종류 변경됨:', updated);
            return updated;
        });
    };

    // 목록으로 이동
    const goToList = () => {
        navigate("/detail/leave-application");
    };

    // 현재 폼 데이터를 백엔드와 동기화하는 함수
    const syncFormData = useCallback(async () => {
        if (!leaveApplication || !id) return;

        // 선택된 휴가 종류만 배열로 변환
        const selectedLeaveTypes = Object.keys(leaveTypes).filter(key => leaveTypes[key]);

        // 유효한 flexiblePeriods만 필터링 (startDate와 endDate가 모두 있는 것만)
        const validFlexiblePeriods = flexiblePeriods.filter(p =>
            p.startDate && p.startDate.trim() !== '' &&
            p.endDate && p.endDate.trim() !== ''
        );

        // 유효한 consecutivePeriod 확인
        const validConsecutivePeriod = (
            consecutivePeriod.startDate && consecutivePeriod.startDate.trim() !== '' &&
            consecutivePeriod.endDate && consecutivePeriod.endDate.trim() !== ''
        ) ? consecutivePeriod : null;

        // totalDays 재계산 및 검증
        let calculatedTotalDays = 0;

        // flexiblePeriods 계산
        validFlexiblePeriods.forEach(period => {
            if (period.startDate && period.endDate) {
                const start = dayjs(period.startDate);
                const end = dayjs(period.endDate);
                let days = end.diff(start, 'day') + 1;

                if (period.halfDayOption === 'morning' || period.halfDayOption === 'afternoon') {
                    days *= 0.5;
                }
                calculatedTotalDays += days;
            }
        });

        // consecutivePeriod 계산
        if (validConsecutivePeriod) {
            const start = dayjs(validConsecutivePeriod.startDate);
            const end = dayjs(validConsecutivePeriod.endDate);
            const days = end.diff(start, 'day') + 1;
            calculatedTotalDays += days;
        }

        // totalDays가 0 이하인 경우 오류 처리
        if (calculatedTotalDays <= 0) {
            throw new Error('유효한 휴가 기간을 입력해주세요. 총 휴가 일수가 0일보다 커야 합니다.');
        }

        // 백엔드 LeaveApplicationUpdateFormRequestDto 구조에 맞는 payload 생성
        const payload = {
            applicantInfo: applicantInfo,
            substituteInfo: substituteInfo.userId ? {
                userId: substituteInfo.userId,
                name: substituteInfo.name,
                position: substituteInfo.position
            } : null,
            leaveTypes: selectedLeaveTypes,
            leaveContent: leaveContent,
            flexiblePeriods: validFlexiblePeriods, // 유효한 기간만 전송
            consecutivePeriod: validConsecutivePeriod, // 유효한 경우에만 전송
            totalDays: calculatedTotalDays, // 재계산된 값 사용
            applicationDate: applicationDate || null,
            signatures: signatures,
            // currentApprovalStep은 제출할 때만 필요하므로 임시저장에서는 제외
        };

        console.log('임시저장 payload:', payload); // 디버깅용

        try {
            // 새로운 API 함수 사용
            await saveLeaveApplication(parseInt(id), payload, token);
            console.log('폼 데이터 동기화 완료');
        } catch (error) {
            console.error('폼 데이터 동기화 실패:', error);
            throw error;
        }
    }, [id, applicantInfo, substituteInfo, leaveTypes, leaveContent, flexiblePeriods, consecutivePeriod, totalDays, applicationDate, signatures, token]);

    // 임시저장 함수 (수정된 버전)
    const handleSave = useCallback(async () => {
        if (!leaveApplication || !id) return;

        try {
            // 기본 유효성 검사
            const selectedLeaveTypes = Object.keys(leaveTypes).filter(key => leaveTypes[key]);
            if (selectedLeaveTypes.length === 0) {
                alert('휴가 종류를 하나 이상 선택해주세요.');
                return;
            }

            // 유효한 기간이 있는지 확인
            const hasValidFlexiblePeriod = flexiblePeriods.some(p =>
                p.startDate && p.startDate.trim() !== '' &&
                p.endDate && p.endDate.trim() !== ''
            );

            const hasValidConsecutivePeriod = (
                consecutivePeriod.startDate && consecutivePeriod.startDate.trim() !== '' &&
                consecutivePeriod.endDate && consecutivePeriod.endDate.trim() !== ''
            );

            if (!hasValidFlexiblePeriod && !hasValidConsecutivePeriod) {
                alert('최소 하나의 유효한 휴가 기간을 입력해주세요.');
                return;
            }

            await syncFormData();
            alert('임시저장 되었습니다.');
            navigate("/detail/leave-application");
        } catch (error: any) {
            console.error('임시저장 실패:', error);
            alert(`임시저장에 실패했습니다: ${error.message}`);
        }
    }, [syncFormData, navigate, leaveTypes, flexiblePeriods, consecutivePeriod]);


    // 휴가원 삭제 (작성중인 신청서, 신청자 본인만)
    const handleDelete = async () => {
        if (!id || !token || !leaveApplication) {
            alert('삭제할 휴가원 정보가 없습니다.');
            return;
        }

        // 안전 확인
        if (!window.confirm('정말 이 휴가원을 삭제하시겠습니까? (복구 불가)')) return;

        try {
            const resp = await axios.delete(`/api/v1/leave-application/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (resp.status >= 200 && resp.status < 300) {
                alert('휴가원이 삭제되었습니다.');
                // 목록으로 이동하거나 원하는 동작
                navigate('/detail/leave-application');
            } else {
                alert('삭제에 실패했습니다.');
            }
        } catch (error: any) {
            console.error('삭제 실패:', error);
            if (axios.isAxiosError(error)) {
                const msg = error.response?.data?.error || `삭제 실패: ${error.response?.status}`;
                alert(msg);
            } else {
                alert('삭제 중 오류가 발생했습니다.');
            }
        }
    };

    // 신청자 제출 (다음단계로 전송)
    const handleSubmitToSubstitute = async () => {
        if (!leaveApplication || !id) {
            alert("휴가원 데이터가 유효하지 않습니다.");
            return;
        }

        // 1. 결재라인 선택 확인
        if (!selectedApprovalLineId) {
            if (approvalLines.length > 0) {
                // 결재라인이 있으면 선택 모달 표시
                setShowApprovalLineSelector(true);
                return;
            } else {
                // 결재라인이 없으면 경고 후 기존 방식으로 진행
                const confirmOldWay = window.confirm(
                    '사용 가능한 결재라인이 없습니다.\n기존 방식(하드코딩된 결재 흐름)으로 제출하시겠습니까?'
                );
                if (!confirmOldWay) {
                    return;
                }
            }
        }

        // 2. JobLevel 0 사용자는 대직자 필수
        if (currentUser?.jobLevel === "0" && (!substituteInfo || !substituteInfo.userId)) {
            alert("먼저 대직자를 선택하세요.");
            return;
        }

        // 3. 신청자 서명 확인
        if (!signatures.applicant?.[0]?.isSigned) {
            alert("신청자 서명이 필요합니다.");
            return;
        }

        // 4. 사용자 정보 확인
        if (!currentUser || !currentUser.id) {
            alert("로그인된 사용자 정보를 찾을 수 없습니다.");
            return;
        }

        // 5. 휴가 종류 검증
        const selectedLeaveTypes = Object.keys(leaveTypes).filter(key => leaveTypes[key]);
        if (selectedLeaveTypes.length === 0) {
            alert("휴가 종류를 하나 이상 선택해주세요.");
            return;
        }

        try {
            // 6. 폼 데이터 동기화 (임시저장)
            await syncFormData();

            // // 서명 완료 후
            await loadSignatures();

            // 8. 제출 API 호출
            const submitPayload: any = {
                approvalLineId: selectedApprovalLineId
            };

            const response = await axios.post(
                `/api/v1/leave-application/${id}/submit`,
                submitPayload,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            if (response.status >= 200 && response.status < 300) {
                alert("제출이 완료되었습니다.");
                navigate("/detail/leave-application");
            }
        } catch (error: any) {
            console.error("전송 실패:", error);
            if (axios.isAxiosError(error)) {
                const errorMessage = error.response?.data?.error || error.message;
                alert(`전송 중 오류가 발생했습니다: ${errorMessage}`);
            } else {
                alert(`전송 중 오류가 발생했습니다: ${error.message}`);
            }
        }
    };


    // 결재라인 선택 확인 핸들러
    const handleApprovalLineConfirm = () => {
        if (!selectedApprovalLineId) {
            alert('결재라인을 선택해주세요.');
            return;
        }
        setShowApprovalLineSelector(false);
        // 선택 완료 후 자동으로 제출 진행
        setTimeout(() => {
            handleSubmitToSubstitute();
        }, 100);
    };

    // 대직자 승인
    const handleSubstituteApproval = async () => {
        if (!leaveApplication || !id || !currentUser) return;

        // ✅ 1. 'status'를 기준으로 새 로직(결재라인)을 사용할지 결정합니다.
        // status가 'PENDING'이면 새 결재라인, 'PENDING_SUBSTITUTE'이면 이전 하드코딩 로직입니다.
        const usingApprovalLine = leaveApplication.status === 'PENDING';

        if (!signatures.substitute?.[0]?.isSigned) {
            alert('대직자 서명이 필요합니다.');
            return;
        }

        try {
            // ✅ 2. 새 결재라인 로직을 사용합니다.
            if (usingApprovalLine) {
                const signatureImageUrl = signatures.substitute?.[0]?.imageUrl;

                const response = await axios.put(
                    `/api/v1/leave-application/${id}/approve-with-line`, // <--- ✅ 새 API 호출
                    {
                        comment: '대직자 승인',
                        signatureImageUrl: signatureImageUrl,
                        isFinalApproval: false // 대직자는 전결이 아님
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                setLeaveApplication(response.data);
                setApplicationStatus(response.data.status);
                alert('대직자 승인이 완료되었습니다.');

            } else {
                // ✅ 3. 이전 하드코딩 로직 (하위 호환성 유지)
                const response = await axios.put(
                    `/api/v1/leave-application/${id}/approve`, // <--- ❌ 이전 API 호출
                    { signatureDate: getCurrentDate() },
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                setLeaveApplication(response.data);
                setApplicationStatus(response.data.status);
                alert('대직자 승인이 완료되었습니다. 다음 승인자에게 전송됩니다.');
            }

            navigate('/detail/leave-application');

        } catch (error: any) {
            console.error('승인 실패:', error);
            const msg = axios.isAxiosError(error)
                ? error.response?.data?.error || '알 수 없는 오류'
                : error.message;
            alert(`승인 중 오류가 발생했습니다: ${msg}`);
        }
    };

    const checkApprovalPermissions = useCallback((app: LeaveApplicationData, user: User) => {
        const usingApprovalLine = app.approvalLine != null;
        let canApproveCurrent = false;

        if (usingApprovalLine) {
            // ✅ 결재라인 사용 시: currentApproverId만으로 판단
            canApproveCurrent = (user.id === app.currentApproverId);
        } else {
            // ❌ 하드코딩 방식 (하위 호환용 - 제거 예정)
            const currentStep = app.currentApprovalStep;
            const isHRStaff = (currentUser?: User) => {
                return !!currentUser?.permissions?.includes("HR_LEAVE_APPLICATION") &&
                    (["0", "1"].includes(currentUser.jobLevel)) &&
                    (currentUser.role === "ADMIN");
            };

            switch (currentStep) {
                case "SUBSTITUTE_APPROVAL":
                    canApproveCurrent = (user.id === app.substituteId);
                    break;
                case "DEPARTMENT_HEAD_APPROVAL":
                    canApproveCurrent = (user.jobLevel === "1" && user.deptCode === applicantInfo.department);
                    break;
                case "HR_STAFF_APPROVAL":
                    canApproveCurrent = isHRStaff(user);
                    break;
                case "CENTER_DIRECTOR_APPROVAL":
                    canApproveCurrent = (user.jobLevel === "2");
                    break;
                case "HR_FINAL_APPROVAL":
                    canApproveCurrent = isHRStaff(user);
                    break;
                case "ADMIN_DIRECTOR_APPROVAL":
                    canApproveCurrent = (user.jobLevel === "4");
                    break;
                case "CEO_DIRECTOR_APPROVAL":
                    canApproveCurrent = (user.jobLevel === "5");
                    break;
                default:
                    canApproveCurrent = false;
            }
        }

        setIsApprovable(canApproveCurrent);
        setIsRejectable(canApproveCurrent);
        setIsManager(canApproveCurrent);
    }, [applicantInfo.department]);


    // 전결 권한 확인 함수 (백엔드 로직과 일치시켜야 함)
    const checkFinalApprovalRight = useCallback((user: User, app: LeaveApplicationData) => {
        if (!user || !user.jobLevel) {
            setCanFinalApprove(false);
            return;
        }

        // ✅ 결재라인 사용 시
        if (app.approvalLine) {
            // History에서 현재 단계의 전결 가능 여부 확인
            const currentProcess = app.approvalLine.steps?.find(
                step => step.stepOrder === app.currentStepOrder
            );

            // 현재 승인자이면서 전결 가능한 단계인 경우
            const isCurrentApprover = (user.id === app.currentApproverId);
            const canFinalApproveThisStep = currentProcess?.isFinalApprovalAvailable ?? false;

            setCanFinalApprove(isCurrentApprover && canFinalApproveThisStep);
            return;
        }

        // ❌ 하드코딩 방식 (하위 호환용 - 제거 예정)
        const currentStep = app.currentApprovalStep;
        const jobLevelNum = parseInt(user.jobLevel);

        const isHRStaff = !!(
            user.permissions?.includes("HR_LEAVE_APPLICATION") &&
            (["0", "1"].includes(user.jobLevel)) &&
            (user.role === "ADMIN")
        );

        if (currentStep === "HR_FINAL_APPROVAL") {
            setCanFinalApprove(isHRStaff);
            return;
        }

        if (jobLevelNum >= 2 &&
            (currentStep === "CENTER_DIRECTOR_APPROVAL" ||
                currentStep === "ADMIN_DIRECTOR_APPROVAL" ||
                currentStep === "CEO_DIRECTOR_APPROVAL")) {
            setCanFinalApprove(true);
        } else {
            setCanFinalApprove(false);
        }
    }, []);

    // 관리자 승인 (부서장, 인사담당, 센터장, 원장들)
    // handleManagerApproval 함수 전체 교체
    const handleManagerApproval = async (action: 'approve' | 'reject', rejectionReason?: string) => {

        if (!leaveApplication || !id || !token || !currentUser) {
            alert("휴가원 정보 또는 권한 정보가 부족합니다.");
            return;
        }

        // ✅ 'status'가 'PENDING'인지 확인하여 결재라인 사용 여부를 결정합니다.
        const usingApprovalLine = leaveApplication.status === 'PENDING'; // <--- ✅ 이렇게 수정합니다.

        // 승인 전, 현재 단계에 맞는 서명이 완료되었는지 확인
        if (action === 'approve' && !usingApprovalLine) {
            const currentStep = leaveApplication.currentApprovalStep;
            let signatureKey: keyof SignatureState | null = null;

            switch (currentStep) {
                case "DEPARTMENT_HEAD_APPROVAL": signatureKey = "departmentHead"; break;
                case "HR_STAFF_APPROVAL":        signatureKey = "hrStaff"; break;
                case "CENTER_DIRECTOR_APPROVAL": signatureKey = "centerDirector"; break;
                case "ADMIN_DIRECTOR_APPROVAL":  signatureKey = "adminDirector"; break;
                case "CEO_DIRECTOR_APPROVAL":    signatureKey = "ceoDirector"; break;
            }

            if (signatureKey && !signatures[signatureKey]?.[0]?.isSigned) {
                alert("승인 전 서명을 먼저 진행해주세요.");
                return;
            }
        }

        try {
            if (action === 'approve') {
                // ✅ 결재라인 사용 여부에 따라 다른 API 호출
                if (usingApprovalLine) {
                    const currentStep = leaveApplication.currentApprovalStep;
                    let signatureKey: keyof SignatureState | null = null;

                    switch (currentStep) {
                        case "DEPARTMENT_HEAD_APPROVAL": signatureKey = "departmentHead"; break;
                        case "HR_STAFF_APPROVAL":        signatureKey = "hrStaff"; break;
                        case "CENTER_DIRECTOR_APPROVAL": signatureKey = "centerDirector"; break;
                        case "ADMIN_DIRECTOR_APPROVAL":  signatureKey = "adminDirector"; break;
                        case "CEO_DIRECTOR_APPROVAL":    signatureKey = "ceoDirector"; break;
                    }

                    //const signatureImageUrl = signatureKey ? signatures[signatureKey]?.[0]?.imageUrl : null;
                    const signatureImageUrl = userSignatureImage;
                    const response = await axios.put(
                        `/api/v1/leave-application/${id}/approve-with-line`,
                        {
                            comment: '',
                            signatureImageUrl: signatureImageUrl,
                            isFinalApproval: false
                        },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );

                    setLeaveApplication(response.data);
                    setApplicationStatus(response.data.status);
                    alert("승인이 완료되었습니다.");
                } else {
                    // 기존 방식
                    const response = await approveLeaveApplication(parseInt(id), getCurrentDate(), token);
                    setLeaveApplication(response);
                    setApplicationStatus(response.status);
                    alert("휴가원이 승인되었습니다.");
                }

                await loadSignatures();
            } else if (action === 'reject') {
                if (!rejectionReason || rejectionReason.trim() === '') {
                    alert("반려 사유를 입력해주세요.");
                    return;
                }

                // ✅ 결재라인 사용 여부에 따라 다른 API 호출
                if (usingApprovalLine) {
                    const response = await axios.put(
                        `/api/v1/leave-application/${id}/reject-with-line`,
                        { rejectionReason: rejectionReason },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );

                    setLeaveApplication(response.data);
                    setApplicationStatus(response.data.status);
                    alert("휴가원이 반려되었습니다.");
                } else {
                    // 기존 방식
                    const response = await rejectLeaveApplication(parseInt(id), rejectionReason, token);
                    setLeaveApplication(response);
                    setApplicationStatus(response.status);
                    alert("휴가원이 반려되었습니다.");
                }

                setShowRejectModal(false);
            }

            if (currentUser) {
                const updatedApp = await fetchLeaveApplicationDetail(parseInt(id), token);
                checkApprovalPermissions(updatedApp, currentUser);
                navigate("/detail/leave-application");
            }

        } catch (error: any) {
            console.error(`휴가원 ${action === 'approve' ? '승인' : '반려'} 실패:`, error);
            alert(`오류: ${error.message}`);
        }
    };

    // handleFinalApproval 함수도 수정
    const handleFinalApproval = async () => {
        if (!leaveApplication || !id || !token || !currentUser) {
            alert("휴가원 정보 또는 권한 정보가 부족합니다.");
            return;
        }

        const usingApprovalLine = leaveApplication.status === 'PENDING';
        const currentStep = leaveApplication.currentApprovalStep;
        let signatureKey: keyof SignatureState | null = null;

        switch (currentStep) {
            case "DEPARTMENT_HEAD_APPROVAL": signatureKey = "departmentHead"; break;
            case "HR_STAFF_APPROVAL":        signatureKey = "hrStaff"; break;
            case "HR_FINAL_APPROVAL":
                break;
            case "CENTER_DIRECTOR_APPROVAL": signatureKey = "centerDirector"; break;
            case "ADMIN_DIRECTOR_APPROVAL":  signatureKey = "adminDirector"; break;
            case "CEO_DIRECTOR_APPROVAL":    signatureKey = "ceoDirector"; break;
        }

        if (signatureKey && !signatures[signatureKey]?.[0]?.isSigned && !usingApprovalLine) {
            alert("전결 승인 전 서명을 먼저 진행해주세요.");
            return;
        }

        if (!window.confirm('전결 승인하시겠습니까? 이후 모든 승인 단계가 완료 처리됩니다.')) {
            return;
        }

        try {
            // ✅ 결재라인 사용 여부에 따라 다른 API 호출
            if (usingApprovalLine) {
                const signatureImageUrl = (() => {
                    if (!signatureKey) return (userSignatureImage || null);
                    const sigItem = signatures[signatureKey]?.[0];
                    if (sigItem?.imageUrl) return sigItem.imageUrl;
                    // 이미 로컬에 등록된 서명 이미지가 있으면 사용
                    if (userSignatureImage) return userSignatureImage;
                    // 없으면 null (이 경우 버튼을 disabled 하거나 사용자에게 알림)
                    return null;
                })();

                const response = await axios.put(
                    `/api/v1/leave-application/${id}/approve-with-line`,
                    {
                        comment: '전결 승인',
                        signatureImageUrl: signatureImageUrl,
                        isFinalApproval: true
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                setLeaveApplication(response.data);
                setApplicationStatus(response.data.status);
            } else {
                // 기존 방식
                const response = await finalApproveLeaveApplication(parseInt(id), token);
                setLeaveApplication(response);
                setApplicationStatus(response.status);
            }

            await loadSignatures();
            alert("전결 승인이 완료되었습니다.");
            navigate("/detail/leave-application");
        } catch (error: any) {
            console.error('전결 승인 실패:', error);
            alert(`오류: ${error.message}`);
        }
    };

    const loadSignatures = useCallback(async () => {
        if (!id || !token) return;
        try {
            const signaturesData = await fetchLeaveApplicationSignatures(parseInt(id), token);

            // 안전한 서명 데이터 업데이트
            setSignatures(prev => {
                const newSignatures = { ...prev };
                const signatureTypes = [
                    'applicant', 'substitute', 'departmentHead',
                    'hrStaff', 'centerDirector', 'adminDirector', 'ceoDirector'
                ];

                signatureTypes.forEach(type => {
                    const backendSignature = signaturesData.signatures?.[type]?.[0];

                    if (backendSignature) {
                        newSignatures[type] = [{
                            text: backendSignature.text || '',
                            imageUrl: backendSignature.imageUrl || undefined,
                            isSigned: Boolean(backendSignature.isSigned),
                            signatureDate: backendSignature.signatureDate || ''
                        }];
                    } else if (!newSignatures[type]) {
                        newSignatures[type] = [{
                            text: '',
                            imageUrl: undefined,
                            isSigned: false,
                            signatureDate: undefined
                        }];
                    }
                });

                return newSignatures;
            });

            // LeaveApplicationData의 boolean 필드들 업데이트
            if (leaveApplication) {
                setLeaveApplication(prev => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        isApplicantSigned: Boolean(signaturesData.isApplicantSigned),
                        isSubstituteApproved: Boolean(signaturesData.isSubstituteApproved),
                        isDeptHeadApproved: Boolean(signaturesData.isDeptHeadApproved),
                        isHrStaffApproved: Boolean(signaturesData.isHrStaffApproved),
                        isCenterDirectorApproved: Boolean(signaturesData.isCenterDirectorApproved),
                        isFinalHrApproved: Boolean(signaturesData.isFinalHrApproved),
                        isAdminDirectorApproved: Boolean(signaturesData.isAdminDirectorApproved),
                        isCeoDirectorApproved: Boolean(signaturesData.isCeoDirectorApproved),
                    };
                });
            }

            console.log('서명 데이터 로드 완료:', signaturesData);

        } catch (error) {
            console.error('휴가신청서 서명 로드 실패', error);

            // 로드 실패 시 기본값으로 초기화
            const defaultSignatures: Record<string, { text: string; imageUrl?: string; isSigned: boolean; signatureDate: undefined; }[]> = {};
            const signatureTypes = ['applicant', 'substitute', 'departmentHead', 'hrStaff', 'centerDirector', 'adminDirector', 'ceoDirector'];

            signatureTypes.forEach(type => {
                defaultSignatures[type] = [{
                    text: '',
                    imageUrl: undefined,
                    isSigned: false,
                    signatureDate: undefined
                }];
            });

            setSignatures(defaultSignatures);
        }
    }, [id, token, leaveApplication]);


    // 서명 클릭 핸들러 수정
    const handleSignatureClick = useCallback(async (signatureKey: keyof SignatureState) => {
        if (!currentUser) {
            alert('로그인 정보가 없습니다.');
            return;
        }

        if (!leaveApplication) {
            alert('휴가원 정보를 불러올 수 없습니다.');
            return;
        }

        if (!userSignatureImage) {
            console.warn('서명 이미지가 null입니다. 서명을 완료하지 못했습니다.');
            return;
        }

        const currentSignature = signatures[signatureKey]?.[0];
        const correctedBase64 = userSignatureImage.startsWith('data:image/')
            ? userSignatureImage
            : `data:image/png;base64,${userSignatureImage}`;


        // 이미 서명된 경우 - 서명 취소 확인
        if (currentSignature?.isSigned) {
            let isCurrentUserSigner = false;
            //서명자 본인만 서명 취소 가능하도록 권한 확인
            switch (signatureKey) {
                case 'applicant':
                    isCurrentUserSigner = (currentUser.id === leaveApplication.applicantId);
                    break;
                case 'substitute':
                    isCurrentUserSigner = (currentUser.id === leaveApplication.substituteId);
                    break;
                case 'departmentHead':
                    // 부서장 서명은 부서 코드와 직급을 확인합니다.
                    isCurrentUserSigner = (currentUser.jobLevel === "1" && currentUser.deptCode === applicantInfo.department);
                    break;
                case 'hrStaff':
                    // 인사팀 직원 서명 권한 확인
                    isCurrentUserSigner = !!(
                        currentUser.permissions?.includes("HR_LEAVE_APPLICATION") &&
                        ["0", "1"].includes(currentUser.jobLevel) &&
                        (currentUser.role === "ADMIN" || currentUser.role === "HR")
                    );
                    break;
                case 'centerDirector':
                    isCurrentUserSigner = (currentUser.jobLevel === "2");
                    break;
                case 'adminDirector':
                    isCurrentUserSigner = (currentUser.jobLevel === "4");
                    break;
                case 'ceoDirector':
                    isCurrentUserSigner = (currentUser.jobLevel === "5");
                    break;
                default:
                    isCurrentUserSigner = false;
            }
            if (isCurrentUserSigner) {
                if (window.confirm('서명을 취소하시겠습니까?')) {
                    try {
                        // 서명 취소 API 호출 (null 전달)
                        const response = await updateLeaveApplicationSignature(
                            parseInt(id!),
                            signatureKey as string, // signatureType
                            null, // 서명 취소
                            token!
                        );

                        // 성공 시 프론트엔드 상태 업데이트
                        setSignatures(prev => ({
                            ...prev,
                            [signatureKey]: [{text: '', imageUrl: undefined, isSigned: false}]
                        }));

                        console.log(`${signatureKey} 서명 취소 성공`, response);

                        // 휴가원 데이터 다시 로드 (서명 상태 동기화)
                        const updatedAppResponse = await axios.get(`/api/v1/leave-application/${id}`, {
                            headers: {Authorization: `Bearer ${token}`}
                        });
                        setLeaveApplication(updatedAppResponse.data);
                        setApplicationStatus(updatedAppResponse.data.status);

                        // 권한 다시 체크
                        checkApprovalPermissions(updatedAppResponse.data, currentUser);

                    } catch (error) {
                        console.error('서명 취소 실패:', error);
                        if (axios.isAxiosError(error)) {
                            const errorMessage = error.response?.data?.error || '서명 취소 중 오류가 발생했습니다.';
                            alert(`오류: ${errorMessage}`);
                        } else {
                            alert('서명 취소 중 오류가 발생했습니다.');
                        }
                    }
                }
                return;
            }
        }

        // 서명되지 않은 경우 - 서명 진행
        if (!userSignatureImage) {
            if (window.confirm('등록된 서명이 없습니다. 서명을 먼저 등록하시겠습니까?')) {
                window.location.href = '/profile/signature';
            }
            return;
        }

        // 서명 전에 대직자가 선택되었는지 확인합니다.
        if (
            signatureKey === 'applicant' &&
            leaveApplication.status === 'DRAFT' &&
            currentUser.jobLevel === "0" &&
            (!substituteInfo || !substituteInfo.userId)
            ) {
            alert("신청자 서명 전에 대직자를 먼저 선택해야 합니다.");
            return;
        }

        // 서명할 권한이 있는지 확인 (기존 로직 동일)
        let canSign = false;
        const currentStep = leaveApplication.currentApprovalStep;

        switch (signatureKey) {
            case 'applicant':
                canSign = (currentUser.id === leaveApplication.applicantId);
                break;
            case 'substitute':
                canSign = (currentUser.id === leaveApplication.substituteId && currentStep === 'SUBSTITUTE_APPROVAL');
                break;
            case 'departmentHead':
                canSign = (currentUser.jobLevel === "1" && currentUser.deptCode === applicantInfo.department && currentStep === 'DEPARTMENT_HEAD_APPROVAL');
                break;
            case 'hrStaff':
                canSign = !!(
                    currentUser.permissions?.includes("HR_LEAVE_APPLICATION") &&
                    ["0", "1"].includes(currentUser.jobLevel) &&
                    (currentUser.role === "ADMIN" || currentUser.role === "HR") &&
                    currentStep === 'HR_STAFF_APPROVAL'
                );
                break;
            case 'centerDirector':
                canSign = (currentUser.jobLevel === "2" && currentStep === 'CENTER_DIRECTOR_APPROVAL');
                break;
            case 'adminDirector':
                canSign = (currentUser.jobLevel === "4" && currentStep === 'ADMIN_DIRECTOR_APPROVAL');
                break;
            case 'ceoDirector':
                canSign = (currentUser.jobLevel === "5" && currentStep === 'CEO_DIRECTOR_APPROVAL');
                break;
            default:
                canSign = false;
        }

        if (!checkCanSign(signatureKey)) {
            alert('서명할 권한이 없습니다.');
            return;
        }

        // 서명 확인
        if (window.confirm('서명하시겠습니까?')) {
            const currentDate = new Date().toISOString();
            try {
                if (signatureKey === 'applicant' && leaveApplication.status === 'DRAFT' && substituteInfo && substituteInfo.userId) {
                    // 서명 직전에 서버에서 최신 데이터를 다시 불러옵니다.
                    const freshAppResponse = await axios.get(`/api/v1/leave-application/${id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const freshAppData = freshAppResponse.data;

                    // 최신 데이터와 로컬 상태의 대직자 정보를 합쳐서 완전한 페이로드를 만듭니다.
                    const updatePayload = {
                        ...freshAppData,
                        substituteId: substituteInfo.userId,
                        substituteName: substituteInfo.name,
                    };

                    await axios.put(
                        `/api/v1/leave-application/${id}/substitute`,
                        updatePayload,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                }

                // 올바른 데이터 구조로 API 호출
                const response = await axios.put(
                    `/api/v1/leave-application/${id}/sign`,
                    {
                        signerId: currentUser.id,
                        signerType: signatureKey,
                        signatureEntry: {
                            text: '승인',
                            imageUrl: correctedBase64,
                            isSigned: true,
                            signatureDate: currentDate
                        }
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                // 성공 시 프론트엔드 상태 업데이트
                setSignatures(prev => ({
                    ...prev,
                    [signatureKey]: [{ text: '승인', imageUrl: userSignatureImage, isSigned: true, signatureDate: currentDate }]
                }));

                console.log(`${signatureKey} 서명 성공`, response);

                // 휴가원 데이터 다시 로드 (서명 상태 동기화)
                const updatedAppResponse = await axios.get(`/api/v1/leave-application/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setLeaveApplication(updatedAppResponse.data);
                setApplicationStatus(updatedAppResponse.data.status);

                // 권한 다시 체크
                if (currentUser) {
                    checkApprovalPermissions(updatedAppResponse.data, currentUser);
                }
            } catch (error) {
                console.error('서명 업데이트 실패:', error);
                if (axios.isAxiosError(error)) {
                    const errorMessage = error.response?.data?.error || '서명 업데이트 중 오류가 발생했습니다.';
                    alert(`오류: ${errorMessage}`);
                } else {
                    alert('서명 업데이트 중 오류가 발생했습니다.');
                }
            }
        }
    }, [currentUser, userSignatureImage, signatures, leaveApplication, id, token, applicantInfo.department, checkApprovalPermissions]);

    const checkCanSign = useCallback((signatureKey: keyof SignatureState) => {
        if (!currentUser || !leaveApplication) return false;

        // ✅ 신청자 서명은 항상 DRAFT 상태에서만 가능
        if (signatureKey === 'applicant') {
            return (currentUser.id === leaveApplication.applicantId &&
                leaveApplication.status === 'DRAFT');
        }

        // ✅ DRAFT 상태에서는 신청자 외 다른 서명 불가
        if (leaveApplication.status === 'DRAFT') {
            return false;
        }

        // 결재라인 사용 여부 확인
        const usingApprovalLine = leaveApplication.approvalLine != null;

        if (usingApprovalLine) {
            // 결재라인 기반 - currentApproverId로만 판단
            return currentUser.id === leaveApplication.currentApproverId;
        }

    }, [currentUser, leaveApplication, applicantInfo]);

    // 인사권한 확인
    useEffect(() => {
        if (currentUser) {
            const hasPermission = currentUser.permissions?.includes('HR_LEAVE_APPLICATION') ?? false;
            setHasHrPermission(hasPermission);
        }
    }, [currentUser]);

    // 완료된 휴가원 취소 핸들러
    const handleCancelApproved = async (cancellationReason: string) => {
        if (!leaveApplication || !id || !token) {
            alert('휴가원 정보가 없습니다.');
            return;
        }

        if (!cancellationReason || cancellationReason.trim() === '') {
            alert('취소 사유를 입력해주세요.');
            return;
        }

        if (!window.confirm('승인 완료된 휴가원을 취소하시겠습니까? (연차가 복구됩니다)')) {
            return;
        }

        try {
            const response = await axios.put(
                `/api/v1/leave-application/${id}/cancel-approved`,
                { cancellationReason: cancellationReason },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (response.status === 200) {
                alert('휴가원이 취소되었습니다. 연차가 복구되었습니다.');
                setShowCancelModal(false);
                navigate('/detail/leave-application');
            }
        } catch (error: any) {
            console.error('휴가원 취소 실패:', error);
            if (axios.isAxiosError(error)) {
                const errorMessage = error.response?.data?.error || '휴가원 취소 중 오류가 발생했습니다.';
                alert(`오류: ${errorMessage}`);
            } else {
                alert('휴가원 취소 중 오류가 발생했습니다.');
            }
        }
    };

    // PDF 다운로드 함수
    const handleDownload = useCallback(
        async (type: 'pdf') => {
            if (!id || !token) return;
            try {
                const resp = await fetch(
                    `/api/v1/leave-application/${id}/${type}`,
                    {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${token}` },
                    }
                );
                if (!resp.ok) throw new Error(`${type.toUpperCase()} 다운로드 실패: ${resp.status}`);
                const blob = await resp.blob();
                const filename = `leave_application_${id}.${type}`;
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } catch (e: any) {
                console.error(e);
                alert(e.message);
            }
        },
        [id, token]
    );

    useEffect(() => {
        const fetchApplicationData = async () => {
            if (!id || !token) {
                navigate('/detail/leave-application');
                return;
            }

            try {
                // 1. 현재 사용자 정보 및 서명 이미지 가져오기
                const userRes = await axios.get('/api/v1/user/me', { headers: { Authorization: `Bearer ${token}` } });
                const userData = userRes.data;
                const fetchedUser: User = {
                    id: String(userData.userId),
                    name: String(userData.userName || userData.name || ''),
                    jobLevel: String(userData.jobLevel || ''),
                    role: String(userData.role || ''),
                    signatureImageUrl: userData.signatureImageUrl ? String(userData.signatureImageUrl) : undefined,
                    deptCode: userData.deptCode ? String(userData.deptCode) : undefined,
                    jobType: userData.jobType ? String(userData.jobType) : undefined,
                    permissions: userData.permissions || [],
                };
                setCurrentUser(fetchedUser);

                const userSigImg = await fetchUserSignatureFromDB(token);
                setUserSignatureImage(userSigImg);

                // 2. 휴가원 상세 데이터 가져오기
                const appResponse = await axios.get(`/api/v1/leave-application/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const appData = appResponse.data;
                setLeaveApplication(appData);

                // appData.attachments가 있을 경우 AttachmentDto 형태로 안전 매핑합니다.
                if (appData.attachments && Array.isArray(appData.attachments)) {
                    const mappedAttachments = appData.attachments.map((a: any) => ({
                        id: Number(a.id ?? a.attachmentId ?? 0),
                        originalFileName: String(a.originalFileName ?? a.name ?? a.filename ?? ''),
                        fileType: String(a.fileType ?? a.contentType ?? a.mimeType ?? ''),
                        fileSize: Number(a.fileSize ?? a.size ?? 0)
                    }));
                    setAttachments(mappedAttachments);
                } else {
                    setAttachments([]);
                }

                setSubstituteInfo(prev => ({
                    ...prev,
                    userId: appData.substituteId,
                    name: appData.substituteName,
                    position: appData.substitutePosition
                }));
                setApplicationStatus(appData.status);

                // 2-1. 대직자 후보 목록을 로드
                try {
                    const subsResp = await axios.get(
                        '/api/v1/leave-application/substitute-candidates',
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    setCandidates(subsResp.data);
                } catch (e) {
                    console.warn('대직자 후보 로드 실패:', e);
                    setCandidates([]);
                }

                // ** formData 변수 타입을 'any'로 명시하여 TypeScript 오류 해결**
                let formData: any = {};
                if (appData.formDataJson) {
                    try {
                        formData = JSON.parse(appData.formDataJson);
                        console.log('[fetchApplicationData] Parsed formDataJson:', formData);
                    } catch (e) {
                        console.error('Failed to parse formDataJson:', e);
                    }
                }

                // **parsedData 또는 appData에서 데이터 추출**
                const applicantInfoFromData = formData.applicantInfo || {
                    userId: appData.applicantId,
                    department: appData.applicantDept,
                    name: appData.applicantName,
                    position: getPositionByJobLevel(fetchedUser.jobLevel),
                    contact: appData.applicantContact,
                    phone: appData.applicantPhone
                };
                setApplicantInfo(applicantInfoFromData);

                // leaveTypes 배열을 Record<string, boolean>으로 변환
                const initialLeaveTypes: Record<string, boolean> = {
                    연차휴가: false, 경조휴가: false, 특별휴가: false, 생리휴가: false,
                    보민휴가: false, 유산사산휴가: false, 병가: false, 기타: false
                };

                const leaveTypesArray = formData.leaveTypes || [];
                console.log('백엔드에서 받은 leaveTypes:', leaveTypesArray);

                // 배열의 각 요소를 true로 설정
                leaveTypesArray.forEach((type: string) => {
                    if (type in initialLeaveTypes) {
                        initialLeaveTypes[type] = true;
                    }
                });

                // 상태 업데이트
                setLeaveTypes(initialLeaveTypes);

                // **[수정] leaveContent가 문자열일 경우, 객체로 변환하여 상태에 설정**
                const newLeaveContent = {
                    경조휴가: '',
                    특별휴가: '',
                    병가: '',
                };

                // formData.leaveContent가 문자열이면 해당하는 필드에 값을 할당
                if (typeof formData.leaveContent === 'string') {
                    if (initialLeaveTypes['경조휴가']) {
                        newLeaveContent['경조휴가'] = formData.leaveContent;
                    } else if (initialLeaveTypes['특별휴가']) {
                        newLeaveContent['특별휴가'] = formData.leaveContent;
                    } else if (initialLeaveTypes['병가']) {
                        newLeaveContent['병가'] = formData.leaveContent;
                    }
                }

                // 기존 formData.leaveContent가 객체였으면 그대로 사용
                if (formData.leaveContent && typeof formData.leaveContent === 'object') {
                    Object.assign(newLeaveContent, formData.leaveContent);
                }

                setLeaveContent(newLeaveContent);

                // flexiblePeriods 및 consecutivePeriod 설정
                const savedFlexiblePeriods = formData.flexiblePeriods || [];
                const savedConsecutivePeriod = formData.consecutivePeriod || { startDate: '', endDate: '' };
                setFlexiblePeriods(savedFlexiblePeriods.length > 0 ? savedFlexiblePeriods : [
                    { startDate: '', endDate: '', halfDayOption: 'all_day' }
                ]);
                setConsecutivePeriod(savedConsecutivePeriod);
                setTotalDays(formData.totalDays || appData.totalDays || 0);
                const savedApplicationDate = formData.applicationDate || appData.applicationDate;
                if (savedApplicationDate && savedApplicationDate.trim() !== '') {
                    setApplicationDate(savedApplicationDate);
                } else {
                    // 저장된 날짜가 없으면 오늘 날짜로 설정
                    const today = new Date();
                    const year = today.getFullYear();
                    const month = String(today.getMonth() + 1).padStart(2, '0');
                    const day = String(today.getDate()).padStart(2, '0');
                    setApplicationDate(`${year}-${month}-${day}`);
                }

                // **[수정] 서명 정보 설정 - 기존 방식 제거하고 새로운 방식 적용**
                // 3. 서명 정보 초기화 후 로드
                // 먼저 기본 서명 상태 초기화
                const defaultSignatures: Record<string, SignatureData[]> = {};
                const signatureTypes = ['applicant', 'substitute', 'departmentHead', 'hrStaff', 'centerDirector', 'adminDirector', 'ceoDirector'];

                signatureTypes.forEach(type => {
                    defaultSignatures[type] = [{
                        text: '',
                        imageUrl: undefined,
                        isSigned: false,
                        signatureDate: undefined
                    }];
                });

                // 기본값으로 초기화
                setSignatures(defaultSignatures);

                // 4. 실제 서명 데이터 로드 (백엔드 API에서 가져오기)
                try {
                    const sigResponse = await axios.get(`/api/v1/leave-application/${id}/signatures`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const signaturesData = sigResponse.data;
                    // 백엔드에서 받은 서명 데이터로 상태 업데이트
                    setSignatures(prev => {
                        const newSignatures = { ...prev };

                        signatureTypes.forEach(type => {
                            const backendSignature = signaturesData.signatures?.[type]?.[0];

                            if (backendSignature) {
                                newSignatures[type] = [{
                                    text: backendSignature.text || '',
                                    imageUrl: backendSignature.imageUrl,
                                    isSigned: Boolean(backendSignature.isSigned),
                                    signatureDate: backendSignature.signatureDate
                                }];
                            }
                        });

                        return newSignatures;
                    });

                    // LeaveApplicationData의 boolean 필드들도 동기화
                    setLeaveApplication(prevApp => {
                        if (!prevApp) return prevApp;

                        return {
                            ...prevApp,
                            isApplicantSigned: Boolean(signaturesData.isApplicantSigned),
                            isSubstituteApproved: Boolean(signaturesData.isSubstituteApproved),
                            isDeptHeadApproved: Boolean(signaturesData.isDeptHeadApproved),
                            isHrStaffApproved: Boolean(signaturesData.isHrStaffApproved),
                            isCenterDirectorApproved: Boolean(signaturesData.isCenterDirectorApproved),
                            isFinalHrApproved: Boolean(signaturesData.isFinalHrApproved),
                            isAdminDirectorApproved: Boolean(signaturesData.isAdminDirectorApproved),
                            isCeoDirectorApproved: Boolean(signaturesData.isCeoDirectorApproved),
                        };
                    });

                } catch (sigError) {
                    console.error('서명 데이터 로드 실패:', sigError);
                    // 서명 로드 실패해도 전체 로딩은 계속 진행
                    // 기본값으로 초기화된 상태 유지
                }

                console.log('[fetchApplicationData] Data fetch completed successfully.');

                // **[제거] 기존의 parseSignaturesFromLeaveApplicationData와 loadSignatures 호출 제거**
                // 위에서 직접 서명 API를 호출하여 처리했으므로 중복 호출 방지

            } catch (error) {
                console.error('휴가원 데이터 가져오기 실패:', error);
                if (axios.isAxiosError(error) && error.response?.status === 404) {
                    alert('휴가원을 찾을 수 없습니다.');
                } else {
                    alert('휴가원 데이터를 가져오는 중 오류가 발생했습니다.');
                }
                navigate('/detail/leave-application');
            }
        };

        fetchApplicationData();
    }, [id, token, navigate]);

    useEffect(() => {
        async function loadCandidates() {
            try {
                // 모든 사용자가 같은 부서 직원을 볼 수 있도록 변경
                const resp = await axios.get('/api/v1/leave-application/substitute-candidates', {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (resp.status === 200) {
                    setCandidates(resp.data);
                    console.log('대직자 후보 목록 로드 성공:', resp.data);
                }
            } catch (e) {
                console.error('대직자 후보 로드 실패', e);
                if (axios.isAxiosError(e)) {
                    if (e.response?.status === 403) {
                        console.log('대직자 후보 조회 권한 없음');
                    } else if (e.response?.status === 404) {
                        console.log('같은 부서 직원이 없음');
                    } else {
                        console.error('대직자 후보 API 오류:', e.response?.data);
                    }
                }
                setCandidates([]);
            }
        }

        // ★ 여기만 Draft + jobLevel==='0' 일 때만 실행
        if (
            applicationStatus === 'DRAFT' &&
            currentUser?.jobLevel === '0'
        ) {
            loadCandidates();
        } else {
            setCandidates([]);  // 그 외엔 빈 배열
        }
    }, [token, currentUser]);

    // 기존 useEffect 아래에 추가
    useEffect(() => {
        // substituteInfo가 변경될 때 leaveApplication 상태 동기화
        if (substituteInfo && leaveApplication && leaveApplication.substituteId !== substituteInfo.userId) {
            setLeaveApplication(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    // substituteInfo.userId가 undefined일 경우 빈 문자열 할당
                    substituteId: substituteInfo.userId || '',
                    // substituteInfo.name이 undefined일 경우 빈 문자열 할당
                    substituteName: substituteInfo.name || '',
                };
            });
        }
    }, [substituteInfo, leaveApplication, setLeaveApplication]);

    // signatures가 바뀔 때마다 approvalData 자동 동기화
    useEffect(() => {
        console.log('signatures 변경됨:', signatures);
        setApprovalData(prev =>
            prev.map((item, index) => {
                const key = managerKeys[index];
                const sig = signatures[key]?.[0];
                if (sig?.isSigned) {
                    return {
                        position: item.position,
                        signature: '승인',
                        date: sig.signatureDate || new Date().toISOString(),
                        signatureImageUrl: sig.imageUrl,
                        isSigned: true
                    };
                } else {
                    return {
                        position: item.position,
                        signature: '',
                        date: '',
                        signatureImageUrl: '',
                        isSigned: false
                    };
                }
            })
        );
    }, [signatures]);

    useEffect(() => {
        if (currentUser && leaveApplication) {
            checkFinalApprovalRight(currentUser, leaveApplication);
        }
    }, [currentUser, leaveApplication, checkFinalApprovalRight]);

    useEffect(() => {
        if (leaveApplication && currentUser) {
            // 휴가원 상태가 'DRAFT'이고 현재 사용자가 신청자일 때만 수정 가능하도록 설정
            const isEditable = leaveApplication.status === 'DRAFT' && leaveApplication.applicantId === currentUser.id;
            setIsFormReadOnly(!isEditable);
        }
    }, [leaveApplication, currentUser]);

    if (!leaveApplication) {
        return <Layout>
            <div className="loading">
                로딩 중...
            </div>
        </Layout>;
    }

    return (
        <Layout>
            <div className="leave-application-container">
                <div className="leave-application-wrapper">
                    <div className="common-list">
                        선한공통서식지 - 05
                    </div>
                    {/* 제목과 결재 테이블 */}
                    <div className="header-section">
                        <h1 className="leave-application-title">
                            (&nbsp;&nbsp;&nbsp; 휴가 &nbsp;&nbsp;&nbsp;) 원
                        </h1>
                        <div className="flex-container">
                            <div className="table-container">
                                <table className="approval-table">
                                    <tbody>
                                    <tr>
                                        <th className="approval-header-cell" rowSpan={4}>
                                            결<br/>재
                                        </th>
                                        <th className="position-header-cell" rowSpan={2}>
                                            인사담당
                                        </th>
                                        <th className="position-header-cell" rowSpan={2}>
                                            진료지원<br/>센터장
                                        </th>
                                        <th className="approval-group-header" colSpan={2}>
                                            승인
                                        </th>
                                    </tr>
                                    <tr>
                                        <th className="position-header-cell">
                                            행정원장
                                        </th>
                                        <th className="position-header-cell">
                                            대표원장
                                        </th>
                                    </tr>
                                    <tr>
                                        {approvalData.map((item, index) => {
                                            const positionMap: Record<number, keyof SignatureState> = {
                                                0: 'hrStaff',
                                                1: 'centerDirector',
                                                2: 'adminDirector',
                                                3: 'ceoDirector'
                                            };
                                            const sigKey = positionMap[index];
                                            const signatureState = signatures[sigKey]?.[0];

                                            const flagMap: Record<number, boolean> = {
                                                0: leaveApplication?.isHrStaffApproved ?? false,
                                                1: leaveApplication?.isCenterDirectorApproved ?? false,
                                                2: leaveApplication?.isAdminDirectorApproved ?? false,
                                                3: leaveApplication?.isCeoDirectorApproved ?? false
                                            };

                                            const stepMap: Record<number, string> = {
                                                0: 'HR_STAFF_APPROVAL',
                                                1: 'CENTER_DIRECTOR_APPROVAL',
                                                2: 'ADMIN_DIRECTOR_APPROVAL',
                                                3: 'CEO_DIRECTOR_APPROVAL'
                                            };

                                            const currentStepForIndex = stepMap[index];
                                            const finalApprovalStep = leaveApplication?.finalApprovalStep;

                                            // ✅ 실제 전결 처리한 단계인지 확인
                                            const isActualFinalApprovalStep = (
                                                leaveApplication?.status === 'APPROVED' &&
                                                leaveApplication?.isFinalApproved &&
                                                finalApprovalStep === currentStepForIndex
                                            );

                                            // ✅ 전결로 인해 자동 승인된 단계인지 확인
                                            const isAutoApprovedByFinal = (
                                                leaveApplication?.status === 'APPROVED' &&
                                                leaveApplication?.isFinalApproved &&
                                                finalApprovalStep &&
                                                flagMap[index] && // 승인 플래그가 true
                                                signatureState?.isSkipped === true // ✅ isSkipped 플래그 확인
                                            );

                                            return (
                                                <td key={index} className="signature-cell">
                                                    <div
                                                        className="signature-area"
                                                        onClick={() => handleSignatureClick(sigKey)}
                                                    >
                                                        {(() => {
                                                            // ✅ 1. sig.text 우선! (전결 "전결처리!" 표시)
                                                            if (signatureState?.text === '전결처리!') {
                                                                return (
                                                                    <div className="final-approval-mark">
                                                                        <span>{signatureState.text}</span><br/>
                                                                        <small>{signatureState.signerName || ''}</small>
                                                                    </div>
                                                                );
                                                            }

                                                            // ✅ 2. 이미지 있음
                                                            if (signatureState?.imageUrl && !signatureState?.isSkipped) {
                                                                return <img src={signatureState.imageUrl.startsWith('data:image/') ? signatureState.imageUrl : `data:image/png;base64,${signatureState.imageUrl}`} alt="" style={{width:70,height:'auto'}} />;
                                                            }

                                                            // ✅ 3. 일반 승인
                                                            if (signatureState?.isSigned) {
                                                                return <span className="signature-text">{signatureState.text || '승인'}</span>;  // ← text 우선!
                                                            }

                                                            // 4. 대기
                                                            return <span className="signature-placeholder">클릭하여 서명 후 승인</span>;
                                                        })()}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                    <tr>
                                        {approvalData.map((item, index) => {
                                            const positionMap: Record<number, keyof SignatureState> = {
                                                0: 'hrStaff',
                                                1: 'centerDirector',
                                                2: 'adminDirector',
                                                3: 'ceoDirector'
                                            };
                                            const sigKey = positionMap[index];
                                            const signatureState = signatures[sigKey]?.[0];

                                            const flagMap: Record<number, boolean> = {
                                                0: leaveApplication?.isHrStaffApproved ?? false,
                                                1: leaveApplication?.isCenterDirectorApproved ?? false,
                                                2: leaveApplication?.isAdminDirectorApproved ?? false,
                                                3: leaveApplication?.isCeoDirectorApproved ?? false
                                            };

                                            const stepMap: Record<number, string> = {
                                                0: 'HR_STAFF_APPROVAL',
                                                1: 'CENTER_DIRECTOR_APPROVAL',
                                                2: 'ADMIN_DIRECTOR_APPROVAL',
                                                3: 'CEO_DIRECTOR_APPROVAL'
                                            };

                                            const currentStepForIndex = stepMap[index];
                                            const finalApprovalStep = leaveApplication?.finalApprovalStep;

                                            // 실제 전결 처리한 단계인지 확인
                                            const isActualFinalApprovalStep = (
                                                leaveApplication?.status === 'APPROVED' &&
                                                leaveApplication?.isFinalApproved &&
                                                finalApprovalStep === currentStepForIndex
                                            );

                                            // 전결로 인해 자동 승인된 단계인지 확인
                                            const isAutoApprovedByFinal = (
                                                leaveApplication?.status === 'APPROVED' &&
                                                leaveApplication?.isFinalApproved &&
                                                finalApprovalStep &&
                                                flagMap[index] && // 승인 플래그가 true
                                                !signatureState?.isSigned && // 실제 서명은 없음
                                                !isActualFinalApprovalStep // 실제 전결 처리한 단계가 아님
                                            );

                                            return (
                                                <td key={index} className="slash-cell">
                                                    {(() => {
                                                        // 1. 실제 서명이 있는 경우 - 서명 날짜 우선 표시
                                                        if (signatureState?.isSigned && signatureState?.signatureDate) {
                                                            return dayjs(signatureState.signatureDate).format('YYYY. MM. DD.');
                                                        }

                                                        // 2. 전결 승인된 경우의 날짜 로직
                                                        if (leaveApplication?.status === 'APPROVED' && leaveApplication?.isFinalApproved) {
                                                            // 실제 전결 처리한 단계 또는 자동 승인된 단계의 경우 전결 승인 날짜 표시
                                                            if (isActualFinalApprovalStep || isAutoApprovedByFinal) {
                                                                // finalApprovalDate가 있으면 사용, 없으면 updatedAt 사용
                                                                const approvalDate = leaveApplication?.finalApprovalDate || leaveApplication?.updatedAt;
                                                                return approvalDate
                                                                    // dayjs를 사용하여 형식 변경
                                                                    ? dayjs(approvalDate).format('YYYY. MM. DD.')
                                                                    : '/';
                                                            }
                                                        }

                                                        // 3. item.date가 있으면 표시 (기존 승인 데이터)
                                                        if (item.date) {
                                                            // dayjs를 사용하여 형식 변경
                                                            return dayjs(item.date).format('YYYY. MM. DD.');
                                                        }

                                                        // 4. 그 외의 경우 '/' 표시
                                                        return '/';
                                                    })()}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* 신청서 본문 */}
                    <div className="form-body">
                        <table className="main-table">
                            <tbody>
                            {/* 신청자 정보 */}
                            <tr>
                                <th className="main-header" rowSpan={4}>신<br/>청<br/>자</th>
                                <th className="sub-header">소속</th>
                                <td className="input-cell" colSpan={3}>
                                    <input
                                        type="text"
                                        value={applicantInfo.department}
                                        onChange={(e) => setApplicantInfo(prev => ({
                                            ...prev,
                                            department: e.target.value
                                        }))}
                                        readOnly={isFormReadOnly}
                                        className="form-input"
                                        placeholder="소속 입력"
                                    />
                                </td>
                                <th className="sub-header">부서장 확인란</th>
                            </tr>
                            <tr>
                                <th className="sub-header">성명</th>
                                <td className="input-cell" colSpan={3}>
                                    <input
                                        type="text"
                                        value={applicantInfo.name}
                                        onChange={(e) => setApplicantInfo(prev => ({...prev, name: e.target.value}))}
                                        readOnly={true}
                                        className="form-input"
                                        placeholder="성명 입력"
                                    />
                                </td>
                                <td className="signature-box" rowSpan={3}>
                                    <div
                                        className="signature-area-main"
                                        onClick={() => handleSignatureClick('departmentHead')}
                                    >
                                        {(
                                            signatures.departmentHead?.[0]?.isSigned
                                            || leaveApplication?.isDeptHeadApproved
                                        ) ? (
                                            signatures.departmentHead?.[0]?.imageUrl
                                                ? <img
                                                    src={
                                                        signatures.departmentHead[0].imageUrl.startsWith('data:image/')
                                                            ? signatures.departmentHead[0].imageUrl
                                                            : `data:image/png;base64,${signatures.departmentHead[0].imageUrl}`
                                                    }
                                                    alt="부서장 서명"
                                                    className="signature-image"
                                                    style={{
                                                        width: 120,
                                                        height: 'auto',
                                                        objectFit: 'contain'
                                                    }}
                                                />
                                                : <div className="signature-text">확인</div>
                                        ) : (
                                            <div className="signature-placeholder">클릭하여 서명</div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <th className="sub-header">직책</th>
                                <td className="input-cell" colSpan={3}>
                                    <input
                                        type="text"
                                        value={applicantInfo?.position}
                                        readOnly={isFormReadOnly}
                                        className="form-input"
                                        placeholder="직책"
                                    />
                                </td>
                            </tr>
                            <tr>
                                <th className="sub-header">연락처</th>
                                <td className="input-cell" colSpan={3}>
                                    <div className="contact-inputs">
                                        <span>주소:</span>
                                        <input
                                            type="text"
                                            value={applicantInfo.contact}
                                            onChange={(e) => setApplicantInfo(prev => ({
                                                ...prev,
                                                contact: e.target.value
                                            }))}
                                            readOnly={true}
                                            className="form-input"
                                            placeholder="주소 입력"
                                        />
                                        <br/>
                                        <span>전화번호:</span>
                                        <input
                                            type="text"
                                            value={applicantInfo.phone}
                                            onChange={(e) => setApplicantInfo(prev => ({
                                                ...prev,
                                                phone: e.target.value
                                            }))}
                                            readOnly={true}
                                            className="form-input"
                                            placeholder="전화번호 입력"
                                        />
                                    </div>
                                </td>
                            </tr>

                            {/* 신청 내역 */}
                            <tr>
                                <th className="main-header" rowSpan={5}>신<br/>청<br/>내<br/>역</th>
                                <th className="sub-header" rowSpan={4}>종류</th>
                                <td className="leave-type-cell" colSpan={4}>
                                    <div className="leave-types">
                                        <div className="leave-type-row">
                                            {Object.entries(leaveTypes).slice(0, 3).map(([type, checked]) => (
                                                <label key={type} className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => handleLeaveTypeChange(type)}
                                                        disabled={isFormReadOnly}
                                                    />
                                                    {type}
                                                </label>
                                            ))}
                                        </div>
                                        <div className="leave-type-row">
                                            {Object.entries(leaveTypes).slice(3, 6).map(([type, checked]) => (
                                                <label key={type} className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => handleLeaveTypeChange(type)}
                                                        disabled={isFormReadOnly}
                                                    />
                                                    {type}
                                                </label>
                                            ))}
                                        </div>
                                        <div className="leave-type-row">
                                            {Object.entries(leaveTypes).slice(6).map(([type, checked]) => (
                                                <label style={{marginRight: 26}} key={type} className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => handleLeaveTypeChange(type)}
                                                        disabled={isFormReadOnly}
                                                    />
                                                    {type}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <th className="sub-header">경조휴가</th>
                                <td className="input-cell" colSpan={3}>
                                    <input
                                        type="text"
                                        value={leaveContent.경조휴가}
                                        onChange={(e) => setLeaveContent(prev => ({...prev, 경조휴가: e.target.value}))}
                                        className="form-input"
                                        placeholder="내용"
                                        disabled={isFormReadOnly}
                                    />
                                </td>
                            </tr>
                            <tr>
                                <th className="sub-header">특별휴가</th>
                                <td className="input-cell" colSpan={3}>
                                    <input
                                        type="text"
                                        value={leaveContent.특별휴가}
                                        onChange={(e) => setLeaveContent(prev => ({...prev, 특별휴가: e.target.value}))}
                                        className="form-input"
                                        placeholder="내용"
                                        disabled={isFormReadOnly}
                                    />
                                </td>
                            </tr>
                            <tr>
                                <th className="sub-header">병가</th>
                                <td className="input-cell" colSpan={3}>
                                    <input
                                        type="text"
                                        value={leaveContent.병가}
                                        onChange={(e) => setLeaveContent(prev => ({...prev, 병가: e.target.value}))}
                                        className="form-input"
                                        placeholder="내용"
                                        disabled={isFormReadOnly}
                                    />
                                </td>
                            </tr>

                            {/* 기간 */}
                            <tr>
                                <th className="main-header" rowSpan={1}>기간</th>
                                <td className="period-cell" colSpan={3}>
                                    {/* 개별 기간 */}
                                    <div className="period-container">
                                        {flexiblePeriods.length > 0 ? (
                                            // flexiblePeriods에 데이터가 있으면 모든 항목을 렌더링
                                            flexiblePeriods.map((period, index) => (
                                                <div key={index} className="period-row-group">
                                                    <div className="period-input-group">
                                                        <input
                                                            type="date"
                                                            value={period.startDate}
                                                            onChange={(e) => handleFlexiblePeriodChange(index, 'startDate', e.target.value)}
                                                            className="form-input"
                                                            readOnly={isFormReadOnly}
                                                        />
                                                        <span> ~ </span>
                                                        <input
                                                            type="date"
                                                            value={period.endDate}
                                                            onChange={(e) => handleFlexiblePeriodChange(index, 'endDate', e.target.value)}
                                                            className="form-input"
                                                            readOnly={isFormReadOnly}
                                                        />
                                                    </div>
                                                    <span className="period-input-group-half-day">
                                                        <label><input
                                                            type="radio"
                                                            name={`halfDayOption-${index}`}
                                                            value="all_day"
                                                            checked={period.halfDayOption === 'all_day'}
                                                            onChange={(e) => handleFlexiblePeriodChange(index, 'halfDayOption', e.target.value)}
                                                            disabled={isFormReadOnly}
                                                        /> 종일</label>
                                                        <label><input
                                                            type="radio"
                                                            name={`halfDayOption-${index}`}
                                                            value="morning"
                                                            checked={period.halfDayOption === 'morning'}
                                                            onChange={(e) => handleFlexiblePeriodChange(index, 'halfDayOption', e.target.value)}
                                                            disabled={isFormReadOnly}
                                                        /> 오전</label>
                                                        <label><input
                                                            type="radio"
                                                            name={`halfDayOption-${index}`}
                                                            value="afternoon"
                                                            checked={period.halfDayOption === 'afternoon'}
                                                            onChange={(e) => handleFlexiblePeriodChange(index, 'halfDayOption', e.target.value)}
                                                            disabled={isFormReadOnly}
                                                        /> 오후</label>
                                                    </span>
                                                    {flexiblePeriods.length > 1 && (
                                                        <button type="button"
                                                                onClick={() => handleRemoveFlexiblePeriod(index)}
                                                                disabled={isFormReadOnly}>-</button>
                                                    )}
                                                    <button type="button" onClick={handleAddFlexiblePeriod}
                                                            disabled={isFormReadOnly}>+
                                                        기간 추가
                                                    </button>
                                                </div>
                                            ))
                                        ) : (
                                            // flexiblePeriods가 비어있으면 기본 기간 입력란과 버튼을 렌더링
                                            <div className="period-row-group">
                                                <div className="period-input-group">
                                                    <input
                                                        type="date"
                                                        value="" // 빈 값으로 초기화
                                                        onChange={(e) => handleFlexiblePeriodChange(0, 'startDate', e.target.value)}
                                                        className="form-input"
                                                        readOnly={isFormReadOnly}
                                                    />
                                                    <span> ~ </span>
                                                    <input
                                                        type="date"
                                                        value="" // 빈 값으로 초기화
                                                        onChange={(e) => handleFlexiblePeriodChange(0, 'endDate', e.target.value)}
                                                        className="form-input"
                                                        readOnly={isFormReadOnly}
                                                    />
                                                </div>
                                                <span className="period-input-group-half-day">
                                                        <label><input
                                                            type="radio"
                                                            name="halfDayOption-0"
                                                            value="all_day"
                                                            checked={true} // 기본값으로 종일 선택
                                                            onChange={(e) => handleFlexiblePeriodChange(0, 'halfDayOption', e.target.value)}
                                                            disabled={isFormReadOnly}
                                                        /> 종일</label>
                                                        <label><input
                                                            type="radio"
                                                            name="halfDayOption-0"
                                                            value="morning"
                                                            checked={false}
                                                            onChange={(e) => handleFlexiblePeriodChange(0, 'halfDayOption', e.target.value)}
                                                            disabled={isFormReadOnly}
                                                        /> 오전</label>
                                                        <label><input
                                                            type="radio"
                                                            name="halfDayOption-0"
                                                            value="afternoon"
                                                            checked={false}
                                                            onChange={(e) => handleFlexiblePeriodChange(0, 'halfDayOption', e.target.value)}
                                                            disabled={isFormReadOnly}
                                                        /> 오후</label>
                                                    </span>
                                                <button type="button" onClick={handleAddFlexiblePeriod}
                                                        disabled={isFormReadOnly}>+
                                                    기간 추가
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="total-days-cell" rowSpan={1}>
                                    총 기간: {totalDays} 일
                                </td>
                            </tr>

                            {/* 대직자 */}
                            <tr>
                                <th className="main-header" colSpan={2}>대직자</th>
                                <td className="substitute-cell" colSpan={3}>
                                    <div className="substitute-info">
                                        {/* 직책 입력은 항상 가능 */}
                                        <span>직책:</span>
                                        <input
                                            type="text"
                                            value={substituteInfo.position}
                                            readOnly
                                            className="form-input-inline"
                                            placeholder="직책"
                                        />

                                        {/* 성명 선택은 JobLevel=0 사용자만 */}
                                        <span>성명:</span>
                                        {applicationStatus === 'DRAFT' && currentUser?.jobLevel === '0' ? (
                                            <select
                                                value={substituteInfo.userId}
                                                onChange={e => {
                                                    const sel = candidates.find(u => u.userId === e.target.value);
                                                    if (sel) {
                                                        setSubstituteInfo({
                                                            userId: sel.userId,
                                                            name: sel.userName,
                                                            position: getPositionByJobLevel(sel.jobLevel),
                                                            department: '',
                                                            contact: '',
                                                            phone: ''
                                                        });
                                                    }
                                                }}
                                                className="form-input-inline"
                                                disabled={isFormReadOnly || candidates.length === 0}
                                            >
                                                <option value="">
                                                    {candidates.length === 0 ? "— 대직자 후보 없음 —" : "— 대직자 선택 —"}
                                                </option>
                                                {candidates.map(u => (
                                                    <option key={u.userId} value={u.userId}>
                                                        {u.userName}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={substituteInfo.name || '— 미지정 —'}
                                                readOnly
                                                className="form-input-inline disabled"
                                            />
                                        )}

                                        {/* 선택된 대직자가 해당 API로 전송되고,
                                            그 사람은 사인 클릭(handleSignatureClick('substitute'))로 서명 가능 */}
                                        <div
                                            className="signature-inline"
                                            onClick={() => handleSignatureClick('substitute')}
                                        >
                                            {(
                                                signatures.substitute?.[0]?.isSigned
                                                || leaveApplication?.isSubstituteApproved
                                            ) ? (
                                                signatures.substitute[0]?.imageUrl
                                                    ? <img
                                                        src={
                                                            signatures.substitute[0].imageUrl.startsWith('data:image/')
                                                                ? signatures.substitute[0].imageUrl
                                                                : `data:image/png;base64,${signatures.substitute[0].imageUrl}`
                                                        }
                                                        alt="대직자 서명"
                                                        className="signature-image-inline"
                                                        style={{
                                                            width: 60,
                                                            height: 'auto',
                                                            objectFit: 'contain'
                                                        }}
                                                    />
                                                    : '(사인이 이미 서명되었습니다.)'
                                            ) : (
                                                '(인)'
                                            )}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                            </tbody>
                        </table>

                        {/* 하단 텍스트 */}
                        <div className="bottom-text">
                            위와 같이 ( 휴가 ) 원을 제출하오니 허가하여 주시기 바랍니다.
                        </div>

                        {/* 날짜 및 신청인 서명 */}

                        <div className="signature">
                            <div className="date-section">
                                <input
                                    type="text"
                                    value={applicationDate.split('-')[0] || ''} // 연도 추출
                                    onChange={(e) => {
                                        const parts = applicationDate.split('-');
                                        setApplicationDate(`${e.target.value || ''}-${parts[1] || ''}-${parts[2] || ''}`);
                                    }}
                                    className="date-input"
                                    placeholder="2024"
                                    readOnly={isFormReadOnly} // 이 줄 추가
                                />
                                <span>년</span>
                                <input
                                    type="text"
                                    value={applicationDate.split('-')[1] || ''} // 월 추출
                                    onChange={(e) => {
                                        const parts = applicationDate.split('-');
                                        setApplicationDate(`${parts[0] || ''}-${e.target.value || ''}-${parts[2] || ''}`);
                                    }}
                                    className="date-input"
                                    placeholder="12"
                                    readOnly={isFormReadOnly} // 이 줄 추가
                                />
                                <span>월</span>
                                <input
                                    type="text"
                                    value={applicationDate.split('-')[2] || ''} // 일 추출
                                    onChange={(e) => {
                                        const parts = applicationDate.split('-');
                                        setApplicationDate(`${parts[0] || ''}-${parts[1] || ''}-${e.target.value || ''}`);
                                    }}
                                    className="date-input"
                                    placeholder="25"
                                    readOnly={isFormReadOnly} // 이 줄 추가
                                />
                                <span>일</span>
                            </div>

                            <div className="applicant-signature">
                                <span>위 신청인 : </span>
                                <input
                                    type="text"
                                    value={applicantInfo.name}
                                    onChange={(e) => setApplicantInfo(prev => ({...prev, name: e.target.value}))}
                                    className="form-input-inline"
                                    placeholder="성명 입력"
                                />
                                <span
                                    className="signature-inline"
                                    onClick={() => handleSignatureClick('applicant')}
                                >
                                    {/* signatures.applicant의 첫 번째 요소에 signatureImageUrl이 있고, isSigned가 true인 경우 */}
                                    {signatures.applicant?.[0]?.imageUrl && signatures.applicant?.[0]?.isSigned ? (
                                        <img
                                            src={signatures.applicant[0].imageUrl}
                                            alt="신청인 서명"
                                            className="actual-signature-image" // 이미지 스타일링을 위한 클래스 추가
                                        />
                                    ) : (
                                        // isSigned는 true이지만 signatureImageUrl이 없는 경우 (또는 isSigned만 true인 경우)
                                        signatures.applicant?.[0]?.isSigned ? (
                                            '(사인이 이미 서명되었습니다.)' // 또는 '사인이 이미 서명되었습니다.' 메시지 사용
                                        ) : (
                                            // 서명이 아직 안 된 경우
                                            '(서명 또는 인)'
                                        )
                                    )}
                                 </span>
                            </div>
                        </div>
                    </div>

                    <div className="editor-footer" style={{textAlign: 'center', margin: '20px 0'}}>
                        <div className="logo">
                            <img
                                src="/newExecution.ico"
                                alt="Logo"
                                style={{width: '40px', height: '40px'}}
                            />
                            <span style={{fontSize: '30px', color: '#000', marginLeft:'5px'}}>
                                선한병원
                            </span>
                        </div>
                        <div className="common-footer" style={{marginBottom: '30px'}}>
                            SUNHAN HOSPITIAL
                        </div>

                        <LeaveAttachments
                            leaveApplicationId={leaveApplication.id}
                            token={token!}
                            initialAttachments={attachments.length ? attachments : (leaveApplication.attachments || [])}
                            disabled={isFormReadOnly}
                            readOnly={applicationStatus !== 'DRAFT'}
                            onChange={(newAttachments) => {
                                setAttachments(newAttachments);
                                setLeaveApplication(prev => prev ? { ...prev, attachments: newAttachments } : prev);
                            }}
                        />

                        {/* 신청자가 초안 상태일 때 */}
                        {applicationStatus === 'DRAFT' && (
                            <>
                                <button onClick={goToList} className="btn-list">목록으로</button>
                                <button onClick={handleSave} className="btn-save">임시저장</button>
                                <button onClick={handleSubmitToSubstitute} className="btn-send"
                                        disabled={!signatures.applicant?.[0]?.isSigned}>
                                    {currentUser?.jobLevel === "0" ? "대직자에게 전송" : "전송하기"}
                                </button>
                                {/* 삭제 버튼: 오직 작성중(DRAFT)이고 신청자 본인일 때만 표시 */}
                                {currentUser?.id === leaveApplication?.applicantId && (
                                    <button
                                        onClick={handleDelete}
                                        className="btn-delete"
                                    >
                                        삭제하기
                                    </button>
                                )}
                            </>
                        )}
                        
                        {/* 관리자가 승인할 때 - 결재라인 기반 */}
                        {(
                            applicationStatus === 'PENDING' &&
                            leaveApplication?.currentApproverId === currentUser?.id
                        ) && (
                            <>
                                <button onClick={goToList} className="btn-list">목록으로</button>
                                <button onClick={() => setRejectModalOpen(true)} className="btn-reject">반려하기</button>
                                <button
                                    onClick={() => handleManagerApproval('approve')}
                                    className="btn-approve"
                                    disabled={(() => {
                                        // ✅ 결재라인에서 현재 단계의 서명 타입 확인
                                        const currentProcess = leaveApplication?.approvalLine?.steps?.find(
                                            step => step.stepOrder === leaveApplication?.currentStepOrder
                                        );

                                        const signatureKey = currentProcess?.approverType === 'SUBSTITUTE' ? 'substitute' :
                                            currentProcess?.approverType === 'DEPARTMENT_HEAD' ? 'departmentHead' :
                                                currentProcess?.approverType === 'HR_STAFF' ? 'hrStaff' :
                                                    currentProcess?.approverType === 'CENTER_DIRECTOR' ? 'centerDirector' :
                                                        currentProcess?.approverType === 'ADMIN_DIRECTOR' ? 'adminDirector' :
                                                            currentProcess?.approverType === 'CEO_DIRECTOR' ? 'ceoDirector' : null;

                                        return signatureKey ? !signatures[signatureKey]?.[0]?.isSigned : true;
                                    })()}
                                >
                                    승인하기
                                </button>
                                {canFinalApprove && (
                                    <button
                                        onClick={() => handleFinalApproval()}
                                        className="btn-final-approve"
                                        disabled={(() => {
                                            const currentProcess = leaveApplication?.approvalLine?.steps?.find(
                                                step => step.stepOrder === leaveApplication?.currentStepOrder
                                            );

                                            const signatureKey = currentProcess?.approverType === 'SUBSTITUTE' ? 'substitute' :
                                                currentProcess?.approverType === 'DEPARTMENT_HEAD' ? 'departmentHead' :
                                                    currentProcess?.approverType === 'HR_STAFF' ? 'hrStaff' :
                                                        currentProcess?.approverType === 'CENTER_DIRECTOR' ? 'centerDirector' :
                                                            currentProcess?.approverType === 'ADMIN_DIRECTOR' ? 'adminDirector' :
                                                                currentProcess?.approverType === 'CEO_DIRECTOR' ? 'ceoDirector' : null;

                                            return signatureKey ? !signatures[signatureKey]?.[0]?.isSigned : true;
                                        })()}
                                    >
                                        전결
                                    </button>
                                )}
                            </>
                        )}

                        {/* 완료된 상태 */}
                        {applicationStatus === 'APPROVED' && (
                            <>
                                <button onClick={goToList} className="btn-list">목록으로</button>
                                {hasHrPermission && (
                                    <button
                                        onClick={() => setShowCancelModal(true)}
                                        className="btn-cancel-approved"
                                        style={{
                                            backgroundColor: '#dc3545',
                                            color: 'white',
                                            marginLeft: '10px'
                                        }}
                                    >
                                        취소(반려)
                                    </button>
                                )}
                                <button onClick={() => handleDownload('pdf')} className="btn-print">PDF 다운로드</button>
                            </>
                        )}

                        {/* 반려된 상태 */}
                        {applicationStatus === 'REJECTED' && (
                            <>
                                <button onClick={goToList} className="btn-list">목록으로</button>
                                <button
                                            onClick={() => {
                                                setReason(leaveApplication?.rejectionReason || '');
                                                setViewRejectReasonModalOpen(true);
                                            }}
                                            className="btn-view-reason"
                                        >
                                            반려 사유 확인
                                        </button>
                                    </>
                        )}
                        {/* 반려 모달 (입력용) */}
                        <RejectModal
                            isOpen={rejectModalOpen}
                            onClose={() => setRejectModalOpen(false)}
                            onSubmit={(enteredReason) => {
                                handleManagerApproval('reject', enteredReason); // 직접 전달
                            }}
                        />

                        {/* 반려 모달 (읽기 전용 — 이미 반려된 경우) */}
                        <RejectModal
                            isOpen={viewRejectReasonModalOpen}
                            onClose={() => setViewRejectReasonModalOpen(false)}
                            initialReason={reason}
                            isReadOnly={true}
                            title="반려 사유 확인"
                        />

                        {/* 결재라인 선택 모달 */}
                        {showApprovalLineSelector && (
                            <ApprovalLineSelector
                                approvalLines={approvalLines}
                                selectedLineId={selectedApprovalLineId}
                                onSelect={(lineId) => setSelectedApprovalLineId(lineId)}
                                onConfirm={handleApprovalLineConfirm}
                                onCancel={handleApprovalLineCancel}
                            />
                        )}

                        <RejectModal
                            isOpen={showCancelModal}
                            onClose={() => {
                                setShowCancelModal(false);
                                setCancelReason('');
                            }}
                            onSubmit={(enteredReason) => {
                                handleCancelApproved(enteredReason);
                            }}
                            title="휴가원 취소"
                            placeholder="취소 사유를 입력하세요 (연차가 복구됩니다)"
                        />
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default LeaveApplication;