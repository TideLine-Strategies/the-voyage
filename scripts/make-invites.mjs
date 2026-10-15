import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";

// Keep the roster outside Git. Example: [{"id":"MJ","name":"Mary","email":"...","role":"guest"}]
const [baseUrl, rosterPath, sqlPath, linksPath, onlyEmail] = process.argv.slice(2);
if (!baseUrl || !rosterPath || !sqlPath || !linksPath) {
  throw new Error("Usage: node scripts/make-invites.mjs https://site private-roster.json private-invites.sql private-links.json [member-email]");
}
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const members = JSON.parse(fs.readFileSync(rosterPath, "utf8"));
if (!Array.isArray(members)) throw new Error("Expected a private roster array");
const selected = onlyEmail ? members.filter(member => member.email?.toLowerCase() === onlyEmail.toLowerCase()) : members;
if (!selected.length) throw new Error("No matching member");
const expires = Date.now() + 30 * 86400000;
const links = {};
const sql = selected.map(member => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(member.id) || !member.name || !/^[^@\s]+@[^@\s]+$/.test(member.email) || !["edit", "guest"].includes(member.role)) throw new Error("Invalid roster member");
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  links[member.email] = `${baseUrl.replace(/\/$/, "")}/invite/${token}`;
  return `INSERT INTO members (id,name,email,role,active) VALUES (${quote(member.id)},${quote(member.name)},${quote(member.email)},${quote(member.role)},1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,role=excluded.role,active=1;\nINSERT INTO invites (token_hash,member_id,email,expires_at) VALUES (${quote(hash)},${quote(member.id)},${quote(member.email)},${expires});`;
});
fs.writeFileSync(sqlPath, `${sql.join("\n")}\n`, { mode: 0o600, flag: "wx" });
fs.writeFileSync(linksPath, `${JSON.stringify(links)}\n`, { mode: 0o600, flag: "wx" });
console.log(`Created ${selected.length} private one-time invitation link(s).`);
