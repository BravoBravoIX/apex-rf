import { useInjects } from '../contexts/InjectContext';
import { InjectCard } from '../components/InjectCard';

export const AllInjectsPage = () => {
  const { injects } = useInjects();

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-text-primary">
        All Injects ({injects.length})
      </h2>

      {injects.length === 0 ? (
        <div className="bg-surface p-8 rounded-lg text-center">
          <p className="text-text-secondary mb-2">No injects received yet</p>
          <p className="text-xs text-text-muted">Waiting for injects...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {injects.map((inject) => (
            <InjectCard key={inject.id} inject={inject} />
          ))}
        </div>
      )}
    </div>
  );
};
