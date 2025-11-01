import { useLocation } from 'react-router-dom';
import { Sun, Moon, LogOut, Sparkles } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

const getTitle = (pathname: string) => {
  const name = pathname.split('/').pop() || 'dashboard';
  if (name === '') return 'Dashboard';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const Header = () => {
  const location = useLocation();
  const title = getTitle(location.pathname);
  const { theme, toggleTheme } = useTheme();
  const { requiresAuth, logout } = useAuth();

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return <Moon size={20} className="text-text-secondary" />;
      case 'dark':
        return <Sparkles size={20} className="text-text-secondary" />;
      case 'gradient':
        return <Sun size={20} className="text-text-secondary" />;
      default:
        return <Moon size={20} className="text-text-secondary" />;
    }
  };

  const getNextTheme = () => {
    switch (theme) {
      case 'light': return 'dark';
      case 'dark': return 'gradient';
      case 'gradient': return 'light';
      default: return 'light';
    }
  };

  // Gradient theme uses APEX branding style like team-dashboard
  if (theme === 'gradient') {
    return (
      <header className="bg-white shadow-lg w-full">
        <div className="px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="flex items-end gap-2">
              <div className="flex flex-col text-xs text-gray-600 leading-tight">
                <span>Advanced Platform for Exercise &</span>
                <span>eXperimentation</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">APEX</h1>
              <img src="/api/scenarios/dropbear.png" alt="Dropbear" className="h-8 opacity-70" />
            </div>
            <img src="/cyberops-logo.png" alt="CyberOps" className="h-10" />
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-gray-100 hover:bg-blue-50 transition-colors"
              title={`Switch to ${getNextTheme()} theme`}
            >
              {getThemeIcon()}
            </button>
            <div className="text-sm text-gray-700">User: Admin</div>
            {requiresAuth && (
              <button
                onClick={logout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm transition-colors"
                title="Logout"
              >
                <LogOut size={16} />
                Logout
              </button>
            )}
          </div>
        </div>
      </header>
    );
  }

  // Light and Dark theme header
  return (
    <header className="bg-surface w-full p-4 border-b border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img
            src="/cyberops-logo.png"
            alt="CyberOps"
            className="h-10 w-auto object-contain"
            style={{ filter: theme === 'dark' ? 'brightness(0.9)' : 'none' }}
          />
          <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-surface-light hover:bg-primary/10 transition-colors"
            title={`Switch to ${getNextTheme()} theme`}
          >
            {getThemeIcon()}
          </button>
          <div className="text-sm text-text-secondary">User: Admin</div>
          {requiresAuth && (
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
              Logout
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;