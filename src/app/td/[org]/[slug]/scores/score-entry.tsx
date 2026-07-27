"use client";

import { useState } from "react";

type Row = {
  id: string;
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

  async function save(id: string, homeScore: string, awayScore: string) {
    if (homeScore === "" || awayScore === "") return;
    setSaving(id);
    const res = await fetch(`/api/scores/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ homeScore: Number(homeScore), awayScore: Number(awayScore) }),
    });
    if (res.ok) {
      setRows((r) =>
        r.map((x) =>
          x.id === id
            ? { ...x, homeScore: Number(homeScore), awayScore: Number(awayScore), status: "final" }
            : x,
        ),
      );
    }
    setSaving(null);
  }

  const byRound = new Map<number, Row[]>();
  for (const g of rows) {
    const k = g.round ?? 0;
    byRound.set(k, [...(byRound.get(k) ?? []), g]);
  }

  return (
    <div className="mt-8 space-y-8">
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
  onSave: (id: string, h: string, a: string) => void;
}) {
  const [home, setHome] = useState(game.homeScore?.toString() ?? "");
  const [away, setAway] = useState(game.awayScore?.toString() ?? "");
  const final = game.status === "final";

  return (
    <div
      className={`panel flex flex-wrap items-center gap-3 p-3 ${
        final ? "opacity-60" : ""
      }`}
    >
      <span className="mono w-16 shrink-0">F{game.field}</span>
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
        onClick={() => onSave(game.id, home, away)}
        disabled={saving || !home || !away}
        className="btn btn-ghost !py-1 !text-xs disabled:opacity-30"
      >
        {saving ? "…" : final ? "Update" : "Save"}
      </button>
    </div>
  );
}
