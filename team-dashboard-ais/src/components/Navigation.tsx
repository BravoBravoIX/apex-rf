import { NavLink } from 'react-router-dom';
import { useInjects } from '../contexts/InjectContext';
import { useMemo } from 'react';

export const Navigation = () => {
  const { injects, connectionStatus, lastUpdate } = useInjects();
  const urlParams = new URLSearchParams(window.location.search);
  const queryString = urlParams.toString() ? `?${urlParams.toString()}` : '';

  const counts = useMemo(() => {
    const typeCounts = {
      news: 0,
      social: 0,
      email: 0,
      sms: 0,
    };

    injects.forEach(inject => {
      const type = inject.type?.toLowerCase();
      if (type && type in typeCounts) {
        typeCounts[type as keyof typeof typeCounts]++;
      }
    });

    return typeCounts;
  }, [injects]);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-success';
      case 'connecting': return 'bg-warning';
      case 'reconnecting': return 'bg-warning';
      case 'disconnected': return 'bg-error';
      default: return 'bg-text-muted';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'reconnecting': return 'Reconnecting...';
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  };

  const navItems = [
    { to: `/${queryString}`, label: 'All', count: injects.length, end: true },
    { to: `/news${queryString}`, label: 'News', count: counts.news },
    { to: `/social${queryString}`, label: 'Social', count: counts.social },
    { to: `/email${queryString}`, label: 'Email', count: counts.email },
    { to: `/sms${queryString}`, label: 'SMS', count: counts.sms },
  ];

  return (
    <nav className="bg-surface border-b border-border">
      <div className="container mx-auto">
        {connectionStatus !== 'connected' && (
          <div className={`px-4 py-2 ${connectionStatus === 'disconnected' ? 'bg-error/10' : 'bg-warning/10'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
              <span className="text-sm text-text-secondary">{getStatusText()}</span>
              {lastUpdate && (
                <span className="text-xs text-text-muted">
                  Last update: {new Date(lastUpdate).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-1 px-4">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'text-primary border-primary'
                    : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border'
                }`
              }
            >
              {item.label} {item.count > 0 && <span className="text-text-muted">({item.count})</span>}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
};
