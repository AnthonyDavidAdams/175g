/**
 * Dynamic countdown from the event date, adapted to actual runway.
 *
 * TypeScript port of scripts/timeline.py. With a full year the plan is relaxed;
 * with eight weeks it marks what is already late and which hard deadlines can no
 * longer be met (a jersey lead time does not shorten because you want it to).
 */

type PlanRow = [number, string, string, string, boolean];

// [weeksBefore, phase, task, owner, hardDeadline]
const PLAN: PlanRow[] = [
  [52, "Foundation", "Decide to host; name the TD and confirm they are not playing", "TD", false],
  [48, "Foundation", "Identify target weekend(s): season window, competing tournaments, academic calendar, campus events, weather history", "TD", false],
  [46, "Foundation", "Identify field stakeholders by name: campus rec facilities coordinator, club sports, parks permit specialist, local ultimate org", "TD", false],
  [44, "Foundation", "First contact with field providers; request availability and pricing", "TD", false],
  [40, "Foundation", "Site visit: field count, water sources, toilets, parking, power", "TD", false],
  [36, "Foundation", "Start TD certification and SafeSport training", "TD", true],
  [34, "Foundation", "Apply for institutional funding — student government deadlines are often a semester ahead", "Sponsorship", true],
  [32, "Foundation", "Negotiate field agreement: price, setup time, lining, cancellation, insurance requirements", "TD", false],
  [30, "Foundation", "SIGN THE FIELD AGREEMENT — nothing is announced before this", "TD", true],
  [28, "Money", "Build the budget; model break-even at several team counts", "TD", false],
  [28, "Money", "Set the bid fee and write the refund and weather-cancellation policy", "TD", false],
  [26, "Sponsors", "Approach ultimate-industry brands — they have formal programs and slow cycles", "Sponsorship", false],
  [24, "Compliance", "Submit sanctioning application (6+ weeks out is the cheaper fee tier)", "TD", true],
  [24, "Compliance", "Request certificate of insurance with the facility's exact legal entity name and limits", "TD", true],
  [22, "Teams", "Build target list: 3–4x the teams you need. Returning teams and last year's waitlist first.", "Registration", false],
  [20, "Teams", "Invite returning teams and prior waitlist before the public announcement", "Registration", false],
  [18, "Teams", "Publish the bid announcement everywhere captains are", "Registration", false],
  [18, "Staff", "Assign lead roles: volunteers, registration, scheduling, medical, food and water, social, media, sponsorship", "TD", false],
  [16, "Ops", "Book the athletic trainer", "Medical", true],
  [16, "Sponsors", "Local sponsor push: food and drink, product donations, services, alumni", "Sponsorship", false],
  [14, "Swag", "Finalise swag design; set the hard sponsor-logo cutoff", "Media", true],
  [12, "Teams", "Application deadline", "Registration", false],
  [11, "Teams", "Send acceptances, waitlist notices, and declines — tell everyone", "Registration", false],
  [10, "Swag", "Order jerseys (4–8 week lead time)", "Media", true],
  [9, "Money", "Bid payment deadline", "Registration", false],
  [8, "Swag", "Order custom-stamped discs (3–5 week lead time)", "Media", true],
  [8, "Teams", "Work the waitlist to fill unpaid spots", "Registration", false],
  [7, "Format", "Lock the field; seed the teams; generate format and schedule", "Scheduling", false],
  [7, "Format", "Pre-generate N-1 and N-2 formats and the weather-degraded schedules", "Scheduling", false],
  [6, "Ops", "Order porta-johns, rentals, tents, radios", "TD", true],
  [6, "Swag", "Order trophies, medals, and spirit prizes", "Media", true],
  [6, "Compliance", "Deliver the COI to the facility (many require 30+ days)", "TD", true],
  [6, "Sponsors", "Sponsor logo cutoff for anything printed", "Sponsorship", true],
  [5, "Swag", "Order shirts (2–3 week lead time)", "Media", false],
  [5, "Compliance", "Write the Event Medical Plan and Inclement Weather Plan", "Medical", false],
  [4, "Staff", "Recruit volunteers — 25% more than the shift grid needs", "Volunteers", false],
  [4, "Ops", "Confirm food, water source, and ice orders", "Food/Water", false],
  [3, "Swag", "Order stickers and field banners", "Media", false],
  [3, "Ops", "Publish the schedule, site map, and parking instructions", "Scheduling", false],
  [3, "Comms", "Open the Telegram group and get every captain in it", "Registration", false],
  [2, "Staff", "Confirm every volunteer shift individually — a group message is not a confirmation", "Volunteers", false],
  [2, "Ops", "Confirm all vendor delivery windows in writing", "TD", false],
  [2, "Sponsors", "Last window for day-of product donations (water, ice, fruit)", "Sponsorship", false],
  [1, "Ops", "Field lining (finish a full day before play)", "Volunteers", true],
  [1, "Comms", "Send the week-of email: schedule, parking, check-in, roster deadline, forecast, trainer, social", "Registration", false],
  [1, "Compliance", "Roster deadline — 5:00pm Wednesday before, for sanctioned college events", "Registration", true],
  [1, "Ops", "Assemble player packs", "Volunteers", false],
  [1, "Ops", "Charge radios; buy batteries; print schedules and scorekeeper clipboards", "TD", false],
  [0, "Event", "Run the tournament", "All", false],
  [-1, "Wrap", "Send the player and captain survey that evening — response rate collapses after 48h", "Registration", true],
  [-1, "Wrap", "Return equipment; settle vendor payments", "TD", false],
  [-1, "Wrap", "Thank field staff, sponsors (with photos of their signage), volunteers, and teams", "TD", false],
  [-2, "Wrap", "Hold the staff debrief while memory is fresh", "TD", false],
  [-3, "Wrap", "Write the archive: contacts, vendors, budget actuals, site notes, what broke, teams", "TD", false],
  [-4, "Wrap", "Handoff: walk the archive with the successor and introduce them to key contacts", "TD", true],
];

