import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  requiresAuth: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(true);

  useEffect(() => {
    // Disable authentication for demo - allow access without login
    setRequiresAuth(false);
    setIsAuthenticated(true);
  }, []);

  const login = (username: string, password: string): boolean => {
    if (username === 'cyberops' && password === 'demo') {
      setIsAuthenticated(true);
      sessionStorage.setItem('cyberops_authenticated', 'true');
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('cyberops_authenticated');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, requiresAuth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
