import { InsightsView } from '@/components/InsightsView';
import { Nav } from '@/components/Nav';

export const metadata = {
  title: 'Insights · Polyglot Studio',
};

export default function InsightsPage() {
  return (
    <div className="flex h-screen flex-col">
      <Nav />
      <div className="flex-1 overflow-y-auto">
        <InsightsView />
      </div>
    </div>
  );
}
