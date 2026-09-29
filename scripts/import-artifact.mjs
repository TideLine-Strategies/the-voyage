import fs from "node:fs";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error("Usage: node scripts/import-artifact.mjs private-export.json private-import.sql");
const exportData = JSON.parse(fs.readFileSync(source, "utf8"));
const escape = value => `'${String(value).replaceAll("'", "''")}'`;
const lines = [];
const insert = (collection, id, data) => lines.push(`INSERT OR REPLACE INTO documents (collection,id,data_json,updated_at) VALUES (${escape(collection)},${escape(id)},${escape(JSON.stringify(data))},${Date.now()});`);
const now = Date.now();
const accountIds = new Map();
for (const [index, record] of exportData.opps.entries()) {
  const f = record.fields;
  const option = exportData.accountOptions[index];
  if (!option.label.startsWith(f.fName)) throw new Error(`Account order mismatch at ${index}`);
  const id = option.id;
  accountIds.set(f.fName, id);
  const kpi = exportData.kpis[index];
  const stageDays = Number.parseInt(kpi[1], 10);
  const touchDays = Number.parseInt(kpi[2], 10);
  const lastTouch = Number.isFinite(touchDays) ? new Date(now - touchDays * 86400000).toISOString().slice(0, 10) : "";
  const locations = record.locations.map((location, locIndex) => ({ id: `loc${locIndex + 1}`, ...location }));
  insert("opps", id, {
    name: f.fName, city: f.fCity, stage: record.stage,
    rank: f.fRank === "" ? null : Number(f.fRank), owner: f.fOwner,
    next: f.fNext ? { label: f.fNext, date: f.fDate, time: f.fTime } : null,
    verification: f.fVer, website: f.fWeb, linkedin: f.fLi,
    employees: f.fEmp, activeStudents: f.fAct, inactiveStudents: f.fInact,
    needs: "", notes: f.fNotes, bio: f.fBio, address: f.fAddr,
    address2: f.fAddr2, state: f.fState, zip: f.fZip,
    locations, lastTouch,
    stageTs: Number.isFinite(stageDays) ? now - stageDays * 86400000 : 0,
  });
}
const names = [...accountIds.keys()].sort((a, b) => b.length - a.length);
for (const [index, entry] of exportData.activity.entries()) {
  const name = names.find(name => entry.text.includes(name));
  insert("activity", `import-history-${index + 1}`, {
    ts: entry.ts, text: entry.text, by: entry.by === "Cody" ? "CK" : entry.by === "Quan" ? "QS" : "",
    oppId: name ? accountIds.get(name) : "",
  });
}
for (const [index, entry] of exportData.messages.entries()) {
  const [clock, period] = entry.time.split(" ");
  const [hour, minute] = clock.split(":").map(Number);
  const localHour = hour % 12 + (period === "PM" ? 12 : 0);
  const ts = Date.parse(`2026-09-29T${String(localHour + 5).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`) + index;
  insert("messages", `import-general-${index + 1}`, { ch: "general", by: entry.by === "Cody" ? "CK" : "QS", text: entry.text, ts, reactions: {} });
}
if (exportData.notes.length || exportData.activities.length) throw new Error("Notes or tasks need explicit import mapping");
fs.writeFileSync(destination, `${lines.join("\n")}\n`, { mode: 0o600 });
console.log(JSON.stringify({ accounts: exportData.opps.length, history: exportData.activity.length, messages: exportData.messages.length, notes: exportData.notes.length, tasks: exportData.activities.length }));
