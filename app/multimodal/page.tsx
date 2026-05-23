import { MultimodalView } from '@/components/MultimodalView';
import { Nav } from '@/components/Nav';

export const metadata = {
  title: 'Multimodal · OpenRouter Studio',
};

export default function MultimodalPage() {
  return (
    <div className="flex h-screen flex-col">
      <Nav />
      <MultimodalView />
    </div>
  );
}
