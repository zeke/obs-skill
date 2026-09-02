# AGENTS.md

Technical notes for agents working on this repository.

IMPORTANT: revise this file whenever meaningful changes are made to the
project (new reference files, changed script interface, new validation
commands, new conventions). Keep it current.

## Project purpose

This repo is the `obs-skill` agent skill. It teaches coding agents to
control a running OBS Studio instance over obs-websocket v5. Canonical
home: <https://github.com/zeke/obs-skill>.

## Structure

- `SKILL.md` — primary instructions. Keep it compact and task-oriented,
  under 500 lines. Details belong in `references/`.
- `scripts/obs.mjs` — the obs-websocket v5 client. Must stay
  dependency-free: Node's built-in `WebSocket` (Node 22+) and `node:crypto`
  only. Do not add a `package.json` or npm dependencies. It must also keep
  working when invoked through a symlink, since that is how skills are
  normally installed; `script/test` covers this.
- `scripts/notes.mjs` — append-only local notes store. Same
  dependency-free and symlink-safe constraints. It must never write inside
  the skill directory: installing or updating a skill replaces that folder,
  so notes there would be lost. Default path is
  `$XDG_STATE_HOME/obs-skill/notes.md` or `~/.local/state/obs-skill/notes.md`,
  overridable with `OBS_SKILL_NOTES`.
- `references/` — loaded on demand.
  - `requests.md` — request types grouped by task
  - `sources.md` — input kinds and `inputSettings` keys
  - `filters.md` — filter kinds and `filterSettings` keys
  - `transforms.md` — position, bounds, crop, alignment, layer order
  - `recipes.md` — end-to-end sequences for common asks
  - `troubleshooting.md` — status codes and hardware gotchas
- `script/test` — validation, following scripts-to-rule-them-all.
- `README.md` — human-facing. What it is and why, not how it is built.

## Verifying claims before writing them down

The whole value of this skill is that its setting keys and value ranges are
correct. Do not add a key you have not confirmed. Two sources of truth:

1. The live instance:

```sh
node scripts/obs.mjs GetInputDefaultSettings '{"inputKind":"ffmpeg_source"}'
node scripts/obs.mjs GetSourceFilterDefaultSettings '{"filterKind":"color_filter_v2"}'
```

   Note that defaults omit keys whose default is empty, so this is
   necessary but not sufficient.

2. The OBS source, which has the complete key list and the real slider
   ranges:

```sh
curl -sL https://raw.githubusercontent.com/obsproject/obs-studio/master/plugins/obs-filters/color-correction-filter.c \
  | grep -E 'SETTING_|obs_properties_add'
```

   Sources live under `plugins/obs-filters/`, `plugins/mac-avcapture/`,
   `plugins/obs-ffmpeg/`, `plugins/text-freetype2/`, and the separate
   `obsproject/obs-browser` repo.

The protocol reference is
<https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md>
(fetch the raw file; it is large).

## Testing against a live OBS

Do it in a throwaway scene and clean up afterwards. Never mutate the user's
existing scenes while testing.

```sh
node scripts/obs.mjs CreateScene '{"sceneName":"obs-skill-test"}'
# ... experiment, screenshot, verify ...
node scripts/obs.mjs RemoveScene '{"sceneName":"obs-skill-test"}'
node scripts/obs.mjs RemoveInput '{"inputName":"..."}'   # per input created
```

`RemoveScene` does not remove the inputs it contained. Remove them
explicitly or they linger in the scene collection.

## Notes versus references

Keep the distinction sharp when editing:

- `references/` is general OBS knowledge, shipped to everyone, version
  controlled here.
- The notes file is one machine's experience, written at runtime, never
  committed here.

When a note generalizes it should be promoted into `references/` via a pull
request. Do not add machine-specific values to `references/`, and do not
teach the skill to write general documentation into notes.

## Validation

```sh
script/test
```

That runs `node --check` on the client, a `--help` smoke test,
`npx -y skills-ref validate .`, and a live connection check if OBS is
running. There is no linter configured.

The `name` in `SKILL.md` frontmatter must stay `obs-skill`, matching the
directory name.

## Prior art in this codebase's history

- `zeke/obsx` is a CLI for the same API. Its `add-webcam` command has the
  device-discovery logic this skill describes in prose.
- `~/obs/AGENTS.md` on the maintainer's machine holds the original notes on
  the iPhone frame-and-mask technique documented in `references/recipes.md`.
