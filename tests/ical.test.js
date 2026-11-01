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

const series = (start, rule, extra = []) => ics([
  'BEGIN:VEVENT', 'UID:series', start, `RRULE:${rule}`, ...extra, 'END:VEVENT',
].join('\r\n'));
const starts = events => events.map(event => event.allDay ? event.date : new Date(event.start).toISOString());

test('daily series older than the former 3000-period horizon still appear, with exact COUNT and INTERVAL', () => {
  const start = 'DTSTART:20000101T090000Z';
  const range = { from: Date.UTC(2026, 10, 1), to: Date.UTC(2026, 10, 3, 23) };
  const elapsed = (Date.UTC(2026, 10, 1) - Date.UTC(2000, 0, 1)) / 86400000;
  assert.deepEqual(starts(eventsFromIcs(series(start, 'FREQ=DAILY'), range)), [
    '2026-11-01T09:00:00.000Z', '2026-11-02T09:00:00.000Z', '2026-11-03T09:00:00.000Z',
  ]);
  assert.equal(eventsFromIcs(series(start, `FREQ=DAILY;COUNT=${elapsed}`), range).length, 0);
  assert.deepEqual(starts(eventsFromIcs(series(start, `FREQ=DAILY;COUNT=${elapsed + 1}`), range)), ['2026-11-01T09:00:00.000Z']);
  const expected = Array.from({ length: 3 }, (_, i) => i).filter(i => (elapsed + i) % 3 === 0).map(i => `2026-11-0${i + 1}T09:00:00.000Z`);
  assert.deepEqual(starts(eventsFromIcs(series(start, 'FREQ=DAILY;INTERVAL=3'), range)), expected);
});

test('monthly ordinal weekdays include positive, negative, fifth and multiple weekdays without duplicates', () => {
  assert.deepEqual(starts(eventsFromIcs(series('DTSTART;VALUE=DATE:20260914', 'FREQ=MONTHLY;BYDAY=2MO;COUNT=3'), {
    from: Date.UTC(2026, 8, 1), to: Date.UTC(2026, 11, 31),
  })), ['2026-09-14', '2026-10-12', '2026-11-09']);
  assert.deepEqual(starts(eventsFromIcs(series('DTSTART;VALUE=DATE:20260126', 'FREQ=MONTHLY;BYDAY=-1MO;COUNT=3'), {
    from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 3, 1),
  })), ['2026-01-26', '2026-02-23', '2026-03-30']);
  assert.deepEqual(starts(eventsFromIcs(series('DTSTART;VALUE=DATE:20260330', 'FREQ=MONTHLY;BYDAY=5MO;COUNT=3'), {
    from: Date.UTC(2026, 2, 1), to: Date.UTC(2026, 9, 1),
  })), ['2026-03-30', '2026-06-29', '2026-08-31']);
  const mondays = eventsFromIcs(series('DTSTART;VALUE=DATE:20261005', 'FREQ=MONTHLY;BYDAY=MO,2MO,MO'), window);
  assert.deepEqual(starts(mondays), ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
});

