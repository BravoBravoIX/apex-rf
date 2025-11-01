import { useInjects } from '../contexts/InjectContext';
import { InjectCard } from '../components/InjectCard';
import { useMemo } from 'react';

export const NewsPage = () => {
  const { injects } = useInjects();

  const newsInjects = useMemo(() => {
    return injects.filter(inject => inject.type?.toLowerCase() === 'news');
  }, [injects]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-text-primary">
        News ({newsInjects.length})
      </h2>

      {newsInjects.length === 0 ? (
        <div className="bg-surface p-8 rounded-lg text-center">
          <p className="text-text-secondary mb-2">No news injects received yet</p>
          <p className="text-xs text-text-muted">Waiting for news updates...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {newsInjects.map((inject) => (
            <InjectCard key={inject.id} inject={inject} />
          ))}
        </div>
      )}
    </div>
  );
};
