## 📖 소개

선한병원 내부 직원의 근로계약서 작성 및 휴가원 신청/승인 프로세스를 디지털화하여 업무 효율을 높이는 것을 목적으로 하는 전자 결재 시스템의 프론트엔드 프로젝트입니다.

---

## 🛠️ 기술 스택

-   [cite_start]**Framework**: React.js [cite: 192]
-   [cite_start]**Language**: TypeScript [cite: 192]
-   [cite_start]**Styling**: HTML, CSS [cite: 192]
-   **Data Fetching**: Axios
-   **State Management**: Redux Toolkit (또는 Recoil, Zustand 등)

---

## ⚙️ 설치 및 실행 방법

1.  **저장소 복제**
    ```bash
    git clone {frontend_repository_url}
    cd {repository_name}
    ```

2.  **패키지 설치**
    ```bash
    npm install
    ```

3.  **환경 변수 설정**
    -   프로젝트 루트에 `.env` 파일을 생성합니다.
    -   아래 내용을 참고하여 백엔드 API 서버 주소를 입력합니다.

    ```env
    # .env
    VITE_API_BASE_URL=[http://100.100.100.224:8080](http://100.100.100.224:8080)
    ```

4.  **개발 서버 실행**
    ```bash
    npm start
    ```
---

## ✨ 주요 기능

-   [cite_start]**로그인 및 개인정보 등록** [cite: 54]
    -   [cite_start]최초 로그인 시 병원 DB(gshhis)와 연동하여 사용자 정보를 확인하고, 로컬 DB(MariaDB)로 정보를 이전합니다. [cite: 46, 51]
    -   [cite_start]전화번호, 주소, 디지털 서명 등 추가 개인정보를 입력받아 저장합니다. [cite: 53, 89]

-   [cite_start]**근로계약서 작성 및 서명** [cite: 78]
    -   [cite_start]**인사팀**: 직원 검색 후 근로계약서의 주요 항목(계약기간, 연봉 등)을 입력하여 생성합니다. [cite: 79, 101]
    -   [cite_start]**직원**: 본인의 근로계약서를 열람하고, '개인정보수집 동의' 및 '교부 확인'을 직접 타이핑한 후, 등록된 디지털 서명으로 계약을 완료합니다. [cite: 85, 86, 114, 116]

-   [cite_start]**휴가원 신청 및 결재** [cite: 122]
    -   [cite_start]휴가원 양식을 작성하고 대직자를 지정하여 결재를 요청합니다. [cite: 152]
    -   [cite_start]직급(일반직원, 팀장, 원장)에 따라 차등화된 다단계 결재 라인을 따릅니다. [cite: 151, 156, 161]
    -   [cite_start]결재 진행 상태를 실시간으로 확인하고, 반려 시 사유를 조회할 수 있습니다. [cite: 154, 160]

-   **문서 조회 및 관리**
    -   [cite_start]최종 완료된 근로계약서와 휴가원을 조회하고, PDF 또는 이미지 파일로 저장 및 인쇄할 수 있습니다. [cite: 121, 165]

---

## ⚙️ 환경 변수 (.env)

-   `VITE_API_BASE_URL`: 접속할 백엔드 API 서버의 URL

---

## 📜 스크립트 목록

-   `npm start`: 개발 서버를 실행합니다.
-   `npm run build`: 프로덕션용으로 프로젝트를 빌드합니다.

---

## 📄 라이선스 / 문의

-   **License**: MIT
-   [cite_start]**Contact**: dudgus2109@gmail.com [cite: 177]
---
