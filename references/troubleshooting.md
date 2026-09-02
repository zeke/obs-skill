# Troubleshooting

## Cannot connect

The script reports the URL it tried. Checks, in order:

1. Is OBS running? `pgrep -lf OBS` on macOS/Linux.
2. Is the server enabled? OBS menu: Tools > WebSocket Server Settings >
   Enable WebSocket server. The port lives there too.
3. Read the config directly rather than asking the user to describe the
   dialog:
   - macOS: `~/Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json`
   - Linux: `~/.config/obs-studio/plugin_config/obs-websocket/config.json`
   - Windows: `%APPDATA%\obs-studio\plugin_config\obs-websocket\config.json`

   It contains `server_enabled`, `server_port`, `auth_required`, and
   `server_password`. The script reads this file automatically for the
   port and, when `auth_required` is true, the password.
4. Node 22 or newer is required for the global `WebSocket`. On older Node
   the script fails with `WebSocket is not defined`.
5. `localhost` can resolve to IPv6 `::1` while obs-websocket listens on
   IPv4. The script defaults to `127.0.0.1` for this reason; if you set
   `OBS_URL` yourself, use the IP.

Enabling the server does not require restarting OBS.

## Request status codes

| Code | Meaning | Usual cause |
| ---- | ------- | ----------- |
| 100 | Success | not an error |
| 203 | MissingRequestType | no request type sent |
| 204 | UnknownRequestType | request does not exist in this version; check `GetVersion` → `availableRequests` |
| 300 | MissingRequestField | a required field was omitted |
| 400 | InvalidRequestField | generic bad field; read the comment |
| 401 | InvalidRequestFieldType | number sent as string, or vice versa |
| 402 | RequestFieldOutOfRange | e.g. `imageWidth` above 4096 |
| 600 | ResourceNotFound | scene, input, or source name does not exist; names are case-sensitive |
| 601 | ResourceAlreadyExists | input name is already taken somewhere in the scene collection |
| 604 | InvalidResourceState | e.g. stopping a recording that is not running |
| 605 | InvalidInputKind | kind not in `GetInputKindList`, or a missing plugin |
| 606 | ResourceNotConfigurable | source has no settings to set |
| 607 | InvalidFilterKind | kind not in `GetSourceFilterKindList`; often a missing plugin |
| 700 | ResourceCreationFailed | OBS refused to create it |
| 701 | ResourceActionFailed | the action on an existing resource failed |
| 702 | RequestProcessingFailed | unexpected internal failure; read the comment |
| 703 | CannotAct | that combination of fields cannot do what you asked |

The `comment` field in the response has the human-readable reason. The
script prints it.

## Nothing appears after adding a source

- Was the source added to the scene that is currently in program? Compare
  against `currentProgramScene`. Adding to a different scene is silent.
- Is the scene item enabled? `sceneItemEnabled: false` renders nothing.
- Is it behind something? Check `sceneItemIndex` and remember the highest
  index is on top.
- Is it off-canvas? A `positionX` computed against a 1920 canvas puts
  things in the top-left eighth of a 5120 canvas, and a position larger
  than the canvas puts them outside it entirely.
- Is the file path absolute and real? OBS does not expand `~` and does not
  complain about a missing image file.
- Is it fully transparent? Check for an `opacity: 0` in a filter, an
  alpha-zero color, or a mask that is masking everything.

Take a screenshot of the individual input. If the input renders fine on its
own, it is a scene problem (order, transform, enabled); if the input is
blank, it is a source problem (path, device, filters).

## Sources report zero size

`sourceWidth`, `sourceHeight`, `width`, and `height` are `0` until the
source has produced a frame. Cameras, media sources, browser sources, and
text sources all do this. Make the scene active, wait a second, then
re-read `GetSceneItemTransform`. Do not do arithmetic on the zeros.

## State reads look stale

Mutations are applied on OBS's own thread, so a read issued immediately
after a write can still show the old state. `RemoveScene` followed by
`GetSceneList` in the same batch will often still list the scene. Re-query
in a separate call after a short pause.

`RemoveInput` is worse than stale: it returns success while a scene item
still references the source, and the input stays in `GetInputList`
indefinitely. Remove the scene items first with `RemoveSceneItem`, which
drops the last reference and takes the input with it. Always verify a
removal with a fresh `GetInputList` rather than trusting the `ok`.

## A source renders nothing and the screenshot looks white

Screenshots are RGBA. A source that renders nothing produces a fully
transparent image, which most viewers and terminals show as white. Before
concluding that a web page is blank or an image is white, check the alpha
channel. `(0, 0, 0, 0)` everywhere means the source drew nothing at all,
which is a different problem from a source that drew something white.

## Browser sources render nothing

If a `browser_source` output is fully transparent regardless of URL,
including OBS's own `https://obsproject.com/browser-source` default, the
problem is CEF, not the API. Diagnose from outside OBS:

```sh
ps aux | grep "OBS Helper" | grep -oE '--type=[a-z-]+' | sort | uniq -c
```

A working browser source has a `--type=gpu-process`, at least one
`--type=renderer`, and some `--type=utility` helpers. Only the GPU process
means CEF initialized but never created a browser, so no page is being
loaded.

The fix is to quit and reopen OBS. CEF can wedge in this state for the
life of the process, and nothing reachable over the WebSocket API brings it
back. Ask the user to restart OBS before investigating any further; it
takes them ten seconds and it resolves this.

Do not waste turns on the plausible-looking remedies. None of these help:
reloading with `PressInputPropertiesButton refreshnocache`, toggling
`sceneItemEnabled`, cycling `shutdown` / `restart_when_active`, changing
the URL, or waiting longer. Hardware acceleration lives in OBS global
config, not profile config, so `SetProfileParameter` cannot reach it, and
changing it needs a restart anyway.

Equally important, do not conclude the install is broken. Every signal
looks healthy in this state and will mislead you:

- OBS's own log reports `[obs-browser]: Version ...` and a CEF version,
  because the plugin loaded fine. Plugin load says nothing about whether
  the renderer works.
- There are no errors anywhere: not in the OBS log, not in
  `~/Library/Logs/DiagnosticReports`, and not in `log show`. macOS never
  denies or kills the renderer, because OBS never asks for one.
- The CEF profile dir is writable and its `SingletonLock` points at the
  live OBS pid, so it is not a stale lock.
- `GetSourceActive` returns `videoActive: true, videoShowing: true`.

One signal that does correlate: the `Cache` subdirectory of the CEF profile
(`plugin_config/obs-browser/Cache`) has no recent writes, because no page
has loaded.

Confirmed on OBS 32.1.2 / obs-browser 2.26.8 / CEF 127 / macOS 26.5, after
the OBS process had been running about seven hours. Restarting OBS fixed it
immediately, and the same source then rendered correctly with no other
change.

## macOS camera problems

- OBS needs camera permission: System Settings > Privacy & Security >
  Camera. Permissions get reset by OS updates, and the symptom is a device
  that lists but renders black.
- Only one app can hold a camera at a time. Quit FaceTime, Photo Booth,
  QuickTime, and browser tabs in a call before troubleshooting further.
- An iPhone appearing via Continuity Camera is not a persistent device. It
  drops out of the device list when the phone locks, when another app
  claims the stream, or when the cable is charge-only. Use a data cable
  directly into a Mac port rather than a hub, and set Auto-Lock to Never
  while streaming. When it goes stale, re-set the device on the existing
  input rather than recreating the input.
- More often it does not drop out of the list, it stays listed with
  `itemEnabled: false`. Check that field in
  `GetInputPropertiesListPropertyItems` before building anything on top of
  the device. See `sources.md`.
- If several capture inputs log `Unable to initialize device` at once, the
  problem is the device or the phone, not the input you just made. Check
  whether the collection's other inputs on the same camera are failing too
  before touching your own settings.
- `av_capture_input_v2` and `macos-avcapture` use different device keys
  (`uid` versus `device`), so a device value copied between them will not
  work.

## Filters that do not exist

Stock OBS has no blur, glow, outline, drop shadow, background removal, or
3D transform filter. Those are plugins. Always run
`GetSourceFilterKindList` before agreeing to add one, and if it is missing,
say what plugin provides it rather than substituting something else
silently.

## Settings that do not stick

`SetInputSettings` defaults to `overlay: true`, which merges your keys into
the existing settings. `overlay: false` resets every key you did not
mention back to its default, which is occasionally what you want and
usually a nasty surprise.

`GetInputSettings` only returns values that differ from the defaults, so an
absent key means "default", not "unset". Use
`GetInputDefaultSettings {inputKind}` to see the full shape.

If a key silently does nothing, it is probably misspelled. OBS ignores
unknown keys without error, and `GetInputSettings` will happily echo the
bogus key straight back at you. Confirm every key against
`GetInputDefaultSettings` output.

## Things the API cannot do

No requests exist for: duplicating a scene wholesale, creating or editing
groups, editing hotkey bindings, changing encoder settings, or reordering
scenes. Workarounds:

- `TriggerHotkeyByName` reaches any action that has a hotkey.
  `GetHotkeyList` enumerates them.
- `OpenInputPropertiesDialog`, `OpenInputFiltersDialog`, and
  `OpenSourceProjector` hand control back to the user for the genuinely
  manual cases.
- `SetProfileParameter` writes raw profile config values, including
  encoder settings. Powerful and easy to corrupt; only with explicit
  user consent.
