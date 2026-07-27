"use client";

import { useState } from "react";

export default function LoginForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setState("sending");
    const fd = new FormData(e.currentTarget);
    const next = new URLSearchParams(window.location.search).get("next");

    const res = await fetch("/api/auth/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: fd.get("email"), next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setState("idle");
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="panel mt-8 p-5">
        <p className="mono text-[var(--color-signal)]">Link sent</p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-dim)]">
          Check your email. The link works once and expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <input
        name="email"
        type="email"
        required
        autoFocus
        placeholder="you@school.edu"
        className="field"
      />
      {error && <p className="text-sm text-[var(--color-alert)]">{error}</p>}
      <button
        type="submit"
        disabled={state === "sending"}
        className="btn btn-primary w-full justify-center disabled:opacity-40"
      >
        {state === "sending" ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
