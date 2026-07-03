import { ThemeToggle } from 'connect-41';

export function Default() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 16 }}>
      <ThemeToggle />
    </div>
  );
}
