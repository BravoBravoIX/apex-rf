import { NavLink } from 'react-router-dom';
import { useInjects } from '../contexts/InjectContext';

export const Sidebar = () => {
  const { injects, connectionStatus } = useInjects();
  const urlParams = new URLSearchParams(window.location.search);
  const queryString = urlParams.toString() ? `?${urlParams.toString()}` : '';

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-success';
      case 'connecting': return 'bg-warning';
      case 'reconnecting': return 'bg-warning';
      case 'disconnected': return 'bg-error';
      default: return 'bg-text-muted';
    }
  };

  const navigation = [
    { name: 'RF Control', href: `/${queryString}` },
    { name: 'All Injects', href: `/injects${queryString}`, count: injects.length },
  ];

  return (
    <div className="w-64 bg-sidebar-bg h-screen p-4 flex flex-col border-r border-sidebar-surface">
      <div className="mb-8">
        <div className="text-2xl font-bold text-sidebar-text">APEX</div>
        <div className="text-xs text-sidebar-text-muted mt-1 mb-3">Advanced Platform for Exercise & eXperimentation</div>
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
          <span className="text-sidebar-text-muted">
            {connectionStatus === 'connected' ? 'Connected' :
             connectionStatus === 'connecting' ? 'Connecting...' :
             connectionStatus === 'reconnecting' ? 'Reconnecting...' :
             'Disconnected'}
          </span>
        </div>
      </div>

      <nav className="flex flex-col space-y-2">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.name === 'RF Control'}
            className={({ isActive }) =>
              `px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-between ` +
              (isActive
                ? 'bg-sidebar-accent text-sidebar-bg'
                : 'text-sidebar-text-muted hover:bg-sidebar-surface hover:text-sidebar-text')
            }
          >
            {({ isActive }) => (
              <>
                <span>{item.name}</span>
                {'count' in item && item.count !== undefined && item.count > 0 && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    isActive ? 'bg-sidebar-bg text-sidebar-accent' : 'bg-sidebar-surface text-sidebar-text-muted'
                  }`}>
                    {item.count}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
