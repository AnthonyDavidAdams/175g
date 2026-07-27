"use client";

import { useState } from "react";

type Row = {
  id: string;
  gameCode?: string | null;
  round: number | null;
  field: string | null;
  startTime: string | null;
  pool: string | null;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

export default function ScoreEntry({ games }: { games: Row[] }) {
  const [rows, setRows] = useState(games);
  const [saving, setSaving] = useState<string | null>(null);

  const [note, setNote] = useState<string | null>(null);

  async function save(id: string, body: Record<string, unknown>) {
    setSaving(id);
    setNote(null);
    const res = await fetch(`/api/scores/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(null);
    if (!res.ok) {
      setNote(data.error ?? "Could not save.");
      return;
    }
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...body } as Row : x)));
    if (data.clashes?.length) {
      setNote(
        `Saved — but field ${body.field ?? ""} in that round now also has ` +
          `${data.clashes.join(", ")}. Move one of them.`,
      );
    }
  }

  const byRound = new Map<number, Row[]>();
  for (const g of rows) {
    const k = g.round ?? 0;
    byRound.set(k, [...(byRound.get(k) ?? []), g]);
  }

  return (
    <div className="mt-8 space-y-8">
      {note && (
        <p className="panel border-[var(--color-warn)]/50 p-3 text-sm text-[var(--color-dim)]">
          {note}
        </p>
      )}
      {[...byRound.entries()]
        .sort(([a], [b]) => a - b)
        .map(([round, games]) => (
          <section key={round}>
            <p className="mono">
              Round {round} · {games.filter((g) => g.status === "final").length}/
              {games.length} in
            </p>
            <div className="mt-3 space-y-2">
              {games.map((g) => (
                <GameRow key={g.id} game={g} saving={saving === g.id} onSave={save} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function GameRow({
  game,
  saving,
  onSave,
}: {
  game: Row;
  saving: boolean;
  onSave: (id: string, body: Record<string, unknown>) => void;
}) {
  const [home, setHome] = useState(game.homeScore?.toString() ?? "");
  const [away, setAway] = useState(game.awayScore?.toString() ?? "");
  const [open, setOpen] = useState(false);
  const [field, setField] = useState(game.field ?? "");
  const [round, setRound] = useState(String(game.round ?? ""));
  const [time, setTime] = useState(game.startTime ?? "");
  const [status, setStatus] = useState(game.status);
  const final = game.status === "final";

  return (
    <div className={`panel p-3 ${final ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setOpen(!open)}
          title="Move this game"
          className="mono w-16 shrink-0 text-left hover:text-[var(--color-signal)]"
        >
          F{game.field}
        </button>
        <span className="flex-1 text-right text-sm">{game.homeName}</span>
        <input
          inputMode="numeric"
          value={home}
          onChange={(e) => setHome(e.target.value.replace(/\D/g, ""))}
          className="field !w-14 !py-1 text-center tabular"
        />
        <span className="text-[var(--color-faint)]">–</span>
        <input
          inputMode="numeric"
          value={away}
          onChange={(e) => setAway(e.target.value.replace(/\D/g, ""))}
          className="field !w-14 !py-1 text-center tabular"
        />
        <span className="flex-1 text-sm">{game.awayName}</span>
        <button
          onClick={() =>
            onSave(game.id, { homeScore: Number(home), awayScore: Number(away) })
          }
          disabled={saving || home === "" || away === ""}
          className="btn btn-ghost !py-1 !text-xs disabled:opacity-30"
        >
          {saving ? "…" : final ? "Update" : "Save"}
        </button>
      </div>

      {open && (
        <div className="mt-3 border-t border-[var(--color-line)] pt-3">
          <p className="mono">Move or override this game</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mono">Field</span>
              <input
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="field mt-1 !w-20 !py-1"
              />
            </label>
            <label className="block">
              <span className="mono">Round</span>
              <input
                value={round}
                onChange={(e) => setRound(e.target.value.replace(/\D/g, ""))}
                className="field mt-1 !w-20 !py-1"
              />
            </label>
            <label className="block">
              <span className="mono">Start</span>
              <input
                value={time}
                placeholder="HH:MM"
                onChange={(e) => setTime(e.target.value)}
                className="field mt-1 !w-24 !py-1"
              />
            </label>
            <label className="block">
              <span className="mono">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="field mt-1 !w-32 !py-1"
              >
                <option value="scheduled">scheduled</option>
                <option value="in_progress">in progress</option>
                <option value="final">final</option>
                <option value="forfeit">forfeit</option>
              </select>
            </label>
            <button
              onClick={() =>
                onSave(game.id, {
                  field,
                  round: Number(round) || undefined,
                  startTime: time || undefined,
                  status,
                })
              }
              disabled={saving}
              className="btn btn-primary !py-1.5 !text-xs disabled:opacity-40"
            >
              Apply
            </button>
          </div>
          <p className="mono mt-2 normal-case tracking-normal">
            Overrides win over anything the generator produced. You&apos;ll be warned
            if it double-books a field, but not stopped.
          </p>
        </div>
      )}
    </div>
  );
}
