"use client";

export default function PrintButton() {
  return (
    <div className="noprint mx-auto max-w-3xl px-6 pt-8">
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <span>
          <span className="block font-medium">Player handout</span>
          <span className="mono mt-1 block normal-case tracking-normal">
            Two pages. Print double-sided on A4 or Letter, flip on the long edge.
            Laminate one per field and hand the rest to captains.
          </span>
        </span>
        <button onClick={() => window.print()} className="btn btn-primary">
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
