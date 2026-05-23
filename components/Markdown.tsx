'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ source }: { source: string }) {
  return (
    <div className="markdown-output">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h1 className="mb-2 mt-3 text-base font-semibold text-neutral-100" {...props} />,
          h2: (props) => <h2 className="mb-2 mt-3 text-sm font-semibold text-neutral-100" {...props} />,
          h3: (props) => <h3 className="mb-1.5 mt-2.5 text-sm font-semibold text-neutral-200" {...props} />,
          p: (props) => <p className="mb-2 last:mb-0" {...props} />,
          ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
          ol: (props) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
          li: (props) => <li className="leading-relaxed" {...props} />,
          a: (props) => (
            <a
              className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
              target="_blank"
              rel="noreferrer noopener"
              {...props}
            />
          ),
          blockquote: (props) => (
            <blockquote className="mb-2 border-l-2 border-neutral-700 pl-3 italic text-neutral-300" {...props} />
          ),
          hr: () => <hr className="my-3 border-neutral-800" />,
          table: (props) => (
            <div className="mb-2 overflow-x-auto">
              <table className="w-full border-collapse text-[12px]" {...props} />
            </div>
          ),
          th: (props) => (
            <th className="border border-neutral-800 bg-neutral-900 px-2 py-1 text-left font-medium" {...props} />
          ),
          td: (props) => <td className="border border-neutral-800 px-2 py-1 align-top" {...props} />,
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className ?? '');
            if (isBlock) {
              return (
                <code className={`${className ?? ''} text-[12.5px]`} {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-neutral-900 px-1 py-0.5 font-mono text-[0.9em] text-emerald-200" {...rest}>
                {children}
              </code>
            );
          },
          pre: (props) => (
            <pre
              className="mb-2 overflow-x-auto rounded-md border border-neutral-800 bg-[#0a0a0c] p-2.5 font-mono text-[12.5px] leading-relaxed text-neutral-200 last:mb-0"
              {...props}
            />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
