// Minimal iCalendar (RFC 5545) reader for a member's outside calendar: one-off and repeating
// events, time zones, all-day events, exceptions, and cancellations. Returns events inside a window.

const DAY_MS = 86400000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Offset (ms) of a time zone from UTC at a given instant.
function zoneOffset(instant, timeZone) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - instant;
  } catch { return 0; }
}

// Wall-clock time in a time zone -> UTC instant.
export function zonedToUtc(y, mo, d, h, mi, s, timeZone) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  const first = guess - zoneOffset(guess, timeZone);
  return guess - zoneOffset(first, timeZone);
}

// Parse a DATE or DATE-TIME property value.
function parseWhen(value, params, fallbackZone) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value || "");
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
  if (!m[4] || params.VALUE === "DATE") return { allDay: true, date: `${m[1]}-${m[2]}-${m[3]}`, ms: Date.UTC(y, mo, d) };
  const [h, mi, s] = [+m[4], +m[5], +(m[6] || 0)];
  if (m[7]) return { allDay: false, ms: Date.UTC(y, mo, d, h, mi, s) };
  return { allDay: false, ms: zonedToUtc(y, mo, d, h, mi, s, params.TZID || fallbackZone), zone: params.TZID || fallbackZone, wall: [y, mo, d, h, mi, s] };
}

function parseDuration(text) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(text || "");
  if (!m) return null;
  return (m[1] === "-" ? -1 : 1) * ((+(m[2] || 0)) * 7 * DAY_MS + (+(m[3] || 0)) * DAY_MS + (+(m[4] || 0)) * 3600000 + (+(m[5] || 0)) * 60000 + (+(m[6] || 0)) * 1000);
}

const unescape = text => String(text || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

function readEvents(text) {
  const lines = String(text).replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { current = { props: {} }; continue; }
    if (line === "END:VEVENT") { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [name, ...rawParams] = line.slice(0, colon).split(";");
    const params = Object.fromEntries(rawParams.map(p => { const i = p.indexOf("="); return [p.slice(0, i).toUpperCase(), p.slice(i + 1).replace(/^"|"$/g, "")]; }));
    const key = name.toUpperCase();
    (current.props[key] ||= []).push({ value: line.slice(colon + 1), params });
  }
  return events;
}

// Occurrence start dates for a repeating event, as wall-clock [y, mo, d] steps from the first start.
function* repeat(rule, first, windowEnd) {
  const r = Object.fromEntries(rule.split(";").map(part => part.split("=")));
  const freq = r.FREQ, interval = Math.max(1, +(r.INTERVAL || 1)), count = r.COUNT ? +r.COUNT : Infinity;
  const until = r.UNTIL ? parseWhen(r.UNTIL, {}, "UTC")?.ms ?? Infinity : Infinity;
  const byDay = r.BYDAY ? r.BYDAY.split(",").map(d => WEEKDAYS.indexOf(d.slice(-2))).filter(d => d >= 0) : null;
  const base = new Date(Date.UTC(first[0], first[1], first[2]));
  let emitted = 0;
  for (let step = 0; step < 3000 && emitted < count; step++) {
    let days;
    if (freq === "DAILY") days = [new Date(base.getTime() + step * interval * DAY_MS)];
    else if (freq === "WEEKLY") {
      const weekStart = new Date(base.getTime() + (step * interval * 7 - base.getUTCDay()) * DAY_MS);
      days = (byDay || [base.getUTCDay()]).slice().sort((a, b) => a - b).map(wd => new Date(weekStart.getTime() + wd * DAY_MS)).filter(d => d >= base);
    } else if (freq === "MONTHLY") days = [new Date(Date.UTC(first[0], first[1] + step * interval, first[2]))].filter(d => d.getUTCDate() === first[2]);
    else if (freq === "YEARLY") days = [new Date(Date.UTC(first[0] + step * interval, first[1], first[2]))].filter(d => d.getUTCDate() === first[2]);
    else return;
    for (const day of days) {
      if (day.getTime() > windowEnd || day.getTime() > until || emitted >= count) return;
      emitted++;
      yield [day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()];
    }
  }
}

// Events overlapping [from, to] (UTC ms), at most `limit`, sorted by start.
export function eventsFromIcs(text, { from, to, fallbackZone = "America/Chicago", limit = 1500 }) {
  const out = [];
  const overrides = new Set();
  const raw = readEvents(text);
  for (const event of raw) if (event.props["RECURRENCE-ID"]) {
    const rid = event.props["RECURRENCE-ID"][0];
    const when = parseWhen(rid.value, rid.params, fallbackZone);
    if (when) overrides.add(`${event.props.UID?.[0]?.value}|${when.ms}`);
  }
  for (const event of raw) {
    const p = event.props, get = key => p[key]?.[0];
    if ((get("STATUS")?.value || "").toUpperCase() === "CANCELLED") continue;
    const start = get("DTSTART") && parseWhen(get("DTSTART").value, get("DTSTART").params, fallbackZone);
    if (!start) continue;
    const endProp = get("DTEND") && parseWhen(get("DTEND").value, get("DTEND").params, fallbackZone);
    const length = endProp ? endProp.ms - start.ms : parseDuration(get("DURATION")?.value) ?? (start.allDay ? DAY_MS : 3600000);
    const title = unescape(get("SUMMARY")?.value || "Busy").slice(0, 200);
    const busy = (get("TRANSP")?.value || "OPAQUE").toUpperCase() !== "TRANSPARENT";
    const uid = get("UID")?.value || "";
    const excluded = new Set((p.EXDATE || []).flatMap(x => x.value.split(",").map(v => parseWhen(v, x.params, fallbackZone)?.ms)));
    const push = startMs => {
      const endMs = startMs + Math.max(0, length);
      if (endMs < from || startMs > to) return;
      if (start.allDay) {
        const dates = [];
        for (let t = startMs; t < Math.max(endMs, startMs + DAY_MS); t += DAY_MS) dates.push(new Date(t).toISOString().slice(0, 10));
        out.push({ id: `${uid}|${startMs}`, title, allDay: true, date: dates[0], endDate: dates[dates.length - 1], busy });
      } else out.push({ id: `${uid}|${startMs}`, title, allDay: false, start: startMs, end: endMs, busy });
    };
    const rule = get("RRULE")?.value;
    if (!rule || get("RECURRENCE-ID")) { push(start.ms); continue; }
    const wall = start.wall || (() => { const d = new Date(start.ms); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]; })();
    for (const [y, mo, d] of repeat(rule, wall, to)) {
      const occurrence = start.allDay ? Date.UTC(y, mo, d)
        : start.zone ? zonedToUtc(y, mo, d, wall[3], wall[4], wall[5], start.zone)
        : Date.UTC(y, mo, d, wall[3], wall[4], wall[5]);
      if (excluded.has(occurrence) || overrides.has(`${uid}|${occurrence}`)) continue;
      push(occurrence);
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => (a.start ?? Date.parse(a.date)) - (b.start ?? Date.parse(b.date))).slice(0, limit);
}

// Only private calendar addresses from the big providers are accepted, over https.
export function calendarAddress(input) {
  let text = String(input || "").trim().replace(/^webcals?:\/\//i, "https://");
  let url;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const allowed = host === "calendar.google.com" || host === "outlook.office365.com" || host === "outlook.live.com"
    || host === "outlook.office.com" || /^p\d+-caldav\.icloud\.com$/.test(host) || host === "caldav.icloud.com";
  return allowed ? url.toString() : null;
}
