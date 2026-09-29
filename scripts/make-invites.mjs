import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { MEMBERS as members } from "../src/members.js";

const [baseUrl, sqlPath, linksPath, onlyEmail] = process.argv.slice(2);
if (!baseUrl || !sqlPath || !linksPath) throw new Error("Usage: node scripts/make-invites.mjs https://site private-invites.sql private-links.json [member-email]");
const quote = value => `'${value.replaceAll("'", "''")}'`;
const expires = Date.now() + 30 * 86400000;
const links = {};
const selected = onlyEmail ? members.filter(member => member.email.toLowerCase() === onlyEmail.toLowerCase()) : members;
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
