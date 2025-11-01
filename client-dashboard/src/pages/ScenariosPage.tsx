
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface Scenario {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  team_count: number;
  thumbnail?: string;
  turn_based?: boolean;
  total_turns?: number;
  inject_count?: number;
}

const ScenariosPage = () => {
  // Disabled scenarios - template/testing scenarios not for production use
  const DISABLED_SCENARIOS = ['maritime-crisis-scenario', 'turn-test', 'satcom-disruption-scenario'];

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningScenario, setRunningScenario] = useState<string | null>(null);

  useEffect(() => {
    fetchScenarios();
    fetchCurrentExercise();
    const interval = setInterval(fetchCurrentExercise, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchScenarios = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/scenarios`);
      const data = await response.json();
      if (response.ok) {
        // Sort scenarios: indopac-2025 first, then others
        const sorted = [...data.scenarios].sort((a, b) => {
          if (a.id === 'indopac-2025') return -1;
          if (b.id === 'indopac-2025') return 1;
          return 0;
        });
        setScenarios(sorted);
      } else {
        console.error('Failed to load scenarios');
      }
    } catch (error) {
      console.error('Failed to connect to orchestration service', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentExercise = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/exercises/current`);
      const data = await response.json();
      if (data.active && data.scenario_name) {
        setRunningScenario(data.scenario_name);
      } else {
        setRunningScenario(null);
      }
    } catch (error) {
      console.error('Error fetching current exercise:', error);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Scenarios</h1>
      {loading ? (
        <div className="text-text-secondary">Loading scenarios...</div>
      ) : scenarios.length === 0 ? (
        <div className="text-text-secondary">No scenarios found. Add JSON files to the scenarios folder.</div>
      ) : (
        <div className="space-y-4">
          {scenarios.map((scenario) => {
            const isDisabled = DISABLED_SCENARIOS.includes(scenario.id);

            return (
              <div key={scenario.id} className={`card p-6 flex justify-between items-center gap-4 ${
                runningScenario === scenario.id ? 'border border-green-500/50 bg-green-900/10' : ''
              } ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                {scenario.thumbnail && (
                  <div className="flex-shrink-0">
                    <img
                      src={scenario.thumbnail}
                      alt={`${scenario.name} thumbnail`}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-text-primary">{scenario.name}</h2>
                    {runningScenario === scenario.id && (
                      <span className="inline-flex items-center gap-2 px-2 py-1 text-xs font-semibold text-green-400 bg-green-900/30 rounded-full">
                        <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        RUNNING
                      </span>
                    )}
                    {isDisabled && (
                      <span className="inline-flex items-center px-2 py-1 text-xs font-semibold text-text-muted bg-surface rounded-full">
                        Template
                      </span>
                    )}
                  </div>
                  <p className="text-text-secondary mb-2">{scenario.description}</p>
                  <div className="flex gap-4 text-sm text-text-secondary">
                    <span>Duration: {scenario.duration_minutes} min</span>
                    <span>•</span>
                    <span>Teams: {scenario.team_count}</span>
                    {scenario.turn_based && scenario.total_turns && (
                      <>
                        <span>•</span>
                        <span>{scenario.total_turns} Turns</span>
                      </>
                    )}
                    {scenario.inject_count !== undefined && (
                      <>
                        <span>•</span>
                        <span>{scenario.inject_count} Injects</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!isDisabled ? (
                    <Link
                      to={`/scenarios/${scenario.id}`}
                      className="flex items-center gap-2 bg-primary hover:bg-primary/80 text-white font-bold py-2 px-6 rounded transition-colors"
                    >
                      <Settings size={18} />
                      Manage Scenario
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 bg-surface text-text-muted font-bold py-2 px-6 rounded cursor-not-allowed">
                      <Settings size={18} />
                      Manage Scenario
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ScenariosPage;
