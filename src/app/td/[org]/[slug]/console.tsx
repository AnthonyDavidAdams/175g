"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "@/components/markdown";

type ToolCall = { name: string; input: unknown; result: string };
type Msg = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[] | null;
  pending?: boolean;
  /** Who typed a user turn, when it wasn't the reader. */
  author?: string | null;
};

const PROMPTS: Record<string, string[]> = {
  td: [
    "Where are we, and what's due next?",
    "Help me find who controls the fields",
    "Draft the bid announcement",
    "Generate the schedule",
    "Find local sponsors to approach",
  ],
  staff: [
    "What's on right now and what's next?",
    "Field 3 is unplayable — what can move?",
    "Post an announcement: lightning delay, 30 minutes",
    "What's still open on the task list today?",
  ],
  advisor: [
    "Give me an honest read on where this event stands",
    "What is exposed right now that the TD may not see?",
    "Is the refund policy strong enough for a weather cancellation?",
    "Package this as a template for next year's TD",
  ],
};

export default function Console({
  org,
  slug,
  initial,
  role = "td",
  mainThread,
}: {
  org: string;
  slug: string;
  initial: Msg[];
  role?: "owner" | "td" | "staff" | "advisor";
  /**
   * For advisors: the organisers' working conversation, shown read-only above
   * their own thread. Oversight means seeing what was actually said.
   */
  mainThread?: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showMain, setShowMain] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const isAdvisor = role === "advisor";
  const prompts = PROMPTS[isAdvisor ? "advisor" : role === "staff" ? "staff" : "td"];

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
        {isAdvisor && mainThread && (
          <div className="panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="mono">
                The organisers&apos; conversation · {mainThread.length} turns
              </p>
              <button
                onClick={() => setShowMain(!showMain)}
                className="mono hover:text-[var(--color-signal)]"
              >
                {showMain ? "Hide" : "Read"}
              </button>
            </div>
            {!showMain && (
              <p className="mt-2 text-sm text-[var(--color-dim)]">
                Everything the TD and the agent have said to each other, read-only.
                Your own conversation below is separate; the TD doesn&apos;t see it.
              </p>
            )}
            {showMain && (
              <div className="mt-4 space-y-4 border-t border-[var(--color-line)] pt-4">
                {mainThread.length === 0 && (
                  <p className="text-sm text-[var(--color-dim)]">
                    The TD hasn&apos;t talked to the agent yet.
                  </p>
                )}
                {mainThread.map((m, i) => (
                  <Turn key={i} m={m} />
                ))}
              </div>
            )}
          </div>
        )}

        {messages.length === 0 && (
          <div className="panel p-6">
            <p className="mono live">Ready</p>
            <p className="mt-3 leading-relaxed text-[var(--color-dim)]">
              {isAdvisor
                ? "You're here as an advisor. I can read everything about this event, tell you where it stands, and carry a note to the TD — but I can't change anything, and neither can you. Ask me for a read."
                : role === "staff"
                  ? "You're on staff. I can move games, post announcements and work the task list with you. Anything bigger needs the TD — say so and I'll leave them a note."
                  : "Tell me where you are. If you're starting cold, say what school you're at and roughly when you want to run it — I'll take it from there."}
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <Turn key={i} m={m} />
        ))}
        <div ref={endRef} />
      </div>

      {messages.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {prompts.map((p) => (
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
          placeholder={
            busy
              ? "Working…"
              : isAdvisor
                ? "Ask for a read, or dictate a note for the TD"
                : "Tell the TD agent what you need"
          }
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

function Turn({ m }: { m: Msg }) {
  if (m.role === "user") {
    return (
      <div className="flex gap-3">
        <span className="mono mt-1 shrink-0 text-[var(--color-signal)]">›</span>
        <div>
          {m.author && <span className="mono block">{m.author}</span>}
          <p className="leading-relaxed text-[var(--color-dim)]">{m.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="pl-6">
      {m.pending ? (
        <p className="mono live">Thinking</p>
      ) : (
        <>
          <Markdown>{m.content}</Markdown>
          {m.toolCalls && m.toolCalls.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {m.toolCalls.map((tc, j) => (
                <details key={j} className="group">
                  <summary className="mono cursor-pointer list-none hover:text-[var(--color-signal)]">
                    <span className="text-[var(--color-signal)]">✓</span> {tc.name}
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
  );
}
