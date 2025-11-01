import { useInjects } from '../contexts/InjectContext';
import { InjectCard } from '../components/InjectCard';
import { useMemo } from 'react';

export const SocialPage = () => {
  const { injects } = useInjects();

  const socialInjects = useMemo(() => {
    return injects.filter(inject => inject.type?.toLowerCase() === 'social');
  }, [injects]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-text-primary">
        Social Media ({socialInjects.length})
      </h2>

      {socialInjects.length === 0 ? (
        <div className="bg-surface p-8 rounded-lg text-center">
          <p className="text-text-secondary mb-2">No social media injects received yet</p>
          <p className="text-xs text-text-muted">Waiting for social media updates...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {socialInjects.map((inject) => (
            <InjectCard key={inject.id} inject={inject} />
          ))}
        </div>
      )}
    </div>
  );
};
