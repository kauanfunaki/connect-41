import { NotificationBell } from 'connect-41';

export function SemNotificacoes() {
  return (
    <div style={{ padding: 16 }}>
      <NotificationBell unreadCount={0} />
    </div>
  );
}

export function ComNotificacoes() {
  return (
    <div style={{ padding: 16 }}>
      <NotificationBell unreadCount={5} />
    </div>
  );
}
