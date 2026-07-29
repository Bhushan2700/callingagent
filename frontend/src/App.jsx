import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import LandingPage from './pages/LandingPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import WidgetDemoPage from './pages/WidgetDemoPage.jsx';
import SetupGuide from './pages/SetupGuide.jsx';
import VoicePage from './pages/VoicePage.jsx';
import TicketsPage from './pages/TicketsPage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import WidgetConfigPage from './pages/WidgetConfigPage.jsx';
import './App.css';

export default function App() {
  const location = useLocation();
  const isLanding = location.pathname === '/';

  return (
    <>
      {!isLanding && <Navbar />}
      <div className="page-container">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/widget" element={<WidgetDemoPage />} />
          <Route path="/setup" element={<SetupGuide />} />
          <Route path="/voice" element={<VoicePage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/admin/widget" element={<WidgetConfigPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}