test('weekly periods default to Monday, respect WKST, and count only dates on or after DTSTART', () => {
  const range = { from: Date.UTC(1997, 7, 1), to: Date.UTC(1997, 8, 1) };
  const start = 'DTSTART;VALUE=DATE:19970805';
  assert.deepEqual(starts(eventsFromIcs(series(start, 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU'), range)), [
    '1997-08-05', '1997-08-10', '1997-08-19', '1997-08-24',
  ]);
  assert.deepEqual(starts(eventsFromIcs(series(start, 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU'), range)), [
    '1997-08-05', '1997-08-17', '1997-08-19', '1997-08-31',
  ]);
});

test('UNTIL uses the actual occurrence instant, including a local date on the next UTC day', () => {
  const range = { from: Date.UTC(2026, 9, 1), to: Date.UTC(2026, 9, 4) };
  const start = 'DTSTART;TZID=America/Chicago:20261001T233000';
  assert.deepEqual(starts(eventsFromIcs(series(start, 'FREQ=DAILY;UNTIL=20261003T042959Z'), range)), ['2026-10-02T04:30:00.000Z']);
  assert.deepEqual(starts(eventsFromIcs(series(start, 'FREQ=DAILY;UNTIL=20261003T043000Z'), range)), [
    '2026-10-02T04:30:00.000Z', '2026-10-03T04:30:00.000Z',
  ]);
  assert.deepEqual(starts(eventsFromIcs(series('DTSTART;TZID=Pacific/Kiritimati:20261002T090000', 'FREQ=DAILY'), {
    from: Date.UTC(2026, 9, 1, 18), to: Date.UTC(2026, 9, 1, 20),
  })), ['2026-10-01T19:00:00.000Z']);
});

test('old daily series preserve local time across DST, exclusions, moved and cancelled instances', () => {
  const feed = ics([
    'BEGIN:VEVENT', 'UID:old', 'DTSTART;TZID=America/Chicago:20000101T090000', 'RRULE:FREQ=DAILY;UNTIL=20261104T150000Z',
    'EXDATE;TZID=America/Chicago:20261102T090000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:old', 'RECURRENCE-ID;TZID=America/Chicago:20261103T090000',
    'DTSTART;TZID=America/Chicago:20261103T110000', 'SUMMARY:Moved', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:old', 'RECURRENCE-ID;TZID=America/Chicago:20261104T090000', 'STATUS:CANCELLED', 'END:VEVENT',
  ].join('\r\n'));
  assert.deepEqual(starts(eventsFromIcs(feed, { from: Date.UTC(2026, 9, 31), to: Date.UTC(2026, 10, 5) })), [
    '2026-10-31T14:00:00.000Z', '2026-11-01T15:00:00.000Z', '2026-11-03T17:00:00.000Z',
  ]);
  assert.equal(eventsFromIcs(series('DTSTART:20000101T090000Z', 'FREQ=DAILY;COUNT=2', ['EXDATE:20000101T090000Z']), {
    from: Date.UTC(2000, 0, 3), to: Date.UTC(2000, 0, 4),
  }).length, 0, 'EXDATE must not extend COUNT');
});

test('window seeking retains overlapping long events and does not roll invalid month/leap dates forward', () => {
  assert.equal(eventsFromIcs(series('DTSTART:20000101T090000Z', 'FREQ=MONTHLY', ['DURATION:P5D']), {
    from: Date.UTC(2026, 10, 4), to: Date.UTC(2026, 10, 4, 23),
  }).length, 1);
  assert.deepEqual(starts(eventsFromIcs(series('DTSTART;VALUE=DATE:20260131', 'FREQ=MONTHLY;COUNT=3'), {
    from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 5, 1),
  })), ['2026-01-31', '2026-03-31', '2026-05-31']);
  assert.deepEqual(starts(eventsFromIcs(series('DTSTART;VALUE=DATE:20960229', 'FREQ=YEARLY;COUNT=3'), {
    from: Date.UTC(2096, 0, 1), to: Date.UTC(2109, 0, 1),
  })), ['2096-02-29', '2104-02-29', '2108-02-29']);
});

test('seeking with finite counts agrees with complete expansion across calendar-pattern cycles', () => {
  const range = { from: Date.UTC(2026, 0, 2), to: Date.UTC(2026, 11, 31) };
  for (const [start, rule] of [
    ['DTSTART:20000101T090000Z', 'FREQ=DAILY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=5000'],
    ['DTSTART:20000104T090000Z', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH,SU;COUNT=4000'],
    ['DTSTART:16000110T090000Z', 'FREQ=MONTHLY;INTERVAL=2;BYDAY=2MO,-1FR;COUNT=6000'],
    ['DTSTART:16000229T090000Z', 'FREQ=YEARLY;COUNT=120'],
  ]) {
    const feed = series(start, rule);
    const full = eventsFromIcs(feed, { from: Date.UTC(1600, 0, 1), to: range.to, limit: 20000 })
      .filter(event => event.end >= range.from && event.start <= range.to);
    assert.deepEqual(eventsFromIcs(feed, range), full, rule);
  }
});

test('invalid intervals, counts and request windows terminate without fabricated occurrences', () => {
  for (const rule of ['FREQ=DAILY;INTERVAL=0', 'FREQ=DAILY;INTERVAL=NaN', 'FREQ=DAILY;COUNT=-1', 'FREQ=DAILY;COUNT=1.5']) {
    assert.deepEqual(eventsFromIcs(series('DTSTART:20261001T090000Z', rule), window), []);
  }
  assert.deepEqual(eventsFromIcs(series('DTSTART:20261001T090000Z', 'FREQ=DAILY'), { from: NaN, to: window.to }), []);
});
