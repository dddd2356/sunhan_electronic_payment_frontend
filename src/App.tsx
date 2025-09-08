import React from 'react';
import './App.css';
import EmploymentContract from "./views/Detail/EmploymentContract";
import {Route, Routes} from "react-router-dom";
import SignIn from "./views/Authentication/SignIn";
import MainPage from "./views/Detail/MainPage";
import EmploymentContractBoard from "./components/EmploymentContractBoard";
import AdminDashboard from "./components/AdminDashBoard";
import LeaveApplicationBoard from "./components/LeaveApplicationBoard";
import LeaveApplication from "./views/Detail/LeaveApplication";
import MyPage from "./views/Detail/MyPage";
import AdminVacationManagement from "./components/AdminVacationManagement";
import SyncManagementDashboard from "./components/SyncManagementDashboard";

function App() {
  return (
      <Routes>
        <Route path="/auth">
          <Route path="sign-in" element={<SignIn/>} />
        </Route>
        <Route path="/detail">
            <Route path="main-page" element={<MainPage/>} />
            <Route path="my-page" element={<MyPage/>}/>
            <Route path="employment-contract" element={<EmploymentContractBoard/>} />
            <Route path="employment-contract/view/:id" element={<EmploymentContract/>} />
            <Route path="employment-contract/edit/:id" element={<EmploymentContract/>} />

            {/* Leave Application */}
            <Route path="leave-application" element={<LeaveApplicationBoard />} />          {/* board */}
            <Route path="leave-application/view/:id" element={<LeaveApplication />} />      {/* view */}
            <Route path="leave-application/edit/:id" element={<LeaveApplication />} />      {/* edit */}
        </Route>
          {/* ===== 관리자 페이지 라우트 추가 ===== */}
          <Route path="/admin">
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="vacation" element={<AdminVacationManagement/>}/>
              <Route path="sync-management-dashboard" element={<SyncManagementDashboard/>}/>
          </Route>
    </Routes>
  );
}

export default App;