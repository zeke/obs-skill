---
name: obs-skill
description: >
  Control a running OBS Studio instance from an agent session using the
  obs-websocket v5 API. Use this skill whenever asked to manipulate OBS:
  add or remove a webcam, screen capture, image, video, text, or browser
  source; create, rename, or switch scenes; reorder or reposition layers;
  apply filters like chroma key (greenscreen), color correction, contrast,
  crop, blur, or image masks; resize and align sources on the canvas;
  start or stop streaming, recording, or the virtual camera; mute audio;
  or take a screenshot of what OBS is currently rendering.
compatibility: Requires OBS Studio 28+ with obs-websocket 5.x enabled, and Node.js 22+ (for the built-in WebSocket global).
---

# OBS skill

Drive a live OBS Studio instance over its built-in WebSocket server. Every
operation is a request from the [obs-websocket v5 protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md).

## The one tool you need

`scripts/obs.mjs` is a dependency-free client. Replace `<skill-directory>`
with the directory containing this `SKILL.md`.

```sh
# Dump everything: version, canvas size, scenes, scene items, inputs, output status
node <skill-directory>/scripts/obs.mjs --state

# One request
node <skill-directory>/scripts/obs.mjs GetSceneList
node <skill-directory>/scripts/obs.mjs SetCurrentProgramScene '{"sceneName":"Just Zeke"}'

# Several requests, executed in order on one connection
node <skill-directory>/scripts/obs.mjs --batch <<'EOF'
[
  {"requestType":"CreateInput","requestData":{"sceneName":"Main","inputName":"BG","inputKind":"color_source_v3","inputSettings":{"color":4278190335,"width":1920,"height":1080}}},
  {"requestType":"SetSceneItemIndex","requestData":{"sceneName":"Main","sceneItemId":1,"sceneItemIndex":0}}
]
EOF
```

Failed requests print `FAILED (<code>) <message>` to stderr and set a
non-zero exit code. Successful ones with no response body print `ok`.

Connection defaults to `ws://127.0.0.1:4455`. Override with `OBS_URL` and
`OBS_PASSWORD`. If auth is enabled and `OBS_PASSWORD` is unset, the script
reads the password out of the local obs-websocket config file, so on the
user's own machine it usually just works.

## Working loop

0. Read the local notes once per session, before anything else:

```sh
node <skill-directory>/scripts/notes.mjs read
```

   These are findings from earlier sessions on this specific machine: setting
   values that worked, ones that did not, device quirks. Cheap to read and
   often saves the exact loop that produced them. See "Local notes" below.

1. Run `--state` next. Never guess scene names, input names, or scene item
   IDs; they are all required verbatim and IDs are per-scene integers.
2. Make the change with one `--batch` call.
3. Verify visually with a screenshot, then read the image:

```sh
node <skill-directory>/scripts/obs.mjs SaveSourceScreenshot \
  '{"sourceName":"Main","imageFormat":"png","imageFilePath":"/tmp/obs-check.png","imageWidth":1280}'
```

`sourceName` can be a scene or a single input, so you can inspect one
source in isolation. Use an absolute `imageFilePath`. `imageWidth` and
`imageHeight` are capped at 4096, which matters on large canvases.

4. Iterate: adjust, screenshot, compare. This is much faster than asking
   the user to describe what they see, and it works with OBS in the
   background.

## Rules that prevent most failures

- Input names are global across the whole scene collection, not per scene.
  `CreateInput` with an existing name fails with code 601. Check the
  `inputs` list from `--state` and pick a distinct name.
- To show one existing source in a second scene, use `CreateSceneItem`
  with `sourceName`, not `CreateInput`. Both scene items then share
  settings and filters.
- Higher `sceneItemIndex` renders on top. Index 0 is the bottom layer.
  New items are appended at the top of the stack.
- Colors are 32-bit integers in `0xAABBGGRR` order (ABGR), not RGB. Red is
  `0xFF0000FF` = `4278190335`. Filter colors like `key_color` drop the
  alpha byte and use `0xBBGGRR`.
- File paths in `inputSettings` must be absolute. `~` is not expanded.
- Before adding a camera, run `GetInputPropertiesListPropertyItems` and
  check `itemEnabled` on the device you plan to use. A device listed with
  `itemEnabled: false` creates a source that looks fine and renders
  nothing.
- `sourceWidth`, `sourceHeight`, `width`, and `height` in a scene item
  transform are `0` until the source has rendered a frame. Cameras, media,
  and browser sources report `0` until the scene is live or has warmed up.
  Wait a second and re-read before doing math with those numbers.
- State can lag a mutation by a moment. If a read inside the same `--batch`
  looks stale, re-query in a separate call.
- Prefer `boundsType: "OBS_BOUNDS_SCALE_INNER"` with `boundsWidth` and
  `boundsHeight` over `scaleX`/`scaleY` when fitting a source to a target
  rectangle. It works without knowing the source's native resolution.
  Bounds do not show up in the transform response: `scaleX` stays `1` and
  `width` stays at the native size even when the source renders
  full-canvas. Verify with a screenshot, not by reading the fields back.
