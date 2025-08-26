import { useState } from "react";
import Header from "./Header";
import Sidebar from "../SideBar";
import "./style.css"

interface LayoutProps {
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    return (
        <div className="layout">
            <Header toggleSidebar={toggleSidebar} />
            <div className="content-container">
                <Sidebar isOpen={isSidebarOpen} />
                {/* 사이드바 닫힘(full-width) 클래스 토글 */}
                <div className={`main-content ${isSidebarOpen ? '' : 'full-width'}`}>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Layout;