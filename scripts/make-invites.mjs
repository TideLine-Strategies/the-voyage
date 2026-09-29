import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";

const [baseUrl, sqlPath, linksPath] = process.argv.slice(2);
if (!baseUrl || !sqlPath || !linksPath) throw new Error("Usage: node scripts/make-invites.mjs https://site private-invites.sql private-links.json");
const members = [
  { id: "QS", email: "q.stewart@tidelinestrats.com" },
  { id: "CK", email: "c.kundsen@tidelinestrats.com" },
];
const quote = value => `'${value.replaceAll("'", "''")}'`;
const expires = Date.now() + 30 * 86400000;
const links = {};
const sql = members.map(member => {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  links[member.email] = `${baseUrl.replace(/\/$/, "")}/invite/${token}`;
  return `INSERT INTO invites (token_hash,member_id,email,expires_at) VALUES (${quote(hash)},${quote(member.id)},${quote(member.email)},${expires});`;
});
fs.writeFileSync(sqlPath, `${sql.join("\n")}\n`, { mode: 0o600 });
fs.writeFileSync(linksPath, `${JSON.stringify(links)}\n`, { mode: 0o600 });
console.log("Created two private one-time invitation links.");
