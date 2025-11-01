import { useInjects } from '../contexts/InjectContext';
import { ThemeToggle } from './ThemeToggle';

export const Header = () => {
  const { timer, exerciseState } = useInjects();
  const urlParams = new URLSearchParams(window.location.search);
  const teamId = urlParams.get('team') || 'default-team';

  const getStateColor = () => {
    switch (exerciseState) {
      case 'RUNNING': return 'text-success';
      case 'PAUSED': return 'text-warning';
      case 'STOPPED': return 'text-error';
      default: return 'text-text-muted';
    }
  };

  return (
    <header className="bg-surface w-full p-4 border-b border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img
            src="/cyberops-logo.png"
            alt="CyberOps"
            className="h-10 w-auto object-contain"
          />
          <h1 className="text-xl font-semibold text-text-primary">
            Team: <span className="text-primary capitalize">{teamId}</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-primary">{timer}</div>
            <div className={`text-sm font-semibold ${getStateColor()}`}>
              {exerciseState}
            </div>
          </div>
          <ThemeToggle />
          <img
            src="/dewc-logo.jpeg"
            alt="DEWC"
            className="h-8 w-auto object-contain"
          />
        </div>
      </div>
    </header>
  );
};
