import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Polyglot Studio',
  description: 'Intelligent model routing and prompt optimization across 300+ models.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <footer className="border-t border-neutral-900 bg-[#0a0a0b] px-5 py-2 text-center text-[10.5px] text-neutral-600">
          Unofficial third-party client. Not affiliated with, endorsed by, or sponsored by OpenRouter Inc. or any model provider.
        </footer>
      </body>
    </html>
  );
}
