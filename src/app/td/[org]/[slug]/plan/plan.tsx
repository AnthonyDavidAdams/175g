"use client";

import { useMemo, useState } from "react";

type Task = {
  id: string;
  phase: string;
  task: string;
  owner: string;
  assignee: string;
  startDate: string;
  dueDate: string;
  hardDeadline: boolean;
  done: boolean;
  notes: string;
};

const DAY = 86400000;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function Plan({
  org,
  slug,
  eventDate,
  people,
  tasks: initial,
}: {
  org: string;
  slug: string;
  eventDate: string | null;
  people: string[];
  tasks: Task[];
}) {
  const [tasks, setTasks] = useState(initial);
  const [view, setView] = useState<"list" | "chart">("list");
  const [showDone, setShowDone] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);

  const today = iso(new Date());

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tasks/${org}/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return null;
    }
    return data;
  }

  async function toggle(t: Task) {
    const done = !t.done;
    setTasks((all) => all.map((x) => (x.id === t.id ? { ...x, done } : x)));
    await call({ action: "upsert", task: { ...t, done } });
  }

  async function save(t: Task) {
    const data = await call({ action: "upsert", task: t });
    if (!data) return;
    setTasks((all) =>
      t.id ? all.map((x) => (x.id === t.id ? t : x)) : [...all, { ...t, id: data.id }],
    );
    setEditing(null);
  }

  async function remove(id: string) {
    const data = await call({ action: "delete", id });
    if (data) setTasks((all) => all.filter((x) => x.id !== id));
    setEditing(null);
  }

  async function bulkAssign(assignee: string) {
    const ids = [...selected];
    const data = await call({ action: "bulk", ids, set: { assignee } });
    if (!data) return;
    setTasks((all) =>
      all.map((x) => (selected.has(x.id) ? { ...x, assignee } : x)),
    );
    setSelected(new Set());
  }

  const visible = useMemo(
    () =>
      tasks
        .filter((t) => (showDone ? true : !t.done))
        .filter((t) => (filterAssignee ? t.assignee === filterAssignee : true))
        .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")),
    [tasks, showDone, filterAssignee],
  );

  const open = tasks.filter((t) => !t.done);
  const late = open.filter((t) => t.dueDate && t.dueDate < today);
  const thisWeek = open.filter(
    (t) =>
      t.dueDate &&
      t.dueDate >= today &&
      new Date(t.dueDate).getTime() - Date.now() <= 7 * DAY,
  );
  const unassigned = open.filter((t) => !t.assignee);

  return (
    <div className="mt-8">
      {/* Where the plan actually stands */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Open" value={open.length} />
        <Stat label="Late" value={late.length} tone={late.length ? "alert" : undefined} />
        <Stat
          label="Due this week"
          value={thisWeek.length}
          tone={thisWeek.length ? "warn" : undefined}
        />
        <Stat
          label="Unassigned"
          value={unassigned.length}
          tone={unassigned.length ? "warn" : undefined}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setView("list")}
          className={`btn !py-1.5 !text-xs ${view === "list" ? "btn-primary" : "btn-ghost"}`}
        >
          List
        </button>
        <button
          onClick={() => setView("chart")}
          className={`btn !py-1.5 !text-xs ${view === "chart" ? "btn-primary" : "btn-ghost"}`}
        >
          Timeline
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--color-line-strong)]" />
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="field !w-auto !py-1.5 !text-xs"
        >
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label className="mono flex items-center gap-1.5 normal-case tracking-normal">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          Show done
        </label>
        <button
          onClick={() =>
            setEditing({
              id: "",
              phase: "",
              task: "",
              owner: "",
              assignee: "",
              startDate: "",
              dueDate: "",
              hardDeadline: false,
              done: false,
              notes: "",
            })
          }
          className="btn btn-ghost !py-1.5 !text-xs"
        >
          Add task
        </button>
      </div>

      {selected.size > 0 && (
        <div className="panel mt-3 flex flex-wrap items-center gap-3 p-3">
          <span className="mono">{selected.size} selected</span>
          <select
            onChange={(e) => e.target.value && bulkAssign(e.target.value)}
            defaultValue=""
            className="field !w-auto !py-1 !text-xs"
          >
            <option value="">Assign to…</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              const ids = [...selected];
              await call({ action: "bulk", ids, set: { done: true } });
              setTasks((all) =>
                all.map((x) => (selected.has(x.id) ? { ...x, done: true } : x)),
              );
              setSelected(new Set());
            }}
            className="btn btn-ghost !py-1 !text-xs"
          >
            Mark done
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="mono hover:text-[var(--color-signal)]"
          >
            Clear
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-[var(--color-alert)]">{error}</p>}

      {tasks.length === 0 ? (
        <p className="mt-8 text-[var(--color-dim)]">
          No plan yet. Ask the agent to generate the countdown from your event date,
          or add tasks by hand.
        </p>
      ) : view === "list" ? (
        <ListView
          tasks={visible}
          today={today}
          selected={selected}
          setSelected={setSelected}
          onToggle={toggle}
          onEdit={setEditing}
          busy={busy}
        />
      ) : (
        <ChartView tasks={visible} today={today} eventDate={eventDate} />
      )}

      {editing && (
        <Editor
          task={editing}
          people={people}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={save}
          onDelete={editing.id ? () => remove(editing.id) : undefined}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "alert" | "warn";
}) {
  const colour =
    tone === "alert"
      ? "text-[var(--color-alert)]"
      : tone === "warn"
        ? "text-[var(--color-warn)]"
        : "text-[var(--color-signal)]";
  return (
    <div className="panel p-4">
      <div className={`tabular text-2xl ${colour}`}>{value}</div>
      <div className="mono mt-1">{label}</div>
    </div>
  );
}

