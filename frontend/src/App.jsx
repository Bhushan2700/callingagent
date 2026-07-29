import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import VoicePage from './pages/VoicePage.jsx';
import TicketsPage from './pages/TicketsPage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import WidgetConfigPage from './pages/WidgetConfigPage.jsx';
import './App.css';

export default function App() {
  return (
    <>
      <Navbar />
      <div className="page-container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
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
