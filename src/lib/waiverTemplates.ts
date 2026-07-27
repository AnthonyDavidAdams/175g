/**
 * Starting-point waiver templates.
 *
 * These are drafts, not legal advice, and the app says so plainly wherever they
 * appear. A TD's school, city, or field provider will usually have required
 * language of their own — the template exists so nobody starts from a blank
 * page, and both the TD and the agent can edit freely from there.
 *
 * `{{placeholders}}` are filled from the tournament record at creation time.
 */

export type WaiverTemplate = {
  key: string;
  title: string;
  audience: "participant" | "team" | "minor" | "volunteer";
  description: string;
  body: string;
};

export const TEMPLATES: WaiverTemplate[] = [
  {
    key: "participant",
    title: "Participant waiver and release of liability",
    audience: "participant",
    description:
      "Signed by every player. The one you cannot run a tournament without.",
    body: `PARTICIPANT WAIVER AND RELEASE OF LIABILITY
{{tournament_name}} — {{dates}} — {{venue}}

Read this before signing. It affects your legal rights.

1. ASSUMPTION OF RISK
Ultimate is a running, jumping, and contact sport played outdoors on uneven
ground. I understand that participation carries risks including sprains,
fractures, concussion and other head injury, heat illness, dehydration,
lightning exposure, collision with other players or objects, permanent
disability, and death. I understand these risks cannot be eliminated. I choose
to participate voluntarily and with full knowledge of them.

2. FITNESS AND MEDICAL
I confirm I am physically fit to participate. I will stop playing and seek help
if I am injured or unwell. I authorise event staff and medical personnel to
provide emergency treatment if I cannot consent at the time, and I accept
responsibility for the cost of that treatment.

3. RELEASE
In exchange for being allowed to participate, I release and agree not to sue
{{organizer}}, {{venue_owner}}, and their organizers, staff, volunteers,
sponsors, and officials for any injury, illness, death, or property loss arising
from my participation, including where caused by ordinary negligence. This does
not release gross negligence, recklessness, or intentional misconduct, and does
not waive any right that cannot be waived under applicable law.

4. RULES AND CONDUCT
Ultimate is self-officiated. I will play by the rules in force at this event,
accept the Spirit of the Game as binding, and follow instructions from the
tournament director and event staff. I understand I may be removed from the
event for dangerous or abusive conduct, without refund.

5. MEDIA
I grant permission to use photographs and video of me taken at this event for
non-commercial promotion of the event and the sport. If I do not agree to this
paragraph, I will tell the tournament director in writing and it will not apply
to me.

6. GENERAL
This agreement is governed by the law of the state in which the event is held.
If any part is found unenforceable, the rest remains in force. I have read and
understood this document and sign it freely.

By typing my name below I am signing this document electronically, and I agree
that my electronic signature has the same effect as a handwritten one.`,
  },
  {
    key: "minor",
    title: "Parent or guardian consent for a participant under 18",
    audience: "minor",
    description:
      "Required for any player under 18, signed by a parent or guardian.",
    body: `PARENT OR GUARDIAN CONSENT AND WAIVER
{{tournament_name}} — {{dates}} — {{venue}}

I am the parent or legal guardian of the participant named below, who is under
18 years of age.

1. I have read the Participant Waiver and Release of Liability for this event. I
   accept every term of it on my child's behalf and on my own behalf.

2. ASSUMPTION OF RISK. I understand ultimate carries risks including sprains,
   fractures, concussion and other head injury, heat illness, dehydration,
   lightning exposure, collision, permanent disability, and death. I consent to
   my child participating with full knowledge of those risks.

3. MEDICAL AUTHORISATION. I authorise event staff, athletic trainers, and
   emergency medical personnel to provide, arrange, and consent to emergency
   medical treatment for my child if I cannot be reached. I accept
   responsibility for the cost of that treatment.

   Known allergies, conditions, or medications: ____________________________
   Insurance provider and policy number: __________________________________
   Emergency contact name and phone: ______________________________________

4. SUPERVISION. I understand my child must be under the supervision of a
   designated, background-checked chaperone at this event, and that the
   tournament is not a childcare service.

5. MEDIA. I consent to photographs and video of my child being used for
   non-commercial promotion of the event and the sport. If I do not agree, I
   will notify the tournament director in writing.

By typing my name below I am signing this document electronically as parent or
legal guardian, and I agree it has the same effect as a handwritten signature.`,
  },
  {
    key: "team",
    title: "Team agreement",
    audience: "team",
    description:
      "Signed once by the captain. Covers rosters, payment, conduct, and drops.",
    body: `TEAM AGREEMENT
{{tournament_name}} — {{dates}} — {{venue}}

Signed by the team captain or an authorised representative.

1. ROSTER AND ELIGIBILITY
I confirm every player on our roster meets the eligibility rules for this event.
I will submit our final roster by {{roster_deadline}}. I understand that a
player who is not on the submitted roster is not covered by event insurance and
may not play.

2. WAIVERS AND MEMBERSHIP
I confirm every rostered player has signed the Participant Waiver, and where the
event is sanctioned, holds current membership. Players under 18 have a signed
parent or guardian consent on file.

3. PAYMENT
Our bid fee of {{bid_fee}} is due by {{payment_deadline}}. I understand an
unpaid spot may be released to the waitlist after that date.

4. REFUNDS AND CANCELLATION
I have read the refund policy for this event and accept it, including what
happens if play is cancelled or shortened by weather.

5. CONDUCT
Our team will play by the rules in force, uphold the Spirit of the Game, follow
instructions from event staff, and leave our sideline and the fields clean. I
understand our team may be removed for dangerous or abusive conduct, without
refund.

6. WITHDRAWAL
If we must withdraw, I will notify the tournament director as soon as we know.
Late withdrawal damages the event for every other team and may affect our
acceptance to future editions.

By typing my name below I am signing on behalf of the team named above and
confirming I am authorised to do so.`,
  },
  {
    key: "volunteer",
    title: "Volunteer agreement",
    audience: "volunteer",
    description: "For non-playing volunteers and event staff.",
    body: `VOLUNTEER AGREEMENT
{{tournament_name}} — {{dates}} — {{venue}}

1. I am volunteering at this event of my own free will and without expectation
   of payment.

2. I understand my role may involve outdoor work, lifting, and time in sun,
   heat, cold, or rain, and I accept the ordinary risks of that work.

3. I will only operate a utility vehicle or cart if I am at least 16, hold a
   valid licence, and have been shown how to use it. I will not operate any
   vehicle or equipment under the influence of alcohol or drugs.

4. I release {{organizer}} and {{venue_owner}} from liability for injury or
   property loss arising from my volunteering, except for gross negligence,
   recklessness, or intentional misconduct.

5. I will follow instructions from the tournament director and event staff, and
   report any injury, hazard, or incident immediately.

By typing my name below I am signing this document electronically.`,
  },
];

export function templateByKey(key: string) {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}

/** Fill `{{placeholders}}` from the tournament record. */
export function fillTemplate(
  body: string,
  vars: Record<string, string | null | undefined>,
) {
  return body.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v ? String(v) : `[${key.replace(/_/g, " ")}]`;
  });
}

export const LEGAL_DISCLAIMER =
  "These templates are a starting point, not legal advice. Your school, city, " +
  "or field provider will often require specific language — check with them, " +
  "and have someone qualified review anything you rely on.";
