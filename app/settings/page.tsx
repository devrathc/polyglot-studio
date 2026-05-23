import { ByokRegistry } from '@/components/ByokRegistry';
import { Nav } from '@/components/Nav';

export const metadata = {
  title: 'Settings · Polyglot Studio',
};

export default function SettingsPage() {
  return (
    <div className="flex h-screen flex-col">
      <Nav />
      <div className="flex-1 overflow-y-auto">
        <ByokRegistry />
      </div>
    </div>
  );
}
