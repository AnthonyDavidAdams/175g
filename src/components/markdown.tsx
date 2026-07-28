"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown for any prose the app displays — agent replies, announcements,
 * descriptions.
 *
 * Raw HTML is deliberately not enabled. Some of this text originates from a
 * model and some from other users, and neither is a source we should be
 * injecting markup from. Markdown alone covers everything this content needs.
 */
export default function Markdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Links out of the app open in a new tab; noreferrer because some of
          // these URLs come from a model or another user.
          a: ({ href, children }) => {
            const external = /^https?:\/\//.test(href ?? "");
            return (
              <a
                href={href}
                {...(external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {children}
              </a>
            );
          },
          // Wide tables scroll in their own container so the page never scrolls
          // sideways on a phone at the fields.
          table: ({ children }) => (
            <div className="scroll-x">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
