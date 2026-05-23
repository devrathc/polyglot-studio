import { AboutView } from '@/components/AboutView';
import { Nav } from '@/components/Nav';

export const metadata = {
  title: 'About · Polyglot Studio',
};

export default function AboutPage() {
  return (
    <div className="flex h-screen flex-col">
      <Nav />
      <div className="flex-1 overflow-y-auto">
        <AboutView />
      </div>
    </div>
  );
}
