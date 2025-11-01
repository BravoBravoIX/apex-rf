import { useInjects } from '../contexts/InjectContext';
import { useMemo, useState } from 'react';
import { Inject } from '../contexts/InjectContext';

export const EmailPage = () => {
  const { injects } = useInjects();
  const [selectedEmail, setSelectedEmail] = useState<Inject | null>(null);

  const emailInjects = useMemo(() => {
    return injects.filter(inject => inject.type?.toLowerCase() === 'email');
  }, [injects]);

  const getEmailContent = (inject: Inject) => {
    if (typeof inject.content === 'object' && inject.content) {
      return {
        from: inject.content.from || 'Unknown',
        to: inject.content.to || 'Unknown',
        subject: inject.content.subject || '(No Subject)',
        body: inject.content.body || inject.message || '(No content)',
      };
    }
    return {
      from: 'Unknown',
      to: 'Unknown',
      subject: '(No Subject)',
      body: inject.message || inject.content || '(No content)',
    };
  };

  const formatTime = (time?: number) => {
    if (time === undefined) return 'Unknown';
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `T+${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-text-primary">
        Email ({emailInjects.length})
      </h2>

      {emailInjects.length === 0 ? (
        <div className="bg-surface p-8 rounded-lg text-center">
          <p className="text-text-secondary mb-2">No emails received yet</p>
          <p className="text-xs text-text-muted">Waiting for email injects...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Inbox List */}
          <div className="bg-surface rounded-lg border border-border">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-text-primary">Inbox</h3>
            </div>
            <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
              {emailInjects.map((inject) => {
                const email = getEmailContent(inject);
                const isSelected = selectedEmail?.id === inject.id;

                return (
                  <div
                    key={inject.id}
                    onClick={() => setSelectedEmail(inject)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary/10 border-l-4 border-l-primary'
                        : 'hover:bg-surface-light'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-text-primary text-sm">
                        {email.from}
                      </span>
                      <span className="text-xs text-text-muted font-mono">
                        {formatTime(inject.delivered_at || inject.time)}
                      </span>
                    </div>
                    <div className="text-sm text-text-primary font-medium mb-1">
                      {email.subject}
                    </div>
                    <div className="text-xs text-text-secondary truncate">
                      {typeof email.body === 'string' ? email.body : JSON.stringify(email.body)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Email Detail */}
          <div className="bg-surface rounded-lg border border-border">
            {selectedEmail ? (
              <div className="p-6">
                <div className="border-b border-border pb-4 mb-4">
                  <h3 className="text-xl font-semibold text-text-primary mb-3">
                    {getEmailContent(selectedEmail).subject}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex gap-2">
                      <span className="text-text-muted font-medium w-16">From:</span>
                      <span className="text-text-primary">{getEmailContent(selectedEmail).from}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-text-muted font-medium w-16">To:</span>
                      <span className="text-text-primary">{getEmailContent(selectedEmail).to}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-text-muted font-medium w-16">Time:</span>
                      <span className="text-text-secondary font-mono">
                        {formatTime(selectedEmail.delivered_at || selectedEmail.time)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-text-primary whitespace-pre-wrap">
                  {getEmailContent(selectedEmail).body}
                </div>

                {selectedEmail.media && selectedEmail.media.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <h4 className="text-sm font-medium text-text-muted mb-2">Attachments</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedEmail.media.map((mediaPath, idx) => {
                        const isImage = /\.(jpg|jpeg|png|gif)$/i.test(mediaPath);
                        if (isImage) {
                          return (
                            <img
                              key={idx}
                              src={`http://localhost:8001${mediaPath}`}
                              alt="Email attachment"
                              className="rounded cursor-pointer hover:opacity-90 transition-opacity"
                              style={{ maxWidth: '400px', maxHeight: '300px', objectFit: 'contain' }}
                              onClick={() => window.open(`http://localhost:8001${mediaPath}`, '_blank')}
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-text-secondary">
                Select an email to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
