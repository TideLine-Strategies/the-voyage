import test from "node:test";
import assert from "node:assert/strict";
import { calendarAddress, eventsFromIcs, zonedToUtc } from "../src/ical.js";

const ics = body => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
const window = { from: Date.UTC(2026, 9, 1), to: Date.UTC(2026, 10, 1) };

test("time zones, UTC, all-day, folded lines, and cancellations", () => {
  const events = eventsFromIcs(ics([
    "BEGIN:VEVENT", "UID:a", "DTSTART;TZID=America/Chicago:20261007T143000", "DTEND;TZID=America/Chicago:20261007T153000", "SUMMARY:Dentist\, then gym", "END:VEVENT",
    "BEGIN:VEVENT", "UID:b", "DTSTART:20261008T150000Z", "DURATION:PT30M", "SUMMARY:Call with a very long", " title that wraps", "END:VEVENT",
    "BEGIN:VEVENT", "UID:c", "DTSTART;VALUE=DATE:20261010", "DTEND;VALUE=DATE:20261012", "SUMMARY:Trade show", "TRANSP:TRANSPARENT", "END:VEVENT",
    "BEGIN:VEVENT", "UID:d", "DTSTART:20261009T150000Z", "SUMMARY:Cancelled", "STATUS:CANCELLED", "END:VEVENT",
    "BEGIN:VEVENT", "UID:e", "DTSTART:20250101T150000Z", "SUMMARY:Outside window", "END:VEVENT",
  ].join("\r\n")), window);
  assert.deepEqual(events.map(e => e.title), ["Dentist, then gym", "Call with a very longtitle that wraps", "Trade show"]);
  assert.equal(events[0].start, Date.UTC(2026, 9, 7, 19, 30), "2:30pm Chicago is 19:30 UTC in October");
  assert.equal(events[0].end - events[0].start, 3600000);
  assert.equal(events[1].end - events[1].start, 1800000);
  assert.deepEqual([events[2].allDay, events[2].date, events[2].endDate, events[2].busy], [true, "2026-10-10", "2026-10-11", false]);
});

test("repeating events with exceptions and moved occurrences", () => {
  const events = eventsFromIcs(ics([
    "BEGIN:VEVENT", "UID:weekly", "DTSTART;TZID=America/Chicago:20260929T090000", "DTEND;TZID=America/Chicago:20260929T093000",
    "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261020T235959Z", "EXDATE;TZID=America/Chicago:20261006T090000", "SUMMARY:Standup", "END:VEVENT",
    "BEGIN:VEVENT", "UID:weekly", "RECURRENCE-ID;TZID=America/Chicago:20261008T090000", "DTSTART;TZID=America/Chicago:20261008T110000", "DTEND;TZID=America/Chicago:20261008T113000", "SUMMARY:Standup (moved)", "END:VEVENT",
    "BEGIN:VEVENT", "UID:monthly", "DTSTART;VALUE=DATE:20260915", "RRULE:FREQ=MONTHLY;COUNT=3", "SUMMARY:Rent", "END:VEVENT",
  ].join("\r\n")), window);
  const standups = events.filter(e => e.title.startsWith("Standup")).map(e => new Date(e.start - 5 * 3600000).toISOString().slice(0, 16));
  assert.deepEqual(standups, ["2026-10-01T09:00", "2026-10-08T11:00", "2026-10-13T09:00", "2026-10-15T09:00", "2026-10-20T09:00"]);
  assert.deepEqual(events.filter(e => e.title === "Rent").map(e => e.date), ["2026-10-15"]);
});

test("daylight saving is handled by the event's own time zone", () => {
  assert.equal(zonedToUtc(2026, 10, 2, 9, 0, 0, "America/Chicago"), Date.UTC(2026, 10, 2, 15, 0), "after DST ends Chicago is UTC-6");
  assert.equal(zonedToUtc(2026, 6, 1, 9, 0, 0, "America/Chicago"), Date.UTC(2026, 6, 1, 14, 0), "summer is UTC-5");
});

test("only private https or webcal addresses from Google, Outlook, or Apple are accepted", () => {
  assert.equal(calendarAddress("webcal://p42-caldav.icloud.com/published/2/abc"), "https://p42-caldav.icloud.com/published/2/abc");
  assert.ok(calendarAddress("https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics"));
  assert.ok(calendarAddress("https://outlook.office365.com/owa/calendar/abc/reachcalendar.ics"));
  assert.equal(calendarAddress("http://calendar.google.com/x.ics"), null);
  assert.equal(calendarAddress("https://evil.example/calendar.google.com.ics"), null);
  assert.equal(calendarAddress("https://calendar.google.com.evil.example/x.ics"), null);
  assert.equal(calendarAddress("https://user:pw@calendar.google.com/x.ics"), null);
  assert.equal(calendarAddress("not a url"), null);
});
