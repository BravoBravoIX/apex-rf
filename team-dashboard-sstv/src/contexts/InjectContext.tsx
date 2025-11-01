import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { useMqtt } from '../hooks/useMqtt';

export interface Inject {
  id: string;
  time: number;
  type?: string;
  content?: string | {
    headline?: string;
    body?: string;
    source?: string;
    from?: string;
    to?: string;
    subject?: string;
  };
  message?: string;
  data?: any;
  delivered_at?: number;
  team_id?: string;
  exercise_id?: string;
  media?: string[];
  action?: {
    type: string;
    data?: any;
  };
}

interface InjectContextType {
  injects: Inject[];
  timer: string;
  exerciseState: 'RUNNING' | 'PAUSED' | 'STOPPED';
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  lastUpdate: Date | null;
  publishInject: (inject: any) => void;
}

const InjectContext = createContext<InjectContextType | undefined>(undefined);

export const InjectProvider = ({ children }: { children: ReactNode }) => {
  const urlParams = new URLSearchParams(window.location.search);
  const teamId = urlParams.get('team') || 'default-team';
  const exerciseName = urlParams.get('exercise') || 'test';
  const topic = `/exercise/${exerciseName}/team/${teamId}/feed`;

  const hostname = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
  const brokerUrl = `ws://${hostname}:9001`;

  const timerTopic = `/exercise/${exerciseName}/timer`;
  const controlTopic = `/exercise/${exerciseName}/control`;

  const mqttTopics = useMemo(() => [topic, timerTopic, controlTopic], [topic, timerTopic, controlTopic]);
  const { client, messages, connectionStatus } = useMqtt(brokerUrl, mqttTopics);

  const [timer, setTimer] = useState<string>('T+00:00');
  const [injects, setInjects] = useState<Inject[]>([]);
  const [exerciseState, setExerciseState] = useState<'RUNNING' | 'PAUSED' | 'STOPPED'>('RUNNING');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const publishInject = (inject: any) => {
    if (client && client.connected) {
      const injectsTopic = `apex/team/${teamId}/injects`;
      client.publish(injectsTopic, JSON.stringify(inject), (err) => {
        if (err) {
          console.error('Failed to publish inject:', err);
        } else {
          console.log('Published inject:', inject);
        }
      });
    } else {
      console.error('Cannot publish: MQTT client not connected');
    }
  };

  useEffect(() => {
    messages.forEach(msg => {
      try {
        const parsed = JSON.parse(msg);

        if (parsed.formatted && parsed.elapsed !== undefined) {
          setTimer(parsed.formatted);
          setLastUpdate(new Date());
        } else if (parsed.command) {
          switch (parsed.command) {
            case 'pause':
              setExerciseState('PAUSED');
              break;
            case 'resume':
              setExerciseState('RUNNING');
              break;
            case 'stop':
              setExerciseState('STOPPED');
              break;
          }
        } else if (parsed.id) {
          setInjects(prev => {
            const exists = prev.some(inject => inject.id === parsed.id);
            if (exists) return prev;
            return [parsed, ...prev];
          });
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });
  }, [messages]);

  return (
    <InjectContext.Provider
      value={{
        injects,
        timer,
        exerciseState,
        connectionStatus,
        lastUpdate,
        publishInject,
      }}
    >
      {children}
    </InjectContext.Provider>
  );
};

export const useInjects = () => {
  const context = useContext(InjectContext);
  if (!context) {
    throw new Error('useInjects must be used within InjectProvider');
  }
  return context;
};
