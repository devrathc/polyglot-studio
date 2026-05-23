import { ModelBrowser } from '@/components/ModelBrowser';
import { Nav } from '@/components/Nav';
import { PricingNote } from '@/components/PricingNote';
import { TabHeader } from '@/components/TabHeader';

export const metadata = {
  title: 'Models · Polyglot Studio',
};

export default function ModelsPage() {
  return (
    <div className="flex h-screen flex-col">
      <Nav />
      <TabHeader
        title="Models"
        description="Searchable catalog of every model available on OpenRouter — context windows, pricing, modalities, providers."
        techNote="GET /api/v1/models · cached server-side for 10 minutes"
        pricing={
          <PricingNote
            tone="browse"
            wallet="No billing. This tab only browses the catalog — no chat calls are made."
            when="Never charged here. Prices in the table are reference numbers per million tokens for the *next* call you make from another tab."
            byok="BYOK does not change the listed prices. It changes which account is debited when you actually run the model from Chat / Compare / Multimodal."
            note=":free-suffixed models always cost $0 per token via the free pool. Everything else bills per the input / output rates shown."
          />
        }
      />
      <div className="flex-1 overflow-hidden">
        <ModelBrowser />
      </div>
    </div>
  );
}
