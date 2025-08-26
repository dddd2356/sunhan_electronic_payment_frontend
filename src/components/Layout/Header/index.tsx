// components/Layout/Header/Header.tsx

import './style.css';
import hospitalImage from './assets/images/newExecution.png';

interface HeaderProps {
    toggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
    return (
        <header className='header'>
            <div className='contents'>
                <div className='employment-sign-up-image'>
                    <img src={hospitalImage} alt="병원 이미지" className="hospital-image"/>
                    <span className='image-text'>선한병원 전자결재시스템</span>
                </div>
            </div>
        </header>
    )
}

export default Header