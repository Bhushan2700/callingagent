import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LandingPage from './pages/LandingPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import WidgetDemoPage from './pages/WidgetDemoPage.jsx';
import SetupGuide from './pages/SetupGuide.jsx';
import VoicePage from './pages/VoicePage.jsx';
import TicketsPage from './pages/TicketsPage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import WidgetConfigPage from './pages/WidgetConfigPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import './App.css';

function AppContent() {
  const location = useLocation();
  const noNav = ['/', '/login', '/register', '/forgot-password', '/reset-password'];
  const showNav = !noNav.includes(location.pathname);

  return (
    <>
      {showNav && <Navbar />}
      <div className="page-container">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/widget" element={<WidgetDemoPage />} />
          <Route path="/setup" element={<SetupGuide />} />
          <Route path="/voice" element={<ProtectedRoute><VoicePage /></ProtectedRoute>} />
          <Route path="/tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} />
          <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
          <Route path="/admin/widget" element={<ProtectedRoute><WidgetConfigPage /></ProtectedRoute>} />
          <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
