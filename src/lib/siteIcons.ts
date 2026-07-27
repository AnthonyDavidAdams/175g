/**
 * Site-map marker kinds.
 *
 * Line icons and type marks, no emoji — they render consistently at any size,
 * print legibly on the paper site map a volunteer actually carries, and don't
 * shift between platforms.
 */

export type SiteIcon = {
  kind: string;
  label: string;
  /** Inner SVG for a 24x24 stroke-based icon, or null when `mark` is used. */
  svg: string | null;
  /** Short type mark used instead of a glyph, e.g. "P" for parking. */
  mark?: string;
  hint: string;
};

export const SITE_ICONS: SiteIcon[] = [
  {
    kind: "water",
    label: "Water",
    svg: '<path d="M12 3s6 6.6 6 10.5a6 6 0 0 1-12 0C6 9.6 12 3 12 3z"/>',
    hint: "One station per two fields, minimum. Refill on a set schedule — by the time someone reports an empty cooler it has been empty twenty minutes.",
  },
  {
    kind: "trainer",
    label: "Trainer",
    svg: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 8v8M8 12h8"/>',
    hint: "Put the athletic trainer somewhere shaded, mark it here so people can find it, and print the phone number or radio channel for reaching them on every scorekeeper's clipboard.",
  },
  {
    kind: "hq",
    label: "HQ",
    svg: '<path d="M5 21V3M5 3h12l-2.2 3.8L17 11H5"/>',
    hint: "Where the central scoreboard, site map, team check-in, and lost property live. One obvious place people can always find you.",
  },
  {
    kind: "parking",
    label: "Parking",
    svg: null,
    mark: "P",
    hint: "Twenty travelling teams means 60 to 100 cars. Check whether weekend parking needs a permit, and put this map in the week-of email — parking is the number one day-of question.",
  },
  {
    kind: "toilets",
    label: "Toilets",
    svg: null,
    mark: "WC",
    hint: "Roughly one portable toilet per 75 people. Book about three weeks out, and check the delivery truck can actually reach the spot you picked.",
  },
  {
    kind: "trash",
    label: "Trash",
    svg: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    hint: "Bins, bags, and somewhere for it all to end up. Leaving the site clean is what gets you the fields again next year.",
  },
  {
    kind: "food",
    label: "Food",
    svg: '<path d="M7 3v7M4.8 3v3.6a2.2 2.2 0 0 0 4.4 0V3M7 10v11M17.2 3c-1.6 2-2.2 4.2-2.2 6.3h4.4C19.4 7.2 18.8 5 17.2 3zM17.2 9.3V21"/>',
    hint: "Prepackaged team bundles are safer and less wasteful than shared bulk food. Any food vendor needs their own permit and insurance naming you.",
  },
  {
    kind: "medical",
    label: "First aid",
    svg: '<path d="M12 4v16M4 12h16"/>',
    hint: "First aid supplies, and the nearest AED. Also worth marking the route an ambulance would drive in, and which gate would need unlocking.",
  },
  {
    kind: "tent",
    label: "Tent",
    svg: '<path d="M12 3.5 2.5 20.5h19L12 3.5zM12 3.5v17"/>',
    hint: "Every tent must be staked or weighted — including the ones teams bring themselves. Wind is a safety issue, not just a playing condition.",
  },
  {
    kind: "entrance",
    label: "Entrance",
    svg: '<path d="M14 3H5v18h9M18 12H9M15 8.5 18.5 12 15 15.5"/>',
    hint: "The way in. Note which gate is unlocked on the day and who has the key.",
  },
  {
    kind: "other",
    label: "Other",
    svg: '<circle cx="12" cy="12" r="8"/>',
    hint: "Anything else people need to find. Rename it to whatever it actually is.",
  },
];

export function iconByKind(kind: string) {
  return SITE_ICONS.find((i) => i.kind === kind) ?? SITE_ICONS[SITE_ICONS.length - 1];
}

/** A complete <svg> string for a kind, for both the palette and map markers. */
export function iconSvg(kind: string, size = 16, color = "#08090b") {
  const icon = iconByKind(kind);
  if (icon.svg) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
      stroke="${color}" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round">${icon.svg}</svg>`;
  }
  const fontSize = icon.mark && icon.mark.length > 1 ? size * 0.5 : size * 0.72;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">
    <text x="12" y="12" text-anchor="middle" dominant-baseline="central"
      font-family="ui-monospace, monospace" font-weight="700"
      font-size="${(fontSize / size) * 24}" fill="${color}">${icon.mark}</text>
  </svg>`;
}

/**
 * A map pin: a circular badge carrying the icon at a legible size, with the
 * label captioned beneath it. Reads as an icon on the map rather than a text
 * chip, and stays recognisable when the site map is printed in greyscale.
 */
export function mapPin(kind: string, label: string, active: boolean) {
  const bg = active ? "#d4fe4f" : "#ffffff";
  const ring = active ? "#08090b" : "#00000040";
  const ink = "#08090b";
  return `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;
    align-items:center;gap:2px;cursor:pointer;pointer-events:auto;">
    <div style="display:flex;align-items:center;justify-content:center;
      width:30px;height:30px;border-radius:50% 50% 50% 4px;
      transform:rotate(-45deg);background:${bg};
      border:2px solid ${ring};
      box-shadow:0 2px 6px rgba(0,0,0,.45);">
      <div style="transform:rotate(45deg);display:flex;">
        ${iconSvg(kind, 16, ink)}
      </div>
    </div>
    <div style="font:600 10px ui-monospace,monospace;color:#08090b;
      background:${active ? "#d4fe4f" : "#ffffffdd"};padding:1px 5px;border-radius:3px;
      white-space:nowrap;">${label}</div>
  </div>`;
}
