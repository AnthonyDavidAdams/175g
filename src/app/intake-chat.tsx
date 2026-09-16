"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Markdown from "@/components/markdown";

type Msg = { role: "user" | "assistant"; content: string; pending?: boolean };

const OPENERS = [
  "We want to host a tournament in the spring",
  "How much does a 16-team tournament cost to run?",
  "I've never done this. Where do I start?",
  "Do we need to be sanctioned?",
];

/**
 * The landing page's centrepiece: talk to the tournament director before you
 * have an account. History lives server-side against an anonymous cookie, so
 * a returning visitor picks up where they left off, and the sign-in link the
 * agent sends carries it all into the console.
 */
export default function IntakeChat({ enabled }: { enabled: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/intake")
      .then((r) => r.json())
      .then((d) => {
        setMessages(d.messages ?? []);
        if (d.email) setLinkSentTo(d.email);
        if (d.claimed) setClaimed(true);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m.slice(0, -1),
        { role: "assistant", content: data.text ?? data.error ?? "Something went wrong." },
      ]);
      if (data.signinRequested && data.email) setLinkSentTo(data.email);
    } catch {
      setMessages((m) => [
        ...m.slice(0, -1),
        { role: "assistant", content: "Network error. Try again." },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  if (!enabled) {
    return (
      <div className="panel p-6">
        <p className="mono">Tournament director</p>
        <p className="mt-3 leading-relaxed text-[var(--color-dim)]">
          Sign in and tell the agent what you&apos;re trying to run. It takes it from
          there, one decision at a time.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/new" className="btn btn-primary">Start a tournament</Link>
          <Link href="/login" className="btn btn-ghost">Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-2.5">
        <span className="mono live">Tournament director</span>
        <span className="mono">No account needed to talk</span>
      </div>

      <div className="max-h-[28rem] space-y-5 overflow-y-auto p-5 sm:p-6">
        {loaded && messages.length === 0 && (
          <p className="leading-relaxed text-[var(--color-dim)]">
            Tell me what you&apos;re trying to run. A school and a rough month is
            plenty to start — I&apos;ll work out the rest with you, and when you&apos;re
            ready I&apos;ll open your console.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex gap-3">
              <span className="mono mt-1 shrink-0 text-[var(--color-signal)]">›</span>
              <p className="leading-relaxed text-[var(--color-dim)]">{m.content}</p>
            </div>
          ) : (
            <div key={i} className="pl-6">
              {m.pending ? (
                <p className="mono live">Thinking</p>
              ) : (
                <Markdown>{m.content}</Markdown>
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {claimed ? (
        <div className="border-t border-[var(--color-line)] p-4">
          <p className="text-sm text-[var(--color-dim)]">
            This conversation became a tournament.{" "}
            <Link href="/dashboard" className="underline hover:text-[var(--color-signal)]">
              Open your console
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          {linkSentTo && (
            <div className="border-t border-[var(--color-signal)]/30 bg-[var(--color-signal)]/5 px-4 py-3">
              <p className="mono text-[var(--color-signal)]">Link sent to {linkSentTo}</p>
              <p className="mt-1 text-sm text-[var(--color-dim)]">
                It works once and expires in 15 minutes. It opens your console with
                this conversation already there.
              </p>
            </div>
          )}

          {loaded && messages.length === 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-3">
              {OPENERS.map((p) => (
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
            className="flex gap-2 border-t border-[var(--color-line)] p-3"
          >
            <input
              ref={inputRef}
              className="field"
              placeholder={busy ? "Working…" : "What are you trying to run?"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="btn btn-primary disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
