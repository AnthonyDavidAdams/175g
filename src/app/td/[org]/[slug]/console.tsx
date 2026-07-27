"use client";

import { useEffect, useRef, useState } from "react";

type ToolCall = { name: string; input: unknown; result: string };
type Msg = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[] | null;
  pending?: boolean;
};

const PROMPTS = [
  "Where are we, and what's due next?",
  "Help me find who controls the fields",
  "Draft the bid announcement",
  "Generate the schedule",
  "Find local sponsors to approach",
];

export default function Console({
  org,
  slug,
  initial,
}: {
  org: string;
  slug: string;
  initial: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "", pending: true },
    ]);

    try {
      const res = await fetch(`/api/agent/${org}/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m.slice(0, -1),
        {
          role: "assistant",
          content: data.text ?? data.error ?? "Something went wrong.",
          toolCalls: data.toolCalls,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m.slice(0, -1),
        { role: "assistant", content: "Network error. Try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="scroll-y flex-1 space-y-6 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="panel p-6">
            <p className="mono live">Ready</p>
            <p className="mt-3 leading-relaxed text-[var(--color-dim)]">
              Tell me where you are. If you&apos;re starting cold, say what school
              you&apos;re at and roughly when you want to run it — I&apos;ll take it
              from there.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i}>
            {m.role === "user" ? (
              <div className="flex gap-3">
                <span className="mono mt-1 shrink-0 text-[var(--color-signal)]">›</span>
                <p className="leading-relaxed text-[var(--color-dim)]">{m.content}</p>
              </div>
            ) : (
              <div className="pl-6">
                {m.pending ? (
                  <p className="mono live">Thinking</p>
                ) : (
                  <>
                    <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div className="mt-4 space-y-1.5">
                        {m.toolCalls.map((tc, j) => (
                          <details key={j} className="group">
                            <summary className="mono cursor-pointer list-none hover:text-[var(--color-signal)]">
                              <span className="text-[var(--color-signal)]">✓</span>{" "}
                              {tc.name}
                            </summary>
                            <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--color-line)] bg-black/30 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--color-dim)]">
                              {tc.result}
                            </pre>
                          </details>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {messages.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="btn btn-ghost !py-1.5 !text-xs"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          className="field"
          placeholder={busy ? "Working…" : "Tell the TD agent what you need"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="btn btn-primary disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
