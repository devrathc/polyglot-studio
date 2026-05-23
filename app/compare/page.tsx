import { CompareView } from '@/components/CompareView';
import { Nav } from '@/components/Nav';

export const metadata = {
  title: 'Compare · Polyglot Studio',
};

export default function ComparePage() {
  return (
    <div className="flex h-screen flex-col">
      <Nav />
      <CompareView />
    </div>
  );
}
