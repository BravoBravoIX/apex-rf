import { useInjects } from '../contexts/InjectContext';

export const Header = () => {
  const { timer, turnInfo } = useInjects();
  const urlParams = new URLSearchParams(window.location.search);
  const teamId = urlParams.get('team') || 'rf-control';

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
          </div>
          <img src="/cyberops-logo.png" alt="CyberOps" className="h-10" />
          <div className="text-sm text-gray-700 font-medium">
            Team: <span className="text-blue-600 capitalize">{teamId}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {turnInfo.turn_based && turnInfo.current_turn && turnInfo.current_turn > 0 && (
            <div className="text-lg font-semibold text-gray-700">
              Turn {turnInfo.current_turn}{turnInfo.total_turns ? ` of ${turnInfo.total_turns}` : ''}
            </div>
          )}
          <div className="text-3xl font-mono font-bold text-blue-600">{timer}</div>
        </div>
      </div>
    </header>
  );
};
