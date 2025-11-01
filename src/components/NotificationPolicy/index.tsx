import React from 'react';
import './style.css';

const NotificationPolicy: React.FC = () => {
    return (
        <div className="policy-container">
            <div className="policy-header">
                <h1>서비스 알림 수신동의서</h1>
                <p>근로계약서 및 휴가원 처리 현황을 신속하게 안내받기 위한 서비스 알림 수신 동의입니다.</p>
            </div>

            <div className="policy-section">
                <h2>1. 서비스 알림 동의 개요</h2>
                <p>
                    본 동의는 **근로계약서 및 휴가원**과 같이 서비스 이용에 필수적인 정보성 알림을 받기 위한 것입니다.
                    본 알림은 광고성 정보가 포함되어 있지 않으며, 오직 문서 처리 현황을 안내하는 목적으로만 사용됩니다.
                </p>
                <div className="policy-warning">
                    <strong>⚠️ 중요사항:</strong> 본 동의를 거부하셔도 서비스 이용에는 제한이 없으나, 중요한 문서 진행 상황을 놓칠 수 있습니다.
                </div>
            </div>

            <div className="policy-section">
                <h2>2. 수신하는 알림의 종류</h2>
                <table className="policy-table">
                    <thead>
                    <tr>
                        <th>구분</th>
                        <th>내용</th>
                    </tr>
                    </thead>
                    <tbody>
                    <tr>
                        <td>근로계약서</td>
                        <td>
                            <ul>
                                <li>나에게 온 근로계약서 도착 알림</li>
                                <li>내가 보낸 근로계약서 서명 완료 알림</li>
                                <li>근로계약서 반려 알림</li>
                            </ul>
                        </td>
                    </tr>
                    <tr>
                        <td>휴가원</td>
                        <td>
                            <ul>
                                <li>나에게 온 휴가원 승인 요청 알림</li>
                                <li>내가 신청한 휴가원 승인/반려 알림</li>
                            </ul>
                        </td>
                    </tr>
                    </tbody>
                </table>
            </div>

            <div className="policy-section">
                <h2>3. 동의 거부 시 불이익</h2>
                <div className="policy-highlight">
                    <p><strong>✅ 동의 거부권:</strong> 알림 수신동의를 거부할 권리가 있습니다.</p>
                    <p><strong>❌ 동의 거부 시 불이익:</strong> 알림 수신을 거부하시면, 근로계약서 및 휴가원 처리 현황에 대한 알림을 받을 수 없어, 직접 시스템에 접속하여 상태를 확인해야 합니다.</p>
                </div>
            </div>

            <div className="policy-contact-info">
                <h2>4. 문의처</h2>
                <p><strong>문의 담당자:</strong> 관리자</p>
                <p><strong>연락처:</strong> 062-466-1000</p>
            </div>
        </div>
    );
};

export default NotificationPolicy;