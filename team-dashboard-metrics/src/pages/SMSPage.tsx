import { useInjects } from '../contexts/InjectContext';
import { InjectCard } from '../components/InjectCard';
import { useMemo } from 'react';

export const SMSPage = () => {
  const { injects } = useInjects();

  const smsInjects = useMemo(() => {
    return injects.filter(inject => inject.type?.toLowerCase() === 'sms');
  }, [injects]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-text-primary">
        SMS Messages ({smsInjects.length})
      </h2>

      {smsInjects.length === 0 ? (
        <div className="bg-surface p-8 rounded-lg text-center">
          <p className="text-text-secondary mb-2">No SMS messages intercepted yet</p>
          <p className="text-xs text-text-muted">Waiting for SMS intercepts...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {smsInjects.map((inject) => (
            <InjectCard key={inject.id} inject={inject} />
          ))}
        </div>
      )}
    </div>
  );
};