function ListView({
  tasks,
  today,
  selected,
  setSelected,
  onToggle,
  onEdit,
  busy,
}: {
  tasks: Task[];
  today: string;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  busy: boolean;
}) {
  let phase = "";
  return (
    <div className="mt-5 space-y-1">
      {tasks.map((t) => {
        const header = t.phase !== phase ? ((phase = t.phase), true) : false;
        const isLate = !t.done && t.dueDate && t.dueDate < today;
        return (
          <div key={t.id}>
            {header && t.phase && <p className="mono mt-5 mb-1">{t.phase}</p>}
            <div
              className={`panel flex flex-wrap items-center gap-3 p-3 ${
                t.done ? "opacity-50" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  e.target.checked ? next.add(t.id) : next.delete(t.id);
                  setSelected(next);
                }}
              />
              <button
                onClick={() => onToggle(t)}
                disabled={busy}
                title={t.done ? "Mark not done" : "Mark done"}
                className={`h-4 w-4 shrink-0 rounded border ${
                  t.done
                    ? "border-[var(--color-signal)] bg-[var(--color-signal)]"
                    : "border-[var(--color-line-strong)]"
                }`}
              />
              <span
                className={`tabular w-24 shrink-0 text-xs ${
                  isLate ? "text-[var(--color-alert)]" : "text-[var(--color-faint)]"
                }`}
              >
                {t.dueDate || "—"}
              </span>
              <button
                onClick={() => onEdit(t)}
                className={`flex-1 text-left text-sm hover:text-[var(--color-signal)] ${
                  t.done ? "line-through" : ""
                }`}
              >
                {t.task}
                {t.hardDeadline && (
                  <span className="mono ml-2 normal-case tracking-normal">
                    hard deadline
                  </span>
                )}
              </button>
              <span className="mono w-32 shrink-0 truncate text-right">
                {t.assignee || t.owner || "unassigned"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Timeline view.
 *
 * Deliberately not a classic Gantt with dependency arrows: tournament work is
 * deadline-driven, not duration-driven, and most items are a single date. Tasks
 * with a start date draw as bars; the rest draw as milestone diamonds on the
 * day they are due. That is an honest picture of the plan rather than inventing
 * durations nobody supplied.
 */
function ChartView({
  tasks,
  today,
  eventDate,
}: {
  tasks: Task[];
  today: string;
  eventDate: string | null;
}) {
  const dated = tasks.filter((t) => t.dueDate);
  if (!dated.length) {
    return (
      <p className="mt-8 text-[var(--color-dim)]">
        No tasks have dates yet, so there is nothing to plot.
      </p>
    );
  }

  const times = dated.flatMap((t) => [
    new Date(t.startDate || t.dueDate).getTime(),
    new Date(t.dueDate).getTime(),
  ]);
  if (eventDate) times.push(new Date(eventDate).getTime());
  times.push(Date.now());

  const min = Math.min(...times) - 3 * DAY;
  const max = Math.max(...times) + 3 * DAY;
  const span = Math.max(max - min, DAY);
  const pct = (d: string | number) =>
    ((new Date(d).getTime() - min) / span) * 100;

  // A month tick every month boundary in range.
  const ticks: { at: number; label: string }[] = [];
  const cursor = new Date(min);
  cursor.setUTCDate(1);
  while (cursor.getTime() <= max) {
    if (cursor.getTime() >= min) {
      ticks.push({
        at: pct(cursor.getTime()),
        label: cursor.toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        }),
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  let phase = "";
  return (
    <div className="scroll-x mt-5">
      <div className="min-w-[46rem]">
        {/* Month axis */}
        <div className="relative mb-2 h-5 border-b border-[var(--color-line)]">
          {ticks.map((t) => (
            <span
              key={t.label}
              className="mono absolute -translate-x-1/2"
              style={{ left: `${t.at}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>

        <div className="relative">
          {/* Today, and the event itself */}
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-[var(--color-signal)]/60"
            style={{ left: `${pct(today)}%` }}
          />
          {eventDate && (
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-[var(--color-alert)]/70"
              style={{ left: `${pct(eventDate)}%` }}
            />
          )}

          {dated.map((t) => {
            const header = t.phase !== phase ? ((phase = t.phase), true) : false;
            const isLate = !t.done && t.dueDate < today;
            const start = t.startDate || t.dueDate;
            const left = pct(start);
            const width = Math.max(pct(t.dueDate) - left, 0);
            const colour = t.done
              ? "bg-[var(--color-faint)]"
              : isLate
                ? "bg-[var(--color-alert)]"
                : t.hardDeadline
                  ? "bg-[var(--color-warn)]"
                  : "bg-[var(--color-signal)]";
            return (
              <div key={t.id}>
                {header && t.phase && (
                  <p className="mono mt-4 mb-1">{t.phase}</p>
                )}
                <div className="group relative flex h-7 items-center">
                  {width > 0.4 ? (
                    <div
                      className={`absolute h-2.5 rounded-sm ${colour} ${t.done ? "opacity-40" : ""}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${t.task} — ${t.startDate} to ${t.dueDate}`}
                    />
                  ) : (
                    <div
                      className={`absolute h-2.5 w-2.5 rotate-45 ${colour} ${t.done ? "opacity-40" : ""}`}
                      style={{ left: `calc(${left}% - 5px)` }}
                      title={`${t.task} — due ${t.dueDate}`}
                    />
                  )}
                  <span
                    className="pointer-events-none absolute whitespace-nowrap text-xs text-[var(--color-dim)] opacity-0 transition group-hover:opacity-100"
                    style={{ left: `calc(${left}% + 12px)` }}
                  >
                    {t.task.slice(0, 60)}
                    {t.assignee ? ` · ${t.assignee}` : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mono mt-5 normal-case tracking-normal">
          Diamonds are single-date items; bars are tasks with a start date. The lime
          line is today, the red line is the tournament. Hover for detail.
        </p>
      </div>
    </div>
  );
}

function Editor({
  task,
  people,
  busy,
  onCancel,
  onSave,
  onDelete,
}: {
  task: Task;
  people: string[];
  busy: boolean;
  onCancel: () => void;
  onSave: (t: Task) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(task);
  const set = (p: Partial<Task>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <div className="panel mt-6 p-5">
      <p className="mono">{task.id ? "Edit task" : "New task"}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mono">Task</span>
          <input
            value={draft.task}
            onChange={(e) => set({ task: e.target.value })}
            className="field mt-2"
          />
        </label>
        <label className="block">
          <span className="mono">Phase</span>
          <input
            value={draft.phase}
            onChange={(e) => set({ phase: e.target.value })}
            placeholder="Foundation, Teams, Ops…"
            className="field mt-2"
          />
        </label>
        <label className="block">
          <span className="mono">Assignee</span>
          <input
            list="plan-people"
            value={draft.assignee}
            onChange={(e) => set({ assignee: e.target.value })}
            className="field mt-2"
          />
          <datalist id="plan-people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="mono">Start (optional — makes it a bar)</span>
          <input
            type="date"
            value={draft.startDate}
            onChange={(e) => set({ startDate: e.target.value })}
            className="field mt-2"
          />
        </label>
        <label className="block">
          <span className="mono">Due</span>
          <input
            type="date"
            value={draft.dueDate}
            onChange={(e) => set({ dueDate: e.target.value })}
            className="field mt-2"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mono">Notes</span>
          <textarea
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
            rows={3}
            className="field mt-2"
          />
        </label>
        <label className="mono flex items-center gap-2 normal-case tracking-normal">
          <input
            type="checkbox"
            checked={draft.hardDeadline}
            onChange={(e) => set({ hardDeadline: e.target.checked })}
          />
          Hard deadline — can&apos;t be fixed by working harder
        </label>
        <label className="mono flex items-center gap-2 normal-case tracking-normal">
          <input
            type="checkbox"
            checked={draft.done}
            onChange={(e) => set({ done: e.target.checked })}
          />
          Done
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={() => onSave(draft)}
          disabled={busy || !draft.task.trim()}
          className="btn btn-primary !py-1.5 !text-xs disabled:opacity-40"
        >
          Save
        </button>
        <button onClick={onCancel} className="btn btn-ghost !py-1.5 !text-xs">
          Cancel
        </button>
        {onDelete && (
          <button onClick={onDelete} className="btn btn-ghost !py-1.5 !text-xs">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
