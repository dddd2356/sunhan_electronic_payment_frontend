import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useNavigate, useParams} from 'react-router-dom';
import axios from 'axios';
import axiosInstance from '../../../views/Authentication/axiosInstance';
import './style.css';
import Layout from "../../../components/Layout";
import {fetchUserSignatureFromDB, updateLeaveApplicationSignature} from '../../../apis/signatures'
import {
    approveLeaveApplication,
    fetchLeaveApplicationSignatures,
    finalApproveLeaveApplication,
    rejectLeaveApplication,
    saveLeaveApplication
} from '../../../apis/leaveApplications'; // <-- import 경로 확인 및 추가 (e.g. `../../../apis/leaveApplications`)
import {SignatureData, SignatureState} from "../../../types/signature";
import dayjs from 'dayjs'; // 날짜 계산을 위해 dayjs 라이브러리 추가
import isBetween from 'dayjs/plugin/isBetween'; // 플러그인 추가
import RejectModal from '../../../components/RejectModal';
import LeaveAttachments from "../../../components/LeaveAttachments";
import ApprovalLineSelector from "../../../components/ApprovalLineSelector";
import OrganizationChart from "../../../components/OrganizationChart";
import {Document, Page, pdfjs} from 'react-pdf';
import {repairPngDataUrl, toSafeDataUrl} from '../../../utils/imageUtils';

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
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
        isFinalApprovalAvailable?: boolean;
    }[];
}

interface ConfirmedApprovalLineData {
    id: number;
    steps: {
        stepOrder: number;
        stepName: string;
        approverType: string;
        approverName?: string;
        approverId?: string;
        jobLevel?: string;
        deptCode?: string;
        isOptional?: boolean;
        isFinalApprovalAvailable?: boolean;
    }[];  // ApprovalLine.steps와 동일
    hasSubstitute: boolean;  // 추가
}

interface UserInfo {
    userId: string;
    department: string;
    name: string;
    position: string;
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

interface ApprovalStepInfo {
    stepOrder: number;
    stepName: string;
    approverType: string;
    approverId?: string;
    name: string;
    isSigned: boolean;
    isFinalApproved: boolean;
    signatureUrl?: string;
    signedAt?: string;
    isCurrent: boolean;
    isApplicationFinalApproved: boolean;
    finalApprovalStep?: string;
    isSkipped?: boolean;
    jobTitle?: string;
}

interface LeaveApplicationData {
    id: number;
    applicantId: string;
    applicantName: string; // 추가
    applicantDept: string; // 추가
    applicantPosition: string; // 추가
    substituteId: string;
    substituteName: string; // 추가
    currentApproverId: string | null;
    finalApprovalStep?: string; // 어느 단계에서 전결했는지
    // 전결 관련 필드 추가
    isFinalApproved?: boolean;
    finalApproverId?: string;
    finalApprovalDate?: string;

