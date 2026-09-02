#!/usr/bin/env node
// Local, machine-specific notes about what works and what doesn't in this
// OBS install. Stored outside the skill directory so it survives skill
// updates, which replace the skill folder wholesale.
//
// Usage:
//   node notes.mjs path
//   node notes.mjs read
//   node notes.mjs add "<title>" --body - [--tags a,b] [--supersedes "<fragment>"]
//
// Env: OBS_SKILL_NOTES to set the file path outright, otherwise
// $XDG_STATE_HOME/obs-skill/notes.md, otherwise ~/.local/state/obs-skill/notes.md

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { callObs } from "./obs.mjs";

const CONSOLIDATE_AT_BYTES = 16 * 1024;

const HEADER = `# obs-skill notes

Local notes about this OBS install: setting values that worked, ones that
did not, and hardware quirks. Written by agents using the obs-skill, read
back at the start of later sessions.

Newest entries are at the bottom. An entry that says "Superseded by" was
wrong or has been replaced; keep it for the history and trust the newer one.
Live OBS always outranks a note here.
`;

export function notesPath() {
  const explicit = process.env.OBS_SKILL_NOTES?.trim();
  if (explicit) return path.resolve(explicit);
  const stateHome = process.env.XDG_STATE_HOME?.trim() || path.join(os.homedir(), ".local/state");
  return path.join(stateHome, "obs-skill", "notes.md");
}

function readNotes(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

async function environmentStamp() {
  try {
    const results = await Promise.race([
      callObs([{ requestType: "GetVersion" }]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500)),
    ]);
    const data = results[0]?.data;
    if (!data) return "OBS unknown";
    return `OBS ${data.obsVersion} · ${data.platformDescription}`;
  } catch {
    return "OBS not running at write time";
  }
}

function markSuperseded(body, fragment, newTitle, date) {
  const needle = fragment.toLowerCase();
  const lines = body.split("\n");
  const idx = lines.findIndex((l) => l.startsWith("## ") && l.toLowerCase().includes(needle));
  if (idx === -1) return { body, matched: null };
  const matched = lines[idx].replace(/^##\s*/, "");
  // The line after a heading is the environment stamp; put the marker below it.
  const at = lines[idx + 1]?.trim() ? idx + 2 : idx + 1;
  lines.splice(at, 0, `Superseded by: ${newTitle} (${date})`);
  return { body: lines.join("\n"), matched };
}

async function add(argv) {
  const title = argv[0];
  if (!title || title.startsWith("--")) {
    console.error('Usage: node notes.mjs add "<title>" --body - [--tags a,b] [--supersedes "<fragment>"]');
    process.exitCode = 1;
    return;
  }

  let body = "";
  let tags = "";
  let supersedes = "";

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--body" && next !== undefined) {
      body = next === "-" ? fs.readFileSync(0, "utf8") : next;
      i += 1;
    } else if (arg === "--tags" && next !== undefined) {
      tags = next;
      i += 1;
    } else if (arg === "--supersedes" && next !== undefined) {
      supersedes = next;
      i += 1;
    }
  }

  body = body.trim();
  if (!body) {
    console.error("Refusing to write an entry with no body. Say what you tried, what happened, and how you verified it.");
    process.exitCode = 1;
    return;
  }

  const file = notesPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const stamp = [date, await environmentStamp(), tags ? `tags: ${tags}` : null]
    .filter(Boolean)
    .join(" · ");

  let existing = readNotes(file) ?? HEADER;
  let supersededNote = "";
  if (supersedes) {
    const result = markSuperseded(existing, supersedes, title, date);
    existing = result.body;
    supersededNote = result.matched
      ? `Marked superseded: ${result.matched}`
      : `No existing entry matched "${supersedes}", nothing superseded`;
  }

  const entry = `\n## ${title}\n${stamp}\n\n${body}\n`;
  fs.writeFileSync(file, `${existing.replace(/\s*$/, "\n")}${entry}`);

  console.log(`Wrote note to ${file}`);
  if (supersededNote) console.log(supersededNote);
}

function read() {
  const file = notesPath();
  const body = readNotes(file);
  if (body === null) {
    console.log(`No notes yet. They will be created at ${file} the first time you add one.`);
    return;
  }
  const bytes = Buffer.byteLength(body);
  if (bytes > CONSOLIDATE_AT_BYTES) {
    console.log(`(${file} is ${Math.round(bytes / 1024)}KB. Consider consolidating duplicate or superseded entries.)\n`);
  }
  console.log(body);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "path") {
    console.log(notesPath());
    return;
  }
  if (command === "read") {
    read();
    return;
  }
  if (command === "add") {
    await add(rest);
    return;
  }

  console.log([
    "Usage:",
    "  node notes.mjs path",
    "  node notes.mjs read",
    '  node notes.mjs add "<title>" --body - [--tags a,b] [--supersedes "<fragment>"]',
  ].join("\n"));
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(entry);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
