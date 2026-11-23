import { ChatMessage } from '@/lib/messaging/chatApi';

/**
 * Small delivered/read indicator rendered next to a sent message bubble.
 */
export default function MessageStatus({
  status,
}: {
  status: ChatMessage['status'];
}) {
  if (status === 'sent') return null;

  const label = status === 'read' ? 'Read' : 'Delivered';
  const colorClass = status === 'read' ? 'text-blue-500' : 'text-gray-400';

  return (
    <span className={`text-xs ${colorClass}`} aria-label={label} title={label}>
      {status === 'read' ? '✓✓' : '✓'}
    </span>
  );
}
