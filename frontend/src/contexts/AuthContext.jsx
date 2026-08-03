import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, getTenantId, getTenantName, setAuth, clearAuth, getMe } from '../api/auth.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      getMe().then(u => {
        if (u) {
          if (u.assistant_id) localStorage.setItem('loggix_assistant_id', u.assistant_id);
          setUser(u);
        } else clearAuth();
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const loginUser = useCallback((token, tenantId, name, email, assistantId) => {
    setAuth(token, tenantId, name, assistantId);
    setUser({ tenant_id: tenantId, name, email, assistant_id: assistantId || '' });
  }, []);

  const logoutUser = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginUser, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
