import React, {ChangeEvent, forwardRef, KeyboardEvent} from 'react';
import './style.css';

// Props 인터페이스 정의 - InputBox 컴포넌트에서 사용할 props를 정의합니다.
interface Props {
    title: string; // 입력박스의 제목
    placeholder: string; // 입력박스에 기본으로 표시될 텍스트
    type: 'text' | 'password'; // 입력박스의 타입 (text 또는 password)
    value: string; // 입력된 값
    message?: string; // 에러 또는 정보 메시지 (선택적)
    isErrorMessage?: boolean; // 메시지가 에러인지 아닌지 (선택적)
    buttonTitle?: string; // 버튼의 제목 (선택적)
    onChange: (event: ChangeEvent<HTMLInputElement>) => void; // 입력 값이 변경될 때 호출되는 함수
    onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void; // 키보드 키가 눌릴 때 호출되는 함수 (선택적)
    onButtonClick?: () => void; // 버튼 클릭 시 호출되는 함수 (선택적)
}

// InputBox 컴포넌트를 forwardRef로 정의하여 ref를 사용할 수 있도록 함
const InputBox = forwardRef<HTMLInputElement, Props>((props: Props, ref) => {

    // props 구조 분해 할당
    const {title, placeholder, type, value, isErrorMessage, buttonTitle, message, onChange, onKeyDown, onButtonClick} = props;

    // 버튼 클래스: 값이 비어있으면 버튼을 비활성화
    const buttonClass = value === '' ? 'input-box-button-disable' : 'input-box-button';

    // 메시지 클래스: 에러 메시지인 경우와 일반 메시지인 경우를 구분
    const messageClass =  isErrorMessage ? 'input-box-message-error' : 'input-box-message';

    return (
        <div className='input-box'>
            <div className='input-box-title'>{title}</div> {/* 제목 */}
            <div className='input-box-content'>
                <div className='input-box-body'>
                    {/* 입력박스 */}
                    <input
                        ref={ref}
                        className='input-box-input'
                        placeholder={placeholder}
                        type={type}
                        value={value}
                        onChange={onChange}
                        onKeyDown={onKeyDown}
                    />
                    {/* 버튼 (buttonTitle과 onButtonClick이 있을 경우만 렌더링) */}
                    {buttonTitle !== undefined && onButtonClick !== undefined &&
                        <div className={buttonClass} onClick={onButtonClick}>{buttonTitle}</div>
                    }
                </div>
                {/* 메시지 (에러 메시지나 일반 메시지) */}
                {message !== undefined && <div className={messageClass}>{message}</div>}
            </div>
        </div>
    );
});

// forwardRef로 감싸서 ref를 전달할 수 있도록 합니다.
export default InputBox;
