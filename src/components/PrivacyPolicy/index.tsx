// src/components/PrivacyPolicy.tsx
import React from 'react';
import './style.css';

const PrivacyPolicy: React.FC = () => {
    return (
        <div className="policy-container">
            <div className="policy-header">
                <h1>개인정보 수집·이용 동의서</h1>
                <p>귀하의 개인정보를 안전하게 보호하고 적법하게 처리하기 위해 다음과 같이 안내해 드립니다.</p>
            </div>

            <div className="policy-section">
                <h2>1. 개인정보의 수집·이용 목적</h2>
                <p>회사는 수집한 개인정보를 다음의 목적을 위해 활용합니다.</p>
                <ul>
                    <li><strong>서비스 제공:</strong> 회원관리, 서비스 이용에 따른 본인확인</li>
                    <li><strong>본인인증:</strong> SMS 인증을 통한 본인확인 및 부정 이용 방지</li>
                    <li><strong>고객지원:</strong> 고객 상담 및 불만처리, 공지사항 전달</li>
                    <li><strong>서비스 개선:</strong> 서비스 이용 분석 및 개선</li>
                </ul>
            </div>

            <div className="policy-section">
                <h2>2. 수집하는 개인정보의 항목</h2>
                <table className="policy-table">
                    <thead>
                    <tr>
                        <th>구분</th>
                        <th>수집항목</th>
                        <th>수집방법</th>
                    </tr>
                    </thead>
                    <tbody>
                    <tr>
                        <td>필수정보</td>
                        <td>전화번호, 주소, 상세주소, 서명</td>
                        <td>로그인 시 직접입력</td>
                    </tr>
                    <tr>
                        <td>자동수집</td>
                        <td>IP주소, 접속시간, 브라우저 정보</td>
                        <td>서비스 이용 시 자동수집</td>
                    </tr>
                    </tbody>
                </table>
            </div>

            <div className="policy-section">
                <h2>3. 개인정보의 보유 및 이용기간</h2>
                <div className="policy-highlight">
                    <strong>보유기간:</strong> 회원탈퇴 시까지<br />
                    <strong>파기:</strong> 회원탈퇴 즉시 개인정보를 파기합니다.
                </div>
                <p><strong>단, 다음의 경우 해당 법률에서 정한 기간 동안 보존합니다:</strong></p>
                <ul>
                    <li>전자상거래법: 5년 (계약·청약철회·대금결제·재화공급 기록)</li>
                    <li>통신비밀보호법: 3개월 (통신사실확인자료)</li>
                </ul>
            </div>

            <div className="policy-section">
                <h2>4. 개인정보의 제3자 제공</h2>
                <p>회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.</p>
                <p><strong>단, 다음의 경우에는 예외로 합니다:</strong></p>
                <ul>
                    <li>이용자가 사전에 동의한 경우</li>
                    <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
                </ul>
            </div>

            <div className="policy-section">
                <h2>5. 개인정보 처리위탁</h2>
                <table className="policy-table">
                    <thead>
                    <tr>
                        <th>수탁업체</th>
                        <th>위탁업무</th>
                        <th>위탁기간</th>
                    </tr>
                    </thead>
                    <tbody>
                    <tr>
                        <td>SMS 발송업체 (예: 알리고)</td>
                        <td>SMS 발송 서비스</td>
                        <td>서비스 이용기간</td>
                    </tr>
                    <tr>
                        <td>카카오톡 알림톡 업체</td>
                        <td>알림톡 발송 서비스</td>
                        <td>서비스 이용기간</td>
                    </tr>
                    </tbody>
                </table>
            </div>

            <div className="policy-section">
                <h2>6. 정보주체의 권리·의무 및 그 행사방법</h2>
                <p>귀하는 개인정보주체로서 다음과 같은 권리를 행사할 수 있습니다:</p>
                <ul>
                    <li><strong>개인정보 열람요구</strong></li>
                    <li><strong>오류 등이 있을 경우 정정·삭제요구</strong></li>
                    <li><strong>처리정지요구</strong></li>
                </ul>
                <div className="policy-highlight">
                    <strong>권리 행사 방법:</strong> 개인정보보호 담당자에게 서면, 전화, 이메일로 연락하시면 지체없이 조치하겠습니다.
                </div>
            </div>

            <div className="policy-section">
                <h2>7. 동의 거부권 및 불이익</h2>
                <div className="policy-highlight">
                    <strong>동의 거부권:</strong> 귀하는 개인정보 수집·이용에 대한 동의를 거부할 권리가 있습니다.<br />
                    <strong>동의 거부 시 불이익:</strong> 다만, 동의를 거부할 경우 서비스 이용이 제한될 수 있습니다.
                </div>
            </div>

            <div className="policy-contact-info">
                <h2>8. 개인정보보호 담당자</h2>
                <p><strong>성명:</strong> 홍길동 (개인정보보호 담당자)</p>
                <p><strong>연락처:</strong> 062-466-1000</p>
                <p><strong>이메일:</strong> privacy@company.com</p>
                <p><strong>주소:</strong> 광주광역시 광산구 ○○동 123-45</p>
            </div>

            <div className="policy-footer">
                <p><strong>시행일자:</strong> 2026년 1월 1일</p>
                <p>본 동의서는 2026년 1월 1일부터 시행됩니다.</p>
            </div>
        </div>
    );
};

export default PrivacyPolicy;