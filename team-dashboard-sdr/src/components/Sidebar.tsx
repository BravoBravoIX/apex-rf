import { NavLink } from 'react-router-dom';
import { useInjects } from '../contexts/InjectContext';

export const Sidebar = () => {
  const { injects, connectionStatus } = useInjects();
  const urlParams = new URLSearchParams(window.location.search);
  const queryString = urlParams.toString() ? `?${urlParams.toString()}` : '';

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'reconnecting': return 'bg-yellow-500';
      case 'disconnected': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const navigation = [
    { name: 'RF Control', href: `/${queryString}` },
    { name: 'All Injects', href: `/injects${queryString}`, count: injects.length },
  ];

  return (
    <div className="w-64 h-full p-4 flex flex-col">
      <div className="bg-gray-200 rounded-lg p-4 shadow-md mb-4">
        <div className="mb-4">
          <div className="text-xl font-bold text-gray-900">Navigation</div>
          <div className="flex items-center gap-2 text-xs mt-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
            <span className="text-gray-600">
              {connectionStatus === 'connected' ? 'Connected' :
               connectionStatus === 'connecting' ? 'Connecting...' :
               connectionStatus === 'reconnecting' ? 'Reconnecting...' :
               'Disconnected'}
            </span>
          </div>
        </div>

        <nav className="flex flex-col divide-y divide-gray-300">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.name === 'RF Control'}
              className={({ isActive }) =>
                `px-4 py-3 text-sm font-medium transition-colors flex items-center justify-between ` +
                (isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-300')
              }
            >
              {({ isActive }) => (
                <>
                  <span>{item.name}</span>
                  {'count' in item && item.count !== undefined && item.count > 0 && (
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      isActive ? 'bg-white text-blue-600' : 'bg-gray-200 text-gray-700'
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
    </div>
  );
};
