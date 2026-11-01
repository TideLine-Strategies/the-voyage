#!/usr/bin/env node
// Summarize a Voyage meeting note with the agent you are signed in to on this computer.
//
//   1. In The Voyage, open a note and click "Copy prompt".
//   2. Run:  node scripts/voyage-summarize.mjs          (add --agent claude or --agent codex to force one)
//   3. Back in The Voyage, click "Paste summary".
//
// The prompt never leaves this machine except through your own Claude Code or Codex login.
// No API key is used or stored, and nothing here talks to the Worker.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const SENTINEL = "[voyage-note-summary v1]";
const TIMEOUT_MS = 240000;

// Only text the app copied is sent to an agent, so a stray clipboard (a password, say) is never forwarded.
export function isVoyagePrompt(text) {
  return typeof text === "string" && text.trimStart().startsWith(SENTINEL);
}

// Pull the JSON object out of an agent reply, tolerating code fences and chatter around it.
export function extractJson(text) {
  const cleaned = String(text ?? "").replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The agent's reply had no JSON in it.");
  let data;
  try { data = JSON.parse(cleaned.slice(start, end + 1)); }
  catch { throw new Error("The agent's reply was not valid JSON."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The agent's reply was not a JSON object.");
  return data;
}

// How to call each agent. The prompt goes in on stdin, so quoting never matters.
export function agentCommand(agent, outFile) {
  if (agent === "claude") {
    // --tools "" switches every tool off; the run also happens in an empty temp folder.
    return { args: ["-p", "--output-format", "text", "--tools", "", "--no-session-persistence"], outFile: null };
  }
  if (agent === "codex") {
    return { args: ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--output-last-message", outFile, "-"], outFile };
  }
  throw new Error(`Unknown agent "${agent}". Use claude or codex.`);
}

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...options });
}

function readClipboard() {
  let r;
  if (process.platform === "win32") {
    r = run("powershell", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Get-Clipboard -Raw"]);
  } else if (process.platform === "darwin") {
    r = run("pbpaste", []);
  } else {
    r = run("sh", ["-c", "wl-paste 2>/dev/null || xclip -selection clipboard -o 2>/dev/null || xsel -b -o"]);
  }
  if (r.error || r.status !== 0) throw new Error("Could not read the clipboard.");
  return r.stdout ?? "";
}

function writeClipboard(text) {
  let r;
  if (process.platform === "win32") {
    r = run("powershell", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); Set-Clipboard -Value ([Console]::In.ReadToEnd())"], { input: text });
  } else if (process.platform === "darwin") {
    r = run("pbcopy", [], { input: text });
  } else {
    r = run("sh", ["-c", "wl-copy 2>/dev/null || xclip -selection clipboard 2>/dev/null || xsel -b -i"], { input: text });
  }
  if (r.error || r.status !== 0) throw new Error("Could not write to the clipboard.");
}

function onPath(name) {
  const r = process.platform === "win32" ? run("where", [name]) : run("which", [name]);
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).map(s => s.trim()).find(Boolean) || null;
}

// Claude Code's installer can leave its folder off PATH on Windows, so also look in its default spot.
function findClaude() {
  const found = onPath("claude");
  if (found) return found;
  const home = homedir();
  return [join(home, ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude"),
          join(home, ".claude", "local", "claude")].find(existsSync) || null;
}

function findAgent(want) {
  const wanted = want || process.env.VOYAGE_AGENT || "";
  if (wanted && !["claude", "codex"].includes(wanted)) throw new Error(`Unknown agent "${wanted}". Use claude or codex.`);
  const claude = wanted === "codex" ? null : findClaude();
  const codex = wanted === "claude" ? null : onPath("codex");
  if (wanted === "claude" && !claude) throw new Error("Claude Code was not found. Install it and run `claude` once to sign in.");
  if (wanted === "codex" && !codex) throw new Error("Codex was not found. Install it and run `codex login` to sign in.");
  if (claude) return { agent: "claude", path: claude };
  if (codex) return { agent: "codex", path: codex };
  throw new Error("Neither Claude Code nor Codex was found. Install one and sign in with your own plan.");
}

function runAgent({ agent, path }, prompt) {
  const work = mkdtempSync(join(tmpdir(), "voyage-summarize-"));
  try {
    const outFile = join(work, "reply.txt");
    const { args, outFile: out } = agentCommand(agent, outFile);
    // .cmd/.ps1 shims (npm installs on Windows) need a shell; native executables do not.
    const needsShell = process.platform === "win32" && !/\.exe$/i.test(path);
    const r = run(needsShell ? `"${path}"` : path, args, { input: prompt, cwd: work, timeout: TIMEOUT_MS, shell: needsShell });
    if (r.error && r.error.code === "ETIMEDOUT") throw new Error("The agent took too long. Try a shorter transcript.");
    if (r.error) throw new Error(`Could not start ${agent}: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`${agent} failed (exit ${r.status}). ${(r.stderr || r.stdout || "").trim().split("\n").slice(-4).join(" ")}`);
    return out && existsSync(out) ? readFileSync(out, "utf8") : r.stdout;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const opts = { agent: "", file: "", print: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--agent") opts.agent = argv[++i] || "";
    else if (a === "--file") opts.file = argv[++i] || "";
    else if (a === "--print") opts.print = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else throw new Error(`Unknown option ${a}`);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log("Usage: node scripts/voyage-summarize.mjs [--agent claude|codex] [--file prompt.txt] [--print]\nReads the prompt copied from The Voyage, asks your signed-in agent, and copies the summary back to the clipboard.");
    return;
  }
  const prompt = opts.file ? readFileSync(opts.file, "utf8") : readClipboard();
  if (!isVoyagePrompt(prompt)) {
    throw new Error('The clipboard does not have a Voyage prompt. In The Voyage, open the note and click "Copy prompt" first.');
  }
  const chosen = findAgent(opts.agent);
  console.log(`Asking ${chosen.agent} (your own login)... this takes 20 to 90 seconds.`);
  const summary = extractJson(runAgent(chosen, prompt));
  const json = JSON.stringify(summary, null, 2);
  const points = Array.isArray(summary.keyPoints) ? summary.keyPoints.length : 0;
  const actions = Array.isArray(summary.actions) ? summary.actions.length : 0;
  if (opts.print) { console.log(json); return; }
  writeClipboard(json);
  console.log(`Done: ${points} key points, ${actions} action items. The summary is on your clipboard.\nGo back to The Voyage and click "Paste summary".`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (e) { console.error(`\n${e.message}`); process.exitCode = 1; }
}