export type TimelineRow = {
  due: string;
  weeksBefore: number;
  daysOut: number;
  phase: string;
  task: string;
  owner: string;
  hard: boolean;
  status: "LATE" | "THIS WEEK" | "soon" | "upcoming" | "done/passed";
};

export function buildTimeline(eventDate: string, today: Date): TimelineRow[] {
  const event = new Date(`${eventDate}T00:00:00Z`);
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  const rows = PLAN.map(([weeks, phase, task, owner, hard]) => {
    const due = new Date(event.getTime() - weeks * 7 * 86400000);
    const daysOut = Math.round((due.getTime() - todayUtc.getTime()) / 86400000);
    let status: TimelineRow["status"];
    if (daysOut < 0) status = weeks > 0 ? "LATE" : "done/passed";
    else if (daysOut <= 7) status = "THIS WEEK";
    else if (daysOut <= 21) status = "soon";
    else status = "upcoming";

    return {
      due: due.toISOString().slice(0, 10),
      weeksBefore: weeks,
      daysOut,
      phase,
      task,
      owner,
      hard,
      status,
    };
  });

  return rows.sort((a, b) => a.due.localeCompare(b.due));
}

export function runwayNote(eventDate: string, today: Date): string {
  const event = new Date(`${eventDate}T00:00:00Z`);
  const weeks = (event.getTime() - today.getTime()) / (7 * 86400000);
  if (weeks >= 40)
    return `${Math.round(weeks)} weeks of runway. Comfortable — the foundation phase is the whole job right now.`;
  if (weeks >= 20)
    return `${Math.round(weeks)} weeks of runway. Workable. Field agreement and sanctioning are the critical path.`;
  if (weeks >= 10)
    return `${Math.round(weeks)} weeks of runway. Compressed. Sign fields and submit sanctioning immediately; expect the higher sanctioning tier.`;
  if (weeks >= 0)
    return `${Math.round(weeks)} weeks of runway. Very compressed. Everything marked LATE happens this week or gets dropped on purpose.`;
  return "Event date is in the past.";
}
