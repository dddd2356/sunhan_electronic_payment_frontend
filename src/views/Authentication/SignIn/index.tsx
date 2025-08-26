import React, { ChangeEvent, KeyboardEvent, useRef, useState } from 'react';
import './style.css';
import InputBox from "../../../components/InputBox";
import { SignInRequestDto } from "../../../apis/request/auth";
import { ResponseBody } from "../../../types";
import { SignInResponseDto } from "../../../apis/response/auth";
import { ResponseCode } from "../../../types/enums";
import { useCookies } from "react-cookie";
import {useNavigate} from "react-router-dom";
import {signInRequest} from "../../../apis";

export default function SignIn() {
    const idRef = useRef<HTMLInputElement | null>(null);
    const passwdRef = useRef<HTMLInputElement | null>(null);

    const [cookie, setCookie] = useCookies();

    const [id, setId] = useState<string>('');
    const [passwd, setPasswd] = useState<string>('');
    const [message, setMessage] = useState<string>('');

    const navigate = useNavigate();

    // 로그인 응답 처리 함수
    const signInResponse = (responseBody: ResponseBody<SignInResponseDto>) => {
        console.log('서버 응답:', responseBody); // 응답 로깅 추가

        if (!responseBody) return;

        const { code } = responseBody;
        if (code === ResponseCode.VALIDATION_FAIL) alert('아이디와 비밀번호를 입력하세요.');
        if (code === ResponseCode.SIGN_IN_FAIL) setMessage('로그인 정보가 일치하지 않습니다.');
        if (code === ResponseCode.DATABASE_ERROR) alert('데이터베이스 오류입니다.');
        if (code !== ResponseCode.SUCCESS) return;

        const { token, expiresIn } = responseBody as SignInResponseDto;
        const now = new Date().getTime();
        const expires = new Date(now + expiresIn * 1000);

        setCookie('accessToken', token, {
            expires,
            path: '/',
            secure: window.location.protocol === 'https:',
            sameSite: window.location.protocol === 'https:' ? 'none' : 'lax'
        });

        navigate('/detail/main-page');
    };

    // 아이디 변경 처리 함수
    const onIdChangeHandler = (event: ChangeEvent<HTMLInputElement>) => {
        const { value } = event.target;
        setId(value);
        setMessage('');
    };

    // 비밀번호 변경 처리 함수
    const onPasswordChangeHandler = (event: ChangeEvent<HTMLInputElement>) => {
        const { value } = event.target;
        setPasswd(value);
        setMessage('');
    };

    // 로그인 버튼 클릭 시 로그인 처리 - 강화된 디버깅
    const onSignInButtonClickHandler = async () => {
        console.log('=== 로그인 시도 시작 ===');
        console.log('입력된 ID:', id);
        console.log('입력된 Password:', passwd);
        console.log('ID 길이:', id.length);
        console.log('Password 길이:', passwd.length);
        console.log('ID 타입:', typeof id);
        console.log('Password 타입:', typeof passwd);

        // 기본 유효성 검사
        if (!id || !passwd) {
            console.log('❌ 유효성 검사 실패: 빈 값');
            alert('아이디와 비밀번호 모두 입력하세요.');
            return;
        }

        // 공백 제거 후 검사
        const trimmedId = id.trim();
        const trimmedPasswd = passwd.trim();

        console.log('공백 제거 후 ID:', trimmedId);
        console.log('공백 제거 후 Password:', trimmedPasswd);

        if (!trimmedId || !trimmedPasswd) {
            console.log('❌ 유효성 검사 실패: 공백만 있음');
            alert('아이디와 비밀번호를 올바르게 입력하세요.');
            return;
        }

        const requestBody: SignInRequestDto = {
            id: trimmedId,
            passwd: trimmedPasswd
        };

        console.log('📤 요청 데이터:', requestBody);
        console.log('📤 요청 데이터 JSON:', JSON.stringify(requestBody));

        try {
            console.log('🔄 API 호출 시작...');
            const response = await signInRequest(requestBody);
            console.log('✅ API 호출 성공:', response);
            signInResponse(response);
        } catch (error: any) {
            console.error('❌ API 호출 실패:', error);

            if (error.response) {
                console.error('🔍 에러 상세 정보:');
                console.error('- 상태 코드:', error.response.status);
                console.error('- 응답 헤더:', error.response.headers);
                console.error('- 응답 데이터:', error.response.data);

                // 서버에서 반환한 구체적인 에러 메시지 표시
                if (error.response.data && error.response.data.message) {
                    setMessage(`서버 오류: ${error.response.data.message}`);
                } else {
                    setMessage('서버 연결에 문제가 있습니다.');
                }
            } else if (error.request) {
                console.error('🔍 요청은 전송되었지만 응답을 받지 못함:', error.request);
                setMessage('서버에 연결할 수 없습니다.');
            } else {
                console.error('🔍 요청 설정 중 오류:', error.message);
                setMessage('요청 처리 중 오류가 발생했습니다.');
            }
        }

        console.log('=== 로그인 시도 종료 ===');
    };

    // 엔터키로 비밀번호 입력으로 포커스 이동
    const onIdKeyDownHandler = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        if (!passwdRef.current) return;
        passwdRef.current.focus();
    };

    // 엔터키 입력시 로그인
    const onPasswordKeyDownHandler = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            onSignInButtonClickHandler();
        }
    };

    return (
        <div id='sign-in-wrapper'>
            <div className='sign-in-container'>
                <div className='sign-in-box'>
                    <div className='sign-in-title'>{'선한병원 전자결재 시스템'}</div>
                    <div className='sign-in-content-box'>
                        <div className='sign-in-content-input-box'>
                            <InputBox
                                ref={idRef}
                                title='아이디'
                                placeholder='아이디를 입력해주세요'
                                type='text'
                                value={id}
                                onChange={onIdChangeHandler}
                                onKeyDown={onIdKeyDownHandler}
                            />
                            <InputBox
                                ref={passwdRef}
                                title='비밀번호'
                                placeholder='비밀번호를 입력해주세요'
                                type='password'
                                value={passwd}
                                onChange={onPasswordChangeHandler}
                                isErrorMessage
                                message={message}
                                onKeyDown={onPasswordKeyDownHandler}
                            />
                        </div>
                        <div className='sign-in-content-button-box'>
                            <div className='primary-button-lg full-width' onClick={onSignInButtonClickHandler}>{'로그인'}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div className='sign-in-image'></div>
        </div>
    );
}