- If a source renders nothing while every piece of state looks correct,
  ask the user to restart OBS early rather than late. OBS subsystems,
  notably the browser source's CEF layer, can wedge for the life of the
  process while reporting themselves healthy through every API and log.
  Nothing over the WebSocket recovers that. One restart beats twenty
  diagnostic calls.

## Local notes

The reference files describe OBS in general. The notes file describes *this*
OBS: its version, its cameras, the values that looked right on this user's
hardware. Read it at the start of a session and add to it at the end.

```sh
node <skill-directory>/scripts/notes.mjs read
node <skill-directory>/scripts/notes.mjs path

node <skill-directory>/scripts/notes.mjs add "<short title>" --body - --tags filters,camera <<'EOF'
What you were trying to do, the exact payload that worked, what you tried
first that did not, and how you verified it.
EOF
```

Each entry is stamped with the date and the live OBS version and platform,
so a later session can tell whether a note still applies. The file lives
outside the skill directory (`~/.local/state/obs-skill/notes.md` by default,
overridable with `OBS_SKILL_NOTES`) because updating the skill replaces the
skill folder wholesale.

Write a note when:

- A setting value produced a visibly good or bad result. Record the number.
- Something in the reference files turned out to be wrong or incomplete here.
- A device, plugin, or filter kind behaved differently than documented.
- You burned several turns on something. Write down what the shortcut was.

Do not write a note for: routine successful operations, anything already in
the reference files, or speculation you did not verify.

When a new finding contradicts an old note, supersede it rather than
starting a parallel entry:

```sh
node <skill-directory>/scripts/notes.mjs add "<new title>" --body - --supersedes "<fragment of the old title>"
```

The old entry stays for the history and gains a `Superseded by:` line.
Never delete an entry. If the file gets unwieldy, `read` will say so;
consolidate duplicates into one entry rather than trimming information.

Treat notes as evidence, not as truth. Live OBS outranks them. If a note
conflicts with what `--state` or a screenshot shows, believe OBS and
supersede the note in the same session.

Notes are local and often machine-specific. When a finding would help
anyone using OBS, not just this user, also offer to send it upstream as a
pull request. See "Improving this skill".

## Reference files

Load these as needed:

- `references/requests.md` — the request types worth knowing, grouped by task.
- `references/sources.md` — input kinds and their real `inputSettings` keys.
- `references/filters.md` — filter kinds and their real `filterSettings` keys.
- `references/transforms.md` — position, scale, bounds, crop, alignment.
- `references/recipes.md` — greenscreen webcam, picture-in-picture, lower
  thirds, image-masked overlays, full-bleed backgrounds.
- `references/troubleshooting.md` — error codes and hardware gotchas.

Filter and input kinds differ by OBS version, platform, and installed
plugins. When something is not in the reference files, ask OBS directly:

```sh
node <skill-directory>/scripts/obs.mjs GetInputKindList
node <skill-directory>/scripts/obs.mjs GetSourceFilterKindList
node <skill-directory>/scripts/obs.mjs GetInputDefaultSettings '{"inputKind":"browser_source"}'
node <skill-directory>/scripts/obs.mjs GetSourceFilterDefaultSettings '{"filterKind":"chroma_key_filter_v2"}'
```

`GetInputDefaultSettings` and `GetSourceFilterDefaultSettings` are the
ground truth for setting key names. Use them before inventing a key.

## Destructive actions

`RemoveInput`, `RemoveScene`, and `RemoveSourceFilter` are not undoable
through the API and OBS has no undo for them. Confirm with the user before
removing anything they did not explicitly ask to remove. Renaming,
disabling (`SetSceneItemEnabled`), and reordering are all reversible;
prefer them.

Do not start or stop a stream or recording unless asked directly.

## Improving this skill

This skill lives at <https://github.com/zeke/obs-skill>.

OBS's setting keys are barely documented and vary by version, platform,
and plugins. Almost every real session turns up something the reference
files do not cover: a filter setting that behaves differently than its
name suggests, a device that needs a specific property name, a value range
that works well in practice.

There are two places for such a finding, and most belong in both:

- The local notes, for anything about this machine. Always.
- A pull request upstream, for anything that generalizes.

The notes file is a good source of upstream PRs. A note that has survived
several sessions without being superseded is worth promoting; one that was
superseded twice is probably specific to this setup. `notes.mjs read` is a
reasonable thing to skim when the user asks what is worth contributing.

When a finding generalizes, offer to open a pull request against
`zeke/obs-skill` with what you learned. Keep the contribution concrete:
the OBS version and platform, the exact request payload that worked, and
what you had tried that did not. Corrections to wrong information are more
valuable than additions.

```sh
gh repo fork zeke/obs-skill --clone --remote
# edit the relevant references/*.md file
gh pr create --title "docs: <what you learned>"
```
