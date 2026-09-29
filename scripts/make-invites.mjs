import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";

const [baseUrl, sqlPath, linksPath, onlyEmail] = process.argv.slice(2);
if (!baseUrl || !sqlPath || !linksPath) throw new Error("Usage: node scripts/make-invites.mjs https://site private-invites.sql private-links.json [member-email]");
const members = [
  { id: "QS", email: "q.stewart@tidelinestrats.com" },
  { id: "CK", email: "c.knudsen@tidelinestrats.com" },
];
const quote = value => `'${value.replaceAll("'", "''")}'`;
const expires = Date.now() + 30 * 86400000;
const links = {};
const selected = onlyEmail ? members.filter(member => member.email === onlyEmail) : members;
if (!selected.length) throw new Error("Unknown member email");
const sql = selected.map(member => {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  links[member.email] = `${baseUrl.replace(/\/$/, "")}/invite/${token}`;
  return `INSERT INTO invites (token_hash,member_id,email,expires_at) VALUES (${quote(hash)},${quote(member.id)},${quote(member.email)},${expires});`;
});
fs.writeFileSync(sqlPath, `${sql.join("\n")}\n`, { mode: 0o600 });
fs.writeFileSync(linksPath, `${JSON.stringify(links)}\n`, { mode: 0o600 });
console.log(`Created ${selected.length} private one-time invitation link(s).`);