    approvalSteps?: ApprovalStepInfo[];

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
    const navigate = useNavigate();
    //const [candidates, setCandidates] = useState<{ userId: string; userName: string; jobLevel: string }[]>([]);
    const [signatures, setSignatures] = useState<Record<string, SignatureData[]>>({
        applicant: [{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
        substitute: [{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
        departmentHead: [{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
        hrStaff:        [{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
        centerDirector:[{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
        adminDirector: [{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
        ceoDirector:   [{ text: "", imageUrl: undefined, isSigned: false, signatureDate: undefined }],
    });

    const [isFormReadOnly, setIsFormReadOnly] = useState<boolean>(true);

    const [selectedApprovalLineId, setSelectedApprovalLineId] = useState<number | null>(null);
    const [approvalLines, setApprovalLines] = useState<ApprovalLine[]>([]);
    const [showApprovalLineSelector, setShowApprovalLineSelector] = useState(false);
    const [departmentNames, setDepartmentNames] = useState<Record<string, string>>({});
    // [추가] 상태 업데이트 후 제출을 트리거하기 위한 상태
    const [isSubmitPending, setIsSubmitPending] = useState<boolean>(false);
    const [approvalLine, setApprovalLine] = useState<ApprovalLine | null>(null);
    const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
    const [pdfLoading, setPdfLoading] = useState<boolean>(false);
    const [pdfError, setPdfError] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [pdfPageNumber, setPdfPageNumber] = useState<number>(1);
    const [isMobile, setIsMobile] = useState(false);

    // jobLevel을 직책명으로 변환하는 함수
    const getPositionByJobLevel = (jobLevel: string | undefined): string => {
        switch (jobLevel) {
            case '0': return '사원';
            case '1': return '부서장';
            case '2': return '센터장';
            case '3': return '원장';
            case '4': return '행정원장';
            case '5': return '대표원장';
            default: return '';
        }
    };

    // 신청자 정보 (데이터베이스에서 가져올 예정)
    const [applicantInfo, setApplicantInfo] = useState<UserInfo>({
        userId:'',
        department: '',
        name: '',
        position: '',
    });

    // 대직자 정보 (데이터베이스에서 가져올 예정)
    const [substituteInfo, setSubstituteInfo] = useState<UserInfo>({
        userId: '',
        department: '',
        name: '',
        position: '',
    });

    const [departmentHeadInfo, setDepartmentHeadInfo] = useState<UserInfo>({
        userId: '',
        department: '',
        name: '',
        position: '',
    });
    const [showSubstituteSelector, setShowSubstituteSelector] = useState(false);
    const [leaveApplication, setLeaveApplication] = useState<LeaveApplicationData | null>(null);
    const [applicationStatus, setApplicationStatus] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userSignatureImage, setUserSignatureImage] = useState<string | null>(null);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [viewRejectReasonModalOpen, setViewRejectReasonModalOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [canFinalApprove, setCanFinalApprove] = useState(false);
    const [isApprovable, setIsApprovable] = useState<boolean>(false); // <-- useState 선언 추가
    const [isRejectable, setIsRejectable] = useState<boolean>(false); // <-- useState 선언 추가
    const [isManager, setIsManager] = useState<boolean>(false); // <-- useState 선언 추가
    const [isApproving, setIsApproving] = useState<boolean>(false);
    const isSigningRef = useRef(false);
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
        "분만휴가(배우자)": false,
        유산사산휴가: false,
        병가: false,
        기타: false
    });

    // 휴가 내용
    const [leaveContent, setLeaveContent] = useState({
        경조휴가: '',
        특별휴가: '',
        병가: '',
        기타: '',
    });

    const leaveTitle = useMemo(() => {
        const selected = Object.keys(leaveTypes).filter(k => leaveTypes[k]);
        if (selected.length === 0) return '휴가';
        const result = selected.map(s =>
            s === '기타' && leaveContent.기타?.trim()
                ? leaveContent.기타.trim()
                : s
        );
        return result.join(' / ');
    }, [leaveTypes, leaveContent]);

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

    useEffect(() => {
        const fetchDepartmentNames = async () => {
            try {
                const response = await axiosInstance.get('/departments/names');
                setDepartmentNames(response.data);
            } catch (error) {
                console.error('부서 이름 조회 실패:', error);
            }
        };
        fetchDepartmentNames();
    }, []);

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
                '/api/v1/approval-lines/my?documentType=LEAVE_APPLICATION',
                {
                    credentials: 'include'
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
            applicantInfo: {
                ...applicantInfo,
                position: applicantInfo.position || getPositionByJobLevel(currentUser?.jobLevel),
            },
            substituteInfo: substituteInfo.userId ? {
                userId: substituteInfo.userId,
                name: substituteInfo.name,
                position: substituteInfo.position
            } : null,
            departmentHeadInfo: departmentHeadInfo.userId ? {
                userId: departmentHeadInfo.userId,
                name: departmentHeadInfo.name,
                position: departmentHeadInfo.position,
                department: departmentHeadInfo.department
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

        try {
            // 새로운 API 함수 사용
            await saveLeaveApplication(parseInt(id), payload);
            console.log('폼 데이터 동기화 완료');
        } catch (error) {
            console.error('폼 데이터 동기화 실패:', error);
            throw error;
        }
    }, [id, applicantInfo, substituteInfo, departmentHeadInfo, leaveTypes, leaveContent, flexiblePeriods, consecutivePeriod, totalDays, applicationDate, signatures]);

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
        if (!id || !leaveApplication) {
            alert('삭제할 휴가원 정보가 없습니다.');
            return;
        }

        // 안전 확인
        if (!window.confirm('정말 이 휴가원을 삭제하시겠습니까? (복구 불가)')) return;

        try {
            const resp = await axiosInstance.delete(`/leave-application/${id}`);

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

    const loadSignatures = useCallback(async () => {
        if (!id) return;
        try {
            const signaturesData = await fetchLeaveApplicationSignatures(parseInt(id));

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
    }, [id]);

    // 신청자 제출 (다음단계로 전송)
    const handleSubmitToSubstitute = useCallback(async () => {
        if (!leaveApplication || !id) {
            alert("휴가원 데이터가 유효하지 않습니다.");
            return;
        }

        // ✅ 1. 대직자/부서장 확인
        if (selectedApprovalLineId) {
            const selectedLine = approvalLines.find(line => line.id === selectedApprovalLineId);

            const hasSubstitute = selectedLine?.steps.some(step => step.approverType === 'SUBSTITUTE');
            const hasDepartmentHead = selectedLine?.steps.some(step => step.approverType === 'DEPARTMENT_HEAD');

            if (hasSubstitute && !substituteInfo.userId) {
                alert('대직자가 포함된 결재라인을 선택하셨습니다. 대직자를 선택해주세요.');
                return;
            }

            // ✅ 부서장 확인 추가
            if (hasDepartmentHead && !departmentHeadInfo.userId) {
                alert('부서장이 포함된 결재라인을 선택하셨습니다. 부서장을 선택해주세요.');
                return;
            }
        }

        // 1. 결재라인 선택 확인
        if (!selectedApprovalLineId) {
            if (approvalLines.length > 0) {
                setShowApprovalLineSelector(true);
                return;
            } else {
                alert('사용 가능한 결재라인이 없습니다.\n결재라인을 먼저 생성해주세요.');
                return;
            }
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
            await syncFormData();

            // ✅ 제출 payload에 substituteInfo와 departmentHeadInfo 추가
            const submitPayload: any = {
                approvalLineId: selectedApprovalLineId,
                substituteInfo: substituteInfo.userId ? {
                    userId: substituteInfo.userId,
                    name: substituteInfo.name,
                    position: substituteInfo.position
                } : null,  // ✅ null이 아닌지 확인
                departmentHeadInfo: departmentHeadInfo.userId ? departmentHeadInfo : null
            };

            console.log('Submit payload:', submitPayload);  // ✅ 로그 추가

            const response = await axiosInstance.post(
                `/leave-application/${id}/submit`,
                submitPayload
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
    }, [
        leaveApplication,
        id,
        selectedApprovalLineId,
        approvalLines,
        substituteInfo,
        departmentHeadInfo,  // ✅ 추가
        signatures.applicant,
        currentUser,
        leaveTypes,
        syncFormData,
        loadSignatures,
        navigate
    ]);


    // 결재라인 선택 확인 핸들러
    const handleApprovalLineConfirm =  async (data: ConfirmedApprovalLineData) => {
        const { id, steps } = data;

        // ✅ 대직자/부서장 포함 여부 확인
        const hasSubstitute = steps.some(step => step.approverType === 'SUBSTITUTE');
        const hasDepartmentHead = steps.some(step => step.approverType === 'DEPARTMENT_HEAD');

        // ✅ Case 1: 대직자 확인
        if (hasSubstitute && !substituteInfo.userId) {
            alert('선택한 결재라인에 대직자가 포함되어 있습니다. 대직자를 선택해주세요.');
            setShowApprovalLineSelector(true);
            return;
        }

        if (!hasSubstitute && substituteInfo.userId) {
            if (window.confirm('선택한 결재라인에 대직자가 포함되어 있지 않습니다. 기존 선택된 대직자를 제거하시겠습니까?')) {
                setSubstituteInfo({
                    userId: '',
                    department: '',
                    name: '',
                    position: ''
                });
                setLeaveApplication(prev => prev ? { ...prev, substituteId: '', substituteName: '' } : prev);
            } else {
                setShowApprovalLineSelector(true);
                return;
            }
        }

        // ✅ Case 2: 부서장 확인
        const deptHeadStep = steps.find(step => step.approverType === 'DEPARTMENT_HEAD');
        if (hasDepartmentHead) {
            if (deptHeadStep?.approverId) {
                try {
                    const res = await axiosInstance.get(`/user/${deptHeadStep.approverId}`);
                    setDepartmentHeadInfo({
                        userId: res.data.userId,
                        name: res.data.userName || '',
                        position: res.data.jobLevel || '',
                        department: res.data.deptCode || '',
                    });
                } catch {
                    alert('부서장 정보를 불러오지 못했습니다. 결재라인을 수정해주세요.');
                    setShowApprovalLineSelector(true);
                    return;
                }
            } else {
                alert('결재라인에 부서장이 지정되어 있지 않습니다. 결재라인을 수정해주세요.');
                setShowApprovalLineSelector(true);
                return;
            }
        }

        if (!hasDepartmentHead && departmentHeadInfo.userId) {
            if (window.confirm('선택한 결재라인에 부서장이 포함되어 있지 않습니다. 기존 선택된 부서장을 제거하시겠습니까?')) {
                setDepartmentHeadInfo({
                    userId: '',
                    department: '',
                    name: '',
                    position: ''
                });
            } else {
                setShowApprovalLineSelector(true);
                return;
            }
        }

        // 통과 시 상태 업데이트
        setApprovalLine({
            id,
            name: approvalLines.find(line => line.id === id)?.name || '',
            description: approvalLines.find(line => line.id === id)?.description,
            steps
        });
        setSelectedApprovalLineId(id);
        setShowApprovalLineSelector(false);
        setIsSubmitPending(true);
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

                const response = await axiosInstance.put(
                    `/leave-application/${id}/approve-with-line`, // <--- ✅ 새 API 호출
                    {
                        comment: '대직자 승인',
                        signatureImageUrl: signatureImageUrl,
                        isFinalApproval: false // 대직자는 전결이 아님
                    }
                );

                setLeaveApplication(response.data);
                setApplicationStatus(response.data.status);
                window.dispatchEvent(new Event('pendingCountsChanged'));
                alert('대직자 승인이 완료되었습니다.');

            } else {
                // ✅ 3. 이전 하드코딩 로직 (하위 호환성 유지)
                const response = await axiosInstance.put(
                    `/leave-application/${id}/approve`, // <--- ❌ 이전 API 호출
                    { signatureDate: getCurrentDate() }
                );

                setLeaveApplication(response.data);
                setApplicationStatus(response.data.status);
                window.dispatchEvent(new Event('pendingCountsChanged'));
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

    // 관리자 승인 (부서장, 인사담당, 센터장, 원장들)
    // handleManagerApproval 함수 전체 교체
    const handleManagerApproval = async (action: 'approve' | 'reject', rejectionReason?: string) => {
        if (isApproving) return;
        if (!leaveApplication || !id || !currentUser) {
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

        setIsApproving(true);
        try {
            if (action === 'approve') {
                // ✅ 결재라인 사용 여부에 따라 다른 API 호출
                if (usingApprovalLine) {
                    const approvalLineStep = leaveApplication.approvalLine?.steps?.find(
                        s => s.stepOrder === leaveApplication.currentStepOrder
                    );

                    if (approvalLineStep && approvalLineStep.isOptional !== true) {
                        const approverType = approvalLineStep.approverType;
                        let isSigned = false;

                        if (approverType === 'SUBSTITUTE') {
                            // 휴가원 양식에서 서명
                            isSigned = Boolean(signatures.substitute?.[0]?.isSigned);
                        } else if (approverType === 'DEPARTMENT_HEAD') {
                            // 휴가원 양식에서 서명
                            isSigned = Boolean(signatures.departmentHead?.[0]?.isSigned);
                        } else {
                            // SPECIFIC_USER: 결재 테이블에서 서명
                            const tableStep = leaveApplication.approvalSteps?.find(
                                s => s.stepOrder === leaveApplication.currentStepOrder
                            );
                            isSigned = Boolean(tableStep?.isSigned);
                        }

                        if (!isSigned) {
                            alert('휴가원 양식에 서명 후 승인해 주세요.');
                            return;
                        }
                    }

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
                    const response = await axiosInstance.put(
                        `/leave-application/${id}/approve-with-line`,
                        { comment: '', signatureImageUrl: signatureImageUrl, isFinalApproval: false }
                    );
                    // 경량 응답으로 변경된 필드만 부분 업데이트 (재조회 없이 즉시 반영)
                    const approvedStepOrder = leaveApplication.currentStepOrder;  // 클로저 캡처 (업데이트 전 값)
                    setLeaveApplication(prev => {
                        if (!prev) return prev;
                        const newStepOrder = response.data.currentStepOrder;
                        return {
                            ...prev,
                            status: response.data.status,
                            currentApprovalStep: response.data.currentApprovalStep,
                            currentStepOrder: newStepOrder,
                            currentApproverId: response.data.currentApproverId,
                            approvalSteps: prev.approvalSteps?.map(s => {
                                if (s.stepOrder === approvedStepOrder) {
                                    // 방금 승인된 단계: 서명됨 + 현재 단계 아님
                                    return { ...s, isSigned: true, signatureUrl: userSignatureImage ?? s.signatureUrl, isCurrent: false };
                                }
                                if (s.stepOrder === newStepOrder) {
                                    // 다음 단계: 현재 단계로 설정
                                    return { ...s, isCurrent: true };
                                }
                                return s;
                            }),
                        };
                    });
                    setApplicationStatus(response.data.status);
                    window.dispatchEvent(new Event('pendingCountsChanged'));
                    alert("승인이 완료되었습니다.");
                } else {
                    // 기존 방식
                    const response = await approveLeaveApplication(parseInt(id), getCurrentDate());
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
                    const response = await axiosInstance.put(
                        `/leave-application/${id}/reject-with-line`,
                        { rejectionReason: rejectionReason }
                    );

                    setLeaveApplication(response.data);
                    setApplicationStatus(response.data.status);
                    alert("휴가원이 반려되었습니다.");
                } else {
                    // 기존 방식
                    const response = await rejectLeaveApplication(parseInt(id), rejectionReason);
                    setLeaveApplication(response);
                    setApplicationStatus(response.status);
                    alert("휴가원이 반려되었습니다.");
                }

                setShowRejectModal(false);
            }

            navigate("/detail/leave-application");

        } catch (error: any) {
            console.error(`휴가원 ${action === 'approve' ? '승인' : '반려'} 실패:`, error);
            if (axios.isAxiosError(error)) {
                const errorMessage = error.response?.data?.error || error.message;
                alert(`오류: ${errorMessage}`);
            } else {
                alert(`오류: ${error.message}`);
            }
        } finally {
            setIsApproving(false);
        }
    };

    // handleFinalApproval 함수도 수정
    const handleFinalApproval = async () => {
        if (!leaveApplication || !id || !currentUser) {
            alert("휴가원 정보 또는 권한 정보가 부족합니다.");
            return;
        }

        const usingApprovalLine = leaveApplication.status === 'PENDING';
        const currentStep = leaveApplication.currentApprovalStep;
        let signatureKey: keyof SignatureState | null = null;

        switch (currentStep) {
            case "DEPARTMENT_HEAD_APPROVAL": signatureKey = "departmentHead"; break;
            case "HR_STAFF_APPROVAL":        signatureKey = "hrStaff"; break;
            case "HR_FINAL_APPROVAL": break;
            case "CENTER_DIRECTOR_APPROVAL": signatureKey = "centerDirector"; break;
            case "ADMIN_DIRECTOR_APPROVAL":  signatureKey = "adminDirector"; break;
            case "CEO_DIRECTOR_APPROVAL":    signatureKey = "ceoDirector"; break;
        }

        if (usingApprovalLine) {
            const approvalLineStep = leaveApplication.approvalLine?.steps?.find(
                s => s.stepOrder === leaveApplication.currentStepOrder
            );

            if (approvalLineStep && approvalLineStep.isOptional !== true) {
                const approverType = approvalLineStep.approverType;
                let isSigned = false;

                if (approverType === 'SUBSTITUTE') {
                    isSigned = Boolean(signatures.substitute?.[0]?.isSigned);
                } else if (approverType === 'DEPARTMENT_HEAD') {
                    isSigned = Boolean(signatures.departmentHead?.[0]?.isSigned);
                } else {
                    const tableStep = leaveApplication.approvalSteps?.find(
                        s => s.stepOrder === leaveApplication.currentStepOrder
                    );
                    isSigned = Boolean(tableStep?.isSigned);
                }

                if (!isSigned) {
                    alert('휴가원 양식에 서명 후 전결해 주세요.');
                    return;
                }
            }
        } else {
            if (signatureKey && !signatures[signatureKey]?.[0]?.isSigned) {
                alert("전결 승인 전 서명을 먼저 진행해주세요.");
                return;
            }
        }

        if (!window.confirm('전결 승인하시겠습니까? 이후 모든 승인 단계가 완료 처리됩니다.')) {
            return;
        }

        try {
            if (usingApprovalLine) {
                // 검토 단계(isOptional)가 아닌 경우 결재 테이블 서명 필수
                const approvalLineStep = leaveApplication.approvalLine?.steps?.find(
                    s => s.stepOrder === leaveApplication.currentStepOrder
                );
                if (approvalLineStep?.isOptional !== true) {
                    const tableStep = leaveApplication.approvalSteps?.find(
                        s => s.stepOrder === leaveApplication.currentStepOrder
                    );
                    if (!tableStep?.isSigned) {
                        alert('결재 테이블에 서명 후 승인해 주세요.');
                        return;
                    }
                }
                const signatureImageUrl = (() => {
                    if (!signatureKey) return (userSignatureImage || null);
                    const sigItem = signatures[signatureKey]?.[0];
                    if (sigItem?.imageUrl) return sigItem.imageUrl;
                    if (userSignatureImage) return userSignatureImage;
                    return null;
                })();

                await axiosInstance.put(
                    `/leave-application/${id}/approve-with-line`,
                    {
                        comment: '전결 승인',
                        signatureImageUrl: signatureImageUrl,
                        isFinalApproval: true
                    }
                );
            } else {
                await finalApproveLeaveApplication(parseInt(id));
            }
            window.dispatchEvent(new Event('pendingCountsChanged'));
            alert("전결 승인이 완료되었습니다.");

            // ✅ 바로 목록으로 이동
            navigate("/detail/leave-application");

        } catch (error: any) {
            console.error('전결 승인 실패:', error);
            if (axios.isAxiosError(error)) {
                const errorMessage = error.response?.data?.error || error.message;
                alert(`오류: ${errorMessage}`);
            } else {
                alert(`오류: ${error.message}`);
            }
        }
    };

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

        // ✅ 부서장 서명 시 선택 여부 확인
        if (signatureKey === 'departmentHead') {
            // DRAFT 상태에서 부서장이 선택되지 않았으면 선택 모달 열기
            if (applicationStatus === 'DRAFT' && !departmentHeadInfo.userId) {
                alert('결재라인에서 부서장을 선택해주세요.');
                return;
            }

            // 부서장이 선택되었는데 본인이 아니면 서명 불가
            if (departmentHeadInfo.userId && String(currentUser.id) !== String(departmentHeadInfo.userId)) {
                alert('선택된 부서장만 서명할 수 있습니다.');
                return;
            }
        }

        // 검토 단계(isOptional=true)는 서명 불가
        if (leaveApplication.approvalLine) {
            const currentStep = leaveApplication.approvalLine.steps.find(
                step => step.stepOrder === leaveApplication.currentStepOrder
            );

            if (currentStep?.isOptional === true) {
                alert('검토 단계는 서명이 필요하지 않습니다. 승인 버튼을 눌러주세요.');
                return;
            }
        }

        if (!userSignatureImage) {
            console.warn('서명 이미지가 null입니다. 서명을 완료하지 못했습니다.');
            return;
        }

        const currentSignature = signatures[signatureKey]?.[0];
        const correctedBase64 = toSafeDataUrl(userSignatureImage);

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
                    // 대직자/부서장: DB에 저장된 것이 없으므로 로컬 state만 초기화
                    if (signatureKey === 'substitute' || signatureKey === 'departmentHead') {
                        setSignatures(prev => ({
                            ...prev,
                            [signatureKey]: [{text: '', imageUrl: undefined, isSigned: false}]
                        }));
                        return;
                    }

                    // 신청자 등 나머지: unsign API 유지, GET 재조회만 제거
                    try {
                        const response = await updateLeaveApplicationSignature(
                            parseInt(id!),
                            signatureKey as string,
                            null
                        );

                        setSignatures(prev => ({
                            ...prev,
                            [signatureKey]: [{text: '', imageUrl: undefined, isSigned: false}]
                        }));

                        console.log(`${signatureKey} 서명 취소 성공`, response);

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
                navigate('/profile/signature');
            }
            return;
        }

        if (!checkCanSign(signatureKey)) {
            console.log('checkCanSign 실패:', {
                signatureKey,
                currentUserId: currentUser?.id,
                currentApproverId: leaveApplication?.currentApproverId,
                currentApprovalStep: leaveApplication?.currentApprovalStep,
                status: leaveApplication?.status,
                hasApprovalLine: !!leaveApplication?.approvalLine,
                userPermissions: currentUser?.permissions,
            });
            alert('서명할 권한이 없습니다.');
            return;
        }

        // 서명 확인
        if (window.confirm('서명하시겠습니까?')) {
            const currentDate = new Date().toISOString();

            // 대직자/부서장: API 없이 로컬 state만 업데이트 (즉시 반응)
            if (signatureKey === 'substitute' || signatureKey === 'departmentHead') {
                setSignatures(prev => ({
                    ...prev,
                    [signatureKey]: [{ text: '승인', imageUrl: correctedBase64, isSigned: true, signatureDate: currentDate }]
                }));
                return;
            }

            // 신청자 등 나머지: /sign API 유지, GET 재조회만 제거
            try {
                if (signatureKey === 'applicant' && leaveApplication.status === 'DRAFT' && substituteInfo && substituteInfo.userId) {
                    const freshAppResponse = await axiosInstance.get(`/leave-application/${id}`);
                    const freshAppData = freshAppResponse.data;
                    const updatePayload = {
                        ...freshAppData,
                        substituteId: substituteInfo.userId,
                        substituteName: substituteInfo.name,
                    };
                    await axiosInstance.put(
                        `/leave-application/${id}/substitute`,
                        updatePayload
                    );
                }

                const response = await axiosInstance.put(
                    `/leave-application/${id}/sign`,
                    {
                        signerId: currentUser.id,
                        signerType: signatureKey,
                        signatureEntry: {
                            text: '승인',
                            imageUrl: correctedBase64,
                            isSigned: true,
                            signatureDate: currentDate
                        }
                    }
                );

                setSignatures(prev => ({
                    ...prev,
                    [signatureKey]: [{ text: '승인', imageUrl: correctedBase64, isSigned: true, signatureDate: currentDate }]
                }));

                console.log(`${signatureKey} 서명 성공`, response);

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
    }, [currentUser, userSignatureImage, signatures, leaveApplication, id, applicantInfo.department, checkApprovalPermissions,
            departmentHeadInfo,
            applicationStatus]);

    // SPECIFIC_USER 타입 결재 단계용 서명 핸들러
    const handleSignatureClickForStep = useCallback(async (stepOrder: number) => {
        if (isSigningRef.current) return;
        if (!currentUser || !leaveApplication || !id || !userSignatureImage) {
            if (!userSignatureImage) {
                if (window.confirm('등록된 서명이 없습니다. 서명을 먼저 등록하시겠습니까?')) {
                    navigate('/profile/signature');
                }
            }
            return;
        }

        // 현재 결재자인지 확인
        if (String(currentUser.id) !== String(leaveApplication.currentApproverId)) {
            alert('서명할 권한이 없습니다.');
            return;
        }

        const currentStep = leaveApplication.approvalSteps?.find(s => s.stepOrder === stepOrder);

        // ✅ 이미 서명한 경우 → 취소
        if (currentStep?.isSigned) {
            if (!window.confirm('서명을 취소하시겠습니까?')) return;
            setLeaveApplication(prev => {
                if (!prev || !prev.approvalSteps) return prev;
                return {
                    ...prev,
                    approvalSteps: prev.approvalSteps.map(s =>
                        s.stepOrder === stepOrder
                            ? { ...s, isSigned: false, signatureUrl: undefined, signedAt: undefined }
                            : s
                    )
                };
            });
            return;
        }

        // 서명 이미지 확인 (기존 위치에서 이동)
        if (!userSignatureImage) {
            if (window.confirm('등록된 서명이 없습니다. 서명을 먼저 등록하시겠습니까?')) {
                navigate('/detail/my-page');
            }
            return;
        }

        if (!window.confirm('서명하시겠습니까?')) return;

        const currentDate = new Date().toISOString();

        setLeaveApplication(prev => {
            if (!prev || !prev.approvalSteps) return prev;
            return {
                ...prev,
                approvalSteps: prev.approvalSteps.map(s =>
                    s.stepOrder === stepOrder
                        ? { ...s, isSigned: true, signatureUrl: userSignatureImage, signedAt: currentDate }
                        : s
                )
            };
        });
    }, [currentUser, leaveApplication, id, userSignatureImage, navigate, checkApprovalPermissions]);

    const checkCanSign = useCallback((signatureKey: keyof SignatureState) => {
        if (!currentUser || !leaveApplication) return false;

        if (signatureKey === 'applicant') {
            return (String(currentUser.id) === String(leaveApplication.applicantId) &&
                leaveApplication.status === 'DRAFT');
        }

        if (leaveApplication.status === 'DRAFT') {
            return false;
        }

        if (leaveApplication.approvalLine) {
            const isCurrentApprover = String(currentUser.id) === String(leaveApplication.currentApproverId);
            if (!isCurrentApprover) return false;

            // 현재 단계의 approverType으로 expectedKey 계산
            const currentStepDef = leaveApplication.approvalLine.steps.find(
                s => s.stepOrder === leaveApplication.currentStepOrder
            );
            if (!currentStepDef) return true;

            const expectedKey = getSignatureKeyFromStepName(
                currentStepDef.stepName,
                currentStepDef.approverType
            );
            if (!expectedKey) return true; // 커스텀 단계는 currentApproverId 일치만으로 허용
            return signatureKey === expectedKey;
        }

        const currentStep = leaveApplication.currentApprovalStep;
        switch (signatureKey) {
            case 'substitute':
                return (String(currentUser.id) === String(leaveApplication.substituteId) &&
                    currentStep === 'SUBSTITUTE_APPROVAL');
            case 'departmentHead':
                return (String(currentUser.id) === String(departmentHeadInfo?.userId) &&
                    currentStep === 'DEPARTMENT_HEAD_APPROVAL');
            case 'hrStaff':
                return !!(
                    currentUser.permissions?.includes("HR_LEAVE_APPLICATION") &&
                    ["0", "1"].includes(currentUser.jobLevel) &&
                    (currentUser.role === "ADMIN" || currentUser.role === "HR") &&
                    currentStep === 'HR_STAFF_APPROVAL'
                );
            case 'centerDirector':
                return (currentUser.jobLevel === "2" &&
                    currentStep === 'CENTER_DIRECTOR_APPROVAL');
            case 'adminDirector':
                return (currentUser.jobLevel === "4" &&
                    currentStep === 'ADMIN_DIRECTOR_APPROVAL');
            case 'ceoDirector':
                return (currentUser.jobLevel === "5" &&
                    currentStep === 'CEO_DIRECTOR_APPROVAL');
            default:
                return false;
        }
    }, [departmentHeadInfo, currentUser, leaveApplication, applicantInfo.department]);

// 인사권한 확인
useEffect(() => {
    if (currentUser) {
        const hasPermission = currentUser.permissions?.includes('HR_LEAVE_APPLICATION') ?? false;
        setHasHrPermission(hasPermission);
    }
}, [currentUser]);

// 완료된 휴가원 취소 핸들러
const handleCancelApproved = async (cancellationReason: string) => {
    if (!leaveApplication || !id) {
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
        const response = await axiosInstance.put(
            `/leave-application/${id}/cancel-approved`,
            { cancellationReason: cancellationReason }
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

    const memoizedAttachments = useMemo(() => {
        return attachments.length ? attachments : (leaveApplication?.attachments || []);
    }, [attachments, leaveApplication?.attachments]);

// PDF 다운로드 함수
const handleDownload = useCallback(
    async (type: 'pdf') => {
        if (!id) return;
        try {
            const resp = await fetch(
                `/api/v1/leave-application/${id}/${type}`,
                {
                    method: 'GET',
                    credentials: 'include',
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
    [id]
);

    const approvalTableSteps = useMemo(() => {
        return leaveApplication?.approvalSteps?.filter(s => s.stepOrder > 0) ?? [];
    }, [leaveApplication?.approvalSteps]);

    const getApproverLabel = (stepName: string, name: string): string => {
        const map: Record<string, string> = {
            'HR_STAFF_APPROVAL':        '인사담당',
            'CENTER_DIRECTOR_APPROVAL': '센터장',
            'ADMIN_DIRECTOR_APPROVAL':  '행정원장',
            'CEO_DIRECTOR_APPROVAL':    '대표원장',
            '인사담당 승인':             '인사담당',
            '진료센터장 승인':           '센터장',
            '센터장 승인':              '센터장',
            '행정원장 승인':             '행정원장',
            '대표원장 승인':             '대표원장',
        };
        return map[stepName] ?? name;
    };

    const getSignatureKeyFromStepName = (
        stepName: string,
        approverType?: string,
    ): keyof SignatureState | null => {
        // SPECIFIC_USER는 stepName/approverType으로 키를 결정할 수 없음
        if (approverType === 'SPECIFIC_USER') return null;

        if (approverType) {
            const typeMap: Record<string, keyof SignatureState> = {
                'SUBSTITUTE':       'substitute',
                'DEPARTMENT_HEAD':  'departmentHead',
                'HR_STAFF':         'hrStaff',
                'CENTER_DIRECTOR':  'centerDirector',
                'ADMIN_DIRECTOR':   'adminDirector',
                'CEO_DIRECTOR':     'ceoDirector',
            };
            if (typeMap[approverType]) return typeMap[approverType];
        }
        const nameMap: Record<string, keyof SignatureState> = {
            'SUBSTITUTE_APPROVAL':      'substitute',
            'DEPARTMENT_HEAD_APPROVAL': 'departmentHead',
            'HR_STAFF_APPROVAL':        'hrStaff',
            'CENTER_DIRECTOR_APPROVAL': 'centerDirector',
            'ADMIN_DIRECTOR_APPROVAL':  'adminDirector',
            'CEO_DIRECTOR_APPROVAL':    'ceoDirector',
        };
        return nameMap[stepName] ?? null;
    };

    const isFinalApprovedHigher = (step: ApprovalStepInfo): boolean => {
        return step.isSkipped === true; // ✅ 백엔드에서 계산한 isSkipped 사용
    };

    const handleSignatureClickByApproverType = useCallback(async (approverType: string) => {
        const typeToKeyMap: Record<string, keyof SignatureState> = {
            'SUBSTITUTE':       'substitute',
            'DEPARTMENT_HEAD':  'departmentHead',
            'HR_STAFF':         'hrStaff',
            'CENTER_DIRECTOR':  'centerDirector',
            'ADMIN_DIRECTOR':   'adminDirector',
            'CEO_DIRECTOR':     'ceoDirector',
        };
        const key = typeToKeyMap[approverType];
        if (key) {
            await handleSignatureClick(key);
        } else {
            // approverType도 매핑 안 되면 현재 결재자면 hrStaff로 처리 (fallback)
            console.warn('알 수 없는 approverType:', approverType);
            await handleSignatureClick('hrStaff');
        }
    }, [handleSignatureClick]);

    useEffect(() => {
        const fetchApplicationData = async () => {
            if (!id) {
                navigate('/detail/leave-application');
                return;
            }

            try {
                // 1. 현재 사용자 정보 및 서명 이미지 가져오기
                const userRes = await axiosInstance.get('/user/me');
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

                // 2. 서명 이미지 가져오기 (404 무시)
                try {
                    const userSigImg = await fetchUserSignatureFromDB();
                    setUserSignatureImage(userSigImg ? repairPngDataUrl(userSigImg) : null);
                    if (userSigImg) {
                        const b64 = userSigImg.replace('data:image/png;base64,', '');
                        const bin = atob(b64.substring(0, 16));
                        const bytes = Array.from(bin).map((c: string) => c.charCodeAt(0).toString(16).padStart(2,'0'));
                    }

                } catch (sigError) {
                    console.warn('서명 이미지 없음 (정상):', sigError);
                    setUserSignatureImage(null);
                }

                // 3. 휴가원 상세 데이터 가져오기
                const appResponse = await axiosInstance.get(`/leave-application/${id}`);
                const appData = appResponse.data;
                setLeaveApplication(appData);

                // appData.attachments 매핑
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

                setApplicationStatus(appData.status);

                // ✅ 5. formData 선언 (여기로 이동!)
                let formData: any = {};
                if (appData.formDataJson) {
                    try {
                        formData = JSON.parse(appData.formDataJson);
                        console.log('[fetchApplicationData] Parsed formDataJson:', formData);
                    } catch (e) {
                        console.error('Failed to parse formDataJson:', e);
                    }
                }

                // ✅ 6. 대직자 정보 설정 (formData 선언 후)
                setSubstituteInfo(prev => ({
                    ...prev,
                    userId: appData.substituteId,
                    name: appData.substituteName,
                    position: appData.substitutePosition
                }));

                // ✅ 7. 부서장 정보 설정 (formData 선언 후)
                if (formData.departmentHeadInfo) {
                    setDepartmentHeadInfo({
                        userId: formData.departmentHeadInfo.userId || '',
                        department: formData.departmentHeadInfo.department || '',
                        name: formData.departmentHeadInfo.name || '',
                        position: formData.departmentHeadInfo.position || ''
                    });
                }

                // 8. 신청자 정보 설정
                const applicantInfoFromData = formData.applicantInfo || {
                    userId: appData.applicantId,
                    department: appData.applicantDept,
                    name: appData.applicantName,
                    position: ''
                };
                setApplicantInfo(applicantInfoFromData);

            // leaveTypes 배열을 Record<string, boolean>으로 변환
            const initialLeaveTypes: Record<string, boolean> = {
                연차휴가: false, 경조휴가: false, 특별휴가: false, 생리휴가: false,
                "분만휴가(배우자)": false, 유산사산휴가: false, 병가: false, 기타: false
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

            // **leaveContent가 문자열일 경우, 객체로 변환하여 상태에 설정**
            const newLeaveContent = {
                경조휴가: '',
                특별휴가: '',
                병가: '',
                기타: '',
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
                const sigResponse = await axiosInstance.get(`/leave-application/${id}/signatures`);
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
}, [id, navigate]);

    useEffect(() => {
        // PENDING 상태에서만 전결 권한 체크
        if (!currentUser || !leaveApplication || leaveApplication.status !== 'PENDING') {
            setCanFinalApprove(false);
            return;
        }

        if (!currentUser.id) {
            setCanFinalApprove(false);
            return;
        }

        if (leaveApplication.approvalLine) {
            const isCurrentApprover = (currentUser.id === leaveApplication.currentApproverId);

            if (!isCurrentApprover) {
                setCanFinalApprove(false);
                return;
            }

            fetch(`/api/v1/leave-application/${leaveApplication.id}/can-final-approve`, {
                credentials: 'include'
            })
                .then(res => res.json())
                .then(data => {
                    setCanFinalApprove(data.canFinalApprove);
                })
                .catch(err => {
                    console.error('전결 권한 확인 실패:', err);
                    setCanFinalApprove(false);
                });
        }
    }, [currentUser?.id, leaveApplication?.id, leaveApplication?.status, leaveApplication?.currentApproverId, leaveApplication?.approvalLine]);

    useEffect(() => {
        if (leaveApplication && currentUser) {
            // 휴가원 상태가 'DRAFT'이고 현재 사용자가 신청자일 때만 수정 가능하도록 설정
            const isEditable = leaveApplication.status === 'DRAFT' && leaveApplication.applicantId === currentUser.id;
            setIsFormReadOnly(!isEditable);
        }
    }, [leaveApplication, currentUser]);

    useEffect(() => {
        if (isSubmitPending) {
            // 상태 변경(모달 닫기, 대직자 초기화 등)이 반영된 후 실행됨
            handleSubmitToSubstitute();
            // 실행 후 플래그 초기화
            setIsSubmitPending(false);
        }
        // 의존성 배열에 substituteInfo를 포함하지 않아도, 리렌더링 시 handleSubmitToSubstitute가 새로 생성되므로
        // 최신 상태를 참조하게 됩니다. 다만 안전하게 handleSubmitToSubstitute를 의존성에 넣습니다.
    }, [isSubmitPending, handleSubmitToSubstitute]);

    // 모바일 감지
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

// APPROVED 상태일 때 PDF 로드
    useEffect(() => {
        if (applicationStatus === 'APPROVED' && leaveApplication?.printable && id) {
            setPdfLoading(true);
            setPdfError(null);

            fetch(`/api/v1/leave-application/${id}/pdf`, {
                credentials: 'include'
            })
                .then(res => {
                    if (!res.ok) throw new Error(`PDF 로드 실패 (상태: ${res.status})`);
                    return res.blob();
                })
                .then(blob => {
                    if (blob.size === 0) throw new Error('PDF 파일이 비어있습니다.');
                    const pdfBlob = blob.type === 'application/pdf'
                        ? blob
                        : new Blob([blob], { type: 'application/pdf' });
                    setPdfBlobUrl(URL.createObjectURL(pdfBlob));
                    setPdfLoading(false);
                })
                .catch(err => {
                    setPdfError(err.message || 'PDF를 불러올 수 없습니다.');
                    setPdfLoading(false);
                });

            return () => {
                setPdfBlobUrl(prev => {
                    if (prev) URL.revokeObjectURL(prev);
                    return null;
                });
            };
        }
    }, [applicationStatus, leaveApplication?.printable, id]);

    if (!leaveApplication || applicationStatus === null) {
        return <Layout>
            <div className="loading">로딩 중...</div>
        </Layout>;
    }

    if (applicationStatus === 'APPROVED' && leaveApplication.printable && !pdfBlobUrl && !pdfError) {
        return <Layout>
            <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                height: '60vh', gap: '16px'
            }}>
                <div style={{
                    width: '50px', height: '50px',
                    border: '5px solid #e5e7eb',
                    borderTop: '5px solid #2563eb',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                }} />
                <div style={{ color: '#555', fontSize: '15px', fontWeight: 500 }}>문서를 불러오는 중...</div>
                <div style={{ color: '#aaa', fontSize: '12px' }}>잠시만 기다려주세요</div>
            </div>
        </Layout>;
    }

return (
    <Layout>
        <div className="leave-application-container">
            <div className="leave-application-wrapper">
                {/* ✅ APPROVED 상태면 PDF 뷰어만 표시 */}
                {applicationStatus === 'APPROVED' ? (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        {pdfLoading && <div>PDF 로딩 중...</div>}
                        {pdfError && <div style={{ color: 'red' }}>{pdfError}</div>}
                        {pdfBlobUrl && (
                            <>
                                <Document
                                    file={pdfBlobUrl}
                                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                                    onLoadError={(err) => setPdfError(err.message)}
                                >
                                    <Page
                                        pageNumber={pdfPageNumber}
                                        scale={isMobile ? 0.8 : 1.2}
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                    />
                                </Document>
                            </>
                        )}
                        {/* 첨부파일 (완료된 휴가원에서도 표시) */}
                        <div style={{ marginTop: '20px', textAlign: 'left', maxWidth: '600px', margin: '20px auto 0' }}>
                            <LeaveAttachments
                                leaveApplicationId={leaveApplication.id}
                                initialAttachments={memoizedAttachments}
                                disabled={true}
                                readOnly={true}
                            />
                        </div>
                        {/* 버튼 */}
                        <div style={{ marginTop: '20px' }}>
                            <button onClick={goToList} className="btn-list">목록으로</button>
                            {hasHrPermission && (
                                <button onClick={() => setShowCancelModal(true)} className="btn-cancel-approved"
                                        style={{ backgroundColor: '#dc3545', color: 'white', marginLeft: '10px' }}>
                                    취소(반려)
                                </button>
                            )}
                            <button onClick={() => handleDownload('pdf')} className="btn-print">PDF 다운로드</button>
                        </div>
                    </div>
                ) : (
                <>
                    <div className="common-list">
                        선한공통서식지 - 05
                    </div>
                    {/* 제목과 결재 테이블 */}
                    <div className="header-section">
                        <h1 className="leave-application-title">
                            (&nbsp;&nbsp;&nbsp; {leaveTitle} &nbsp;&nbsp;&nbsp;) 원
                        </h1>
                        <div className="flex-container">
                            <div className="table-container">
                                {approvalTableSteps.length === 0 ? (
                                    <table className="approval-table">
                                        <tbody>
                                        <tr>
                                            <th className="approval-header-cell" rowSpan={4}>결<br/>재</th>
                                            <td colSpan={4} style={{
                                                textAlign: 'center', padding: '10px',
                                                fontSize: '11px', color: '#999', verticalAlign: 'middle'
                                            }}>
                                                제출 시 결재라인이 확정됩니다.
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colSpan={4}/>
                                        </tr>
                                        <tr>
                                            <td colSpan={4}/>
                                        </tr>
                                        <tr>
                                            <td colSpan={4}/>
                                        </tr>
                                        </tbody>
                                    </table>
                                ) : (
                                    <table className="approval-table">
                                        <tbody>
                                        <tr>
                                            <th className="approval-header-cell" rowSpan={4}>결<br/>재</th>
                                            {approvalTableSteps.map((step, i) => (
                                                <th key={i} className="position-header-cell" rowSpan={2}>
                                                    {step.jobTitle || getApproverLabel(step.stepName, step.name)}
                                                </th>
                                            ))}
                                        </tr>
                                        <tr/>
                                        <tr>
                                            {approvalTableSteps.map((step, i) => {
                                                const sigKey = getSignatureKeyFromStepName(step.stepName, step.approverType);
                                                const isHigher = isFinalApprovedHigher(step);
                                                const isCurrentUserStep = step.isCurrent &&
                                                    String(currentUser?.id) === String(leaveApplication?.currentApproverId);
                                                const isClickable = isCurrentUserStep && !step.isSigned && !isHigher && !step.isFinalApproved;
                                                const isCancellable = isCurrentUserStep && step.isSigned && !isHigher && !step.isFinalApproved;
                                                return (
                                                    <td key={i} className="signature-cell"
                                                        onClick={() => {
                                                            if (!isClickable && !isCancellable) return;

                                                            if (sigKey) {
                                                                handleSignatureClick(sigKey);
                                                            } else {
                                                                // SPECIFIC_USER: stepOrder 기반 임시 키로 처리
                                                                handleSignatureClickForStep(step.stepOrder);
                                                            }
                                                        }}
                                                        style={{cursor: (isClickable || isCancellable) ? 'pointer' : 'default'}}>
                                                        <div className="signature-area">
                                                            {isHigher ? (
                                                                <div className="final-approval-mark">
                                                                    <span>전결</span>
                                                                </div>
                                                            ) : step.isFinalApproved ? (
                                                                step.signatureUrl ? (
                                                                    <img
                                                                        src={toSafeDataUrl(step.signatureUrl)}
                                                                        alt="" style={{width: 70, height: 'auto'}}
                                                                    />
                                                                ) : (
                                                                    <span className="final-approval-mark">전결</span>
                                                                )
                                                            ) : step.isSigned ? (
                                                                step.signatureUrl ? (
                                                                    <img
                                                                        src={toSafeDataUrl(step.signatureUrl)}
                                                                        alt="" style={{width: 70, height: 'auto'}}
                                                                    />
                                                                ) : (
                                                                    <span className="signature-text">승인</span>
                                                                )
                                                            ) : (
                                                                <span
                                                                    className="signature-placeholder">클릭하여 서명 후 승인</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                        <tr>
                                            {approvalTableSteps.map((step, i) => {
                                                const isHigher = isFinalApprovedHigher(step);
                                                const showDate = step.isSigned || step.isFinalApproved || isHigher;
                                                const dateStr = step.signedAt
                                                    ? dayjs(step.signedAt).format('YYYY. MM. DD.')
                                                    : leaveApplication?.finalApprovalDate
                                                        ? dayjs(leaveApplication.finalApprovalDate).format('YYYY. MM. DD.')
                                                        : '/';
                                                return (
                                                    <td key={i} className="slash-cell">
                                                        {showDate ? dateStr : '/'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                        </tbody>
                                    </table>
                                )}
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
                                    value={departmentNames[applicantInfo.department] || applicantInfo.department}
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
                            <td className="signature-box" rowSpan={3} style={{padding: '4px'}}>
                                <div
                                    className="signature-area-main"
                                    onClick={() => {
                                        if (applicationStatus === 'DRAFT') {
                                            if (!departmentHeadInfo.userId) {
                                                alert('결재라인에서 부서장을 선택해주세요.');
                                                return;
                                            }

                                            if (currentUser?.id === departmentHeadInfo.userId) {
                                                handleSignatureClick('departmentHead');
                                                return;
                                            }
                                            alert('선택된 부서장만 서명할 수 있습니다.');
                                            return;
                                        }
                                        if (checkCanSign('departmentHead')) {
                                            handleSignatureClick('departmentHead');
                                        } else {
                                            alert('서명할 권한이 없습니다.');
                                        }
                                    }}
                                    style={{cursor: 'pointer'}}
                                >
                                    {(() => {
                                        // 1. 서명 완료
                                        if (signatures.departmentHead?.[0]?.isSigned || leaveApplication?.isDeptHeadApproved) {
                                            if (signatures.departmentHead?.[0]?.imageUrl) {
                                                return (
                                                    <img
                                                        src={toSafeDataUrl(signatures.departmentHead[0].imageUrl)}
                                                        alt="부서장 서명"
                                                        style={{width: 100, height: 'auto', objectFit: 'contain'}}
                                                    />
                                                );
                                            }
                                            return <div className="sig-name-display"
                                                        style={{color: '#10b981'}}>확인</div>;
                                        }

                                        // 2. 부서장 선택됨 (서명 전)
                                        if (departmentHeadInfo.userId && departmentHeadInfo.name) {
                                            return (
                                                <>
                                                    <div className="sig-name-display">{departmentHeadInfo.name}</div>
                                                    <div className="sig-placeholder-text">(서명대기)</div>
                                                </>
                                            );
                                        }

                                        // 3. 미선택 (DRAFT)
                                        if (applicationStatus === 'DRAFT') {
                                            return <div className="sig-placeholder-text"
                                                        style={{
                                                            color: '#3b82f6',
                                                            fontWeight: 600
                                                        }}>결재라인에서<br/>확정됩니다.
                                            </div>;
                                        }

                                        return <div className="sig-placeholder-text">-</div>;
                                    })()}
                                </div>

                                {/* 해제 버튼 (DRAFT 전용) */}
                                {applicationStatus === 'DRAFT' && departmentHeadInfo.userId && (
                                    <div style={{textAlign: 'center', marginTop: '4px'}}>
                                        <button
                                            type="button"
                                            className="btn-mini-action btn-mini-red"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm('부서장 선택을 해제하시겠습니까?')) {
                                                    setDepartmentHeadInfo({
                                                        userId: '',
                                                        department: '',
                                                        name: '',
                                                        position: ''
                                                    });
                                                }
                                            }}
                                        >
                                            해제
                                        </button>
                                    </div>
                                )}
                            </td>
                        </tr>
                        <tr>
                            <th className="sub-header">직책</th>
                            <td className="input-cell" colSpan={3}>
                                <input
                                    type="text"
                                    value={applicantInfo?.position}
                                    onChange={(e) => setApplicantInfo(prev => ({
                                        ...prev,
                                        position: e.target.value
                                    }))}
                                    readOnly={isFormReadOnly}
                                    className="form-input"
                                    placeholder={getPositionByJobLevel(currentUser?.jobLevel) || '직책'}
                                />
                            </td>
                        </tr>
                        <tr>
                            <th className="sub-header">사번</th>
                            <td className="input-cell" colSpan={3}>
                                <input
                                    type="text"
                                    value={applicantInfo.userId}
                                    readOnly={true}
                                    className="form-input"
                                />
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
                                            <label key={type} className="checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => handleLeaveTypeChange(type)}
                                                    disabled={isFormReadOnly}
                                                />
                                                {type}
                                                {type === '기타' && (
                                                    <input
                                                        type="text"
                                                        value={leaveContent.기타}
                                                        onChange={(e) => {
                                                            e.stopPropagation();
                                                            setLeaveContent(prev => ({
                                                                ...prev,
                                                                기타: e.target.value
                                                            }));
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="etc-input"
                                                        placeholder="내용"
                                                        disabled={isFormReadOnly}
                                                    />
                                                )}
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

                        {/* 대직자 선택 모달 */}
                        <tr>
                            <th className="main-header" colSpan={2}>대직자</th>
                            <td className="substitute-cell" colSpan={4}>
                                <div className="substitute-info">
                                    {/* 직책 */}
                                    <span>직책:</span>
                                    <input
                                        type="text"
                                        value={substituteInfo.position || ''}
                                        readOnly
                                        className="form-input-inline"
                                        placeholder="직책"
                                    />

                                    {/* 성명 */}
                                    <span>성명:</span>
                                    {applicationStatus === 'DRAFT' ? (
                                        <div style={{display: 'inline-flex', alignItems: 'center', gap: '8px'}}>
                                            <input
                                                type="text"
                                                value={substituteInfo.name || ''}
                                                readOnly
                                                className="form-input-inline"
                                                placeholder="조직도에서 선택"
                                                style={{width: '150px'}}
                                            />
                                            <button
                                                type="button"
                                                className="btn-mini-action btn-mini-blue"
                                                onClick={() => setShowSubstituteSelector(true)}
                                            >
                                                선택
                                            </button>
                                            {substituteInfo.userId && (
                                                <button
                                                    type="button"
                                                    className="btn-mini-action btn-mini-red"
                                                    onClick={() => {
                                                        setSubstituteInfo({
                                                            userId: '',
                                                            department: '',
                                                            name: '',
                                                            position: ''
                                                        });
                                                        setLeaveApplication(prev => prev ? {
                                                            ...prev,
                                                            substituteId: '',
                                                            substituteName: ''
                                                        } : prev);
                                                    }}
                                                >
                                                    삭제
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <input
                                            type="text"
                                            value={substituteInfo.name || '— 미지정 —'}
                                            readOnly
                                            className="form-input-inline disabled"
                                        />
                                    )}

                                    {/* 서명 */}
                                    <div
                                        className="signature-inline"
                                        onClick={() => handleSignatureClick('substitute')}
                                    >
                                        {(signatures.substitute?.[0]?.isSigned || leaveApplication?.isSubstituteApproved) ? (
                                            signatures.substitute[0]?.imageUrl ? (
                                                <img
                                                    src={toSafeDataUrl(signatures.substitute[0].imageUrl)}
                                                    alt="대직자 서명"
                                                    className="signature-image-inline"
                                                    style={{width: 60, height: 'auto', objectFit: 'contain'}}
                                                />
                                            ) : (
                                                '(사인이 이미 서명되었습니다.)'
                                            )
                                        ) : (
                                            '(인)'
                                        )}
                                    </div>
                                </div>
                            </td>
                        </tr>
                        </tbody>
                    </table>
                        {showSubstituteSelector && (
                            <div className="approval-line-modal-overlay"
                                 onClick={() => setShowSubstituteSelector(false)}>
                                <div className="approval-line-modal-content" onClick={(e) => e.stopPropagation()}>
                                    <div className="approval-line-modal-header">
                                        <h3>대직자 선택</h3>
                                        <button
                                            className="approval-line-modal-close"
                                            onClick={() => setShowSubstituteSelector(false)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <div className="approval-line-modal-body">
                                        <OrganizationChart
                                            onUserSelect={(userId: string, userName: string, jobLevel: string) => {
                                                setSubstituteInfo({
                                                    userId: userId,
                                                    department: applicantInfo.department,
                                                    name: userName,
                                                    position: getPositionByJobLevel(jobLevel)
                                                });
                                                setLeaveApplication(prev => prev ? {
                                                    ...prev,
                                                    substituteId: userId,
                                                    substituteName: userName
                                                } : prev);
                                                setShowSubstituteSelector(false);
                                            }}
                                            selectedUserId={substituteInfo.userId || undefined}
                                            allDepartments={true}
                                            filterDeptCode={applicantInfo.department}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

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
                                    placeholder="2026"
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
                                            src={toSafeDataUrl(signatures.applicant[0].imageUrl!)}
                                            alt="신청인 서명"
                                            className="actual-signature-image"
                                            onError={(e) => {
                                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                const parent = (e.currentTarget as HTMLImageElement).parentElement;
                                                if (parent && !parent.querySelector('.sig-error-text')) {
                                                    const t = document.createElement('span');
                                                    t.className = 'sig-error-text';
                                                    t.textContent = '(서명됨)';
                                                    parent.appendChild(t);
                                                }
                                            }}
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
                            <img src="/logo.jpg" alt="Logo" style={{width: '180px', height: 'auto'}}/>
                        </div>
                        <div className="common-footer" style={{marginBottom: '30px'}}>
                            SUNHAN HOSPITIAL
                        </div>

                        <LeaveAttachments
                            leaveApplicationId={leaveApplication.id}
                            initialAttachments={memoizedAttachments}
                            disabled={isFormReadOnly}
                            readOnly={applicationStatus !== 'DRAFT'}
                            onChange={(newAttachments) => {
                                setAttachments(newAttachments);
                                setLeaveApplication(prev => prev ? {...prev, attachments: newAttachments} : prev);
                            }}
                        />

                        {/* 신청자가 초안 상태일 때 */}
                        {applicationStatus === 'DRAFT' && (
                            <>
                                <button onClick={goToList} className="btn-list">목록으로</button>
                                <button onClick={handleSave} className="btn-save">임시저장</button>
                                <button onClick={handleSubmitToSubstitute} className="btn-send">
                                    전송하기
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

                        {/* 목록으로 버튼 → 작성자도 보이게 */}
                        {applicationStatus === 'PENDING' &&
                            currentUser?.id === leaveApplication?.applicantId && (
                                <button onClick={goToList} className="btn-list">
                                    목록으로
                                </button>
                            )}

                        {/* 관리자가 승인할 때 - 결재라인 기반 */}
                        {(
                            applicationStatus === 'PENDING' &&
                            (
                                leaveApplication?.currentApproverId === currentUser?.id ||
                                hasHrPermission
                            )
                        ) && (
                            <>
                                <button onClick={goToList} className="btn-list">목록으로</button>

                                {/* 반려: currentApprover, HR 권한자 모두 가능 */}
                                <button onClick={() => setRejectModalOpen(true)} className="btn-reject">반려하기</button>

                                {/* 승인/전결: currentApprover만 가능 */}
                                {leaveApplication?.currentApproverId === currentUser?.id && (
                                    <>

                                        <button
                                            onClick={() => handleManagerApproval('approve')}
                                            className="btn-approve"
                                            disabled={isApproving}
                                        >
                                            승인하기
                                        </button>
                                        {canFinalApprove && (
                                            <button
                                                onClick={() => handleFinalApproval()}
                                                className="btn-final-approve">
                                                전결
                                            </button>
                                        )}
                                    </>
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
                    </div>
                </>
                )}
            </div>
        </div>

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
    </Layout>
);
};

export default LeaveApplication;