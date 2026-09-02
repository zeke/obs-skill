# Input kinds and their settings

Setting keys below were read from `GetInputDefaultSettings` on OBS 32.1.2 /
macOS. Always confirm against the live instance:

```sh
node <skill-directory>/scripts/obs.mjs GetInputKindList
node <skill-directory>/scripts/obs.mjs GetInputDefaultSettings '{"inputKind":"ffmpeg_source"}'
```

All file paths must be absolute. `~` is not expanded by OBS.

## Cameras

macOS exposes several capture kinds. Preference order:

1. `av_capture_input_v2` — current macOS capture. Device is `uid`.
   Defaults: `{"color_space":-1,"enable_audio":true,"input_format":4294967295,"preset":"AVCaptureSessionPresetHigh","uid":"","use_preset":true,"video_range":-1}`
2. `macos-avcapture` — device is `device`. Defaults:
   `{"device":"","enable_audio":true,"preset":"AVCaptureSessionPresetHigh","use_preset":true}`
3. `macos-avcapture-fast` — lower-latency variant, same shape.

On Windows the kind is `dshow_input` (device key `video_device_id`); on
Linux `v4l2_input` (`device_id`).

Because the device key differs per kind, discover it instead of guessing:

```sh
# 1. create with empty settings
node <skill-directory>/scripts/obs.mjs CreateInput \
  '{"sceneName":"Main","inputName":"Webcam","inputKind":"av_capture_input_v2","inputSettings":{}}'

# 2. list the devices (try "uid", then "device", then "video_device_id", then "device_id")
node <skill-directory>/scripts/obs.mjs GetInputPropertiesListPropertyItems \
  '{"inputName":"Webcam","propertyName":"uid"}'

# 3. apply the itemValue you want
node <skill-directory>/scripts/obs.mjs SetInputSettings \
  '{"inputName":"Webcam","inputSettings":{"uid":"6C707041-05AC-0011-0002-000000000001"},"overlay":true}'
```

`GetInputPropertiesListPropertyItems` errors with "Unable to find a
property" when the key is wrong, which is a cheap way to probe. The first
item in the returned list is usually an empty placeholder; skip it.

Check `itemEnabled` before picking a device. A device with
`itemEnabled: false` is registered with the OS but not currently
connectable, and setting it produces a source that creates cleanly, accepts
filters, and renders nothing. This is the normal state for an iPhone
Continuity Camera that is asleep or locked:

```json
{"itemEnabled": false, "itemName": "Ezekiel's iPhone Camera", "itemValue": "0F57740D-..."}
```

Run this list first and tell the user to wake the device, rather than
creating the input and debugging a black frame afterwards. The only other
signal is in the OBS log (`Unable to initialize device with unique ID`) and
a `sourceWidth` of `0`, which is indistinguishable from a camera that is
simply still warming up.

An unavailable device can also report an empty `itemName` while keeping its
`itemValue`, so match on `itemValue` when re-checking a device you already
know the UID for. Do not assume the human-readable name will be there.

### iPhone UIDs are not stable, so never trust a saved one

An iPhone appears under different UIDs depending on how it is connected,
and only one of them is live at a time. Observed within a few minutes on
one phone:

| UID | Name | State |
| --- | ---- | ----- |
| `0F57740D-...-7E6500000001` | `Ezekiel's iPhone Camera` | listed, `itemEnabled: false`, then vanished |
| `4B186C00-...-2ABB00000001` | `iPhone Camera` | absent, then live |

The name is not stable either; the same phone was `Ezekiel's iPhone Camera`
and later `iPhone Camera`.

This is why saved iPhone sources break permanently. OBS stores whatever UID
was current when the source was made, and on the next connection that UID
no longer resolves. The symptom is `Unable to initialize device with unique
ID` in the OBS log at startup, one line per stale source. A collection that
has been used with an iPhone for a while accumulates several of these.

So do not hardcode or reuse an iPhone UID, including one you read minutes
earlier in the same session. Resolve it fresh from
`GetInputPropertiesListPropertyItems`, filtered to `itemEnabled: true`, and
match on the name. To repair an existing black iPhone source, re-resolve
the UID and `SetInputSettings` on it rather than recreating the input; the
filters and transform are worth keeping.

Note that `iPhone Desk View Camera` and a bare `iPhone` entry also appear.
The rear/front camera feed is the one named `iPhone Camera`.

A device query does not need a throwaway input if the scene collection
already has an input of the same kind. Query the existing one; the list is
a property of the kind, not of the particular input.

To use a specific resolution or frame rate instead of a preset, set
`use_preset: false`, then read the `resolution` and `frame_rate` property
lists the same way.

## Screen and window capture

- `screen_capture` — macOS ScreenCaptureKit, the modern option.
  `{"type":0,"display_uuid":"","application":"","window":0,"show_cursor":true,"hide_obs":false}`.
  `type` selects display / window / application capture.
- `display_capture` — older full-display capture. `{"display_uuid":"...","crop_mode":0,"show_cursor":true}`.
  Get UUIDs from `GetMonitorList`.
- `window_capture` — `{"window":0,"show_shadow":false}`. Probe the
  `window` property list for the numeric handles.

On Windows use `monitor_capture`, `window_capture`, or `game_capture`.

## Images

`image_source`: `{"file":"/abs/path.png","unload":false,"linear_alpha":false}`

`unload: true` frees memory when the source is hidden, at the cost of a
reload flash. `linear_alpha: true` gives correct blending for PNGs with
premultiplied-looking edges.

`slideshow_v2` for a rotating set of images:
`{"slide_time":2000,"transition":"fade","transition_speed":700,"playback_mode":"loop","slide_mode":"mode_auto","use_custom_size":"1920x1080"}`.
The file list key is `files`, an array of `{"value":"/abs/path.png"}`
objects.

## Video and audio files

`ffmpeg_source` is the Media Source. Local file key is `local_file`, and
`is_local_file` must stay `true`. For a stream or remote URL set
`is_local_file: false` and use `input`.

```json
{
  "local_file": "/abs/path/clip.mp4",
  "is_local_file": true,
  "looping": true,
  "restart_on_activate": true,
  "clear_on_media_end": true,
  "speed_percent": 100,
  "buffering_mb": 2,
  "hw_decode": true
}
```

`restart_on_activate: true` restarts the clip every time its scene becomes
active, which is usually what you want for stingers and usually not what
you want for background loops.

## Color and gradient backgrounds

`color_source_v3`: `{"color":4291940817,"width":1920,"height":1080}`

Set `width`/`height` to the canvas size for a full-bleed background, or
leave them and stretch with bounds. Colors are `0xAABBGGRR`:

| Color | Hex (ABGR) | Integer |
| ----- | ---------- | ------- |
| black | `0xFF000000` | 4278190080 |
| white | `0xFFFFFFFF` | 4294967295 |
| red | `0xFF0000FF` | 4278190335 |
| green | `0xFF00FF00` | 4278255360 |
| blue | `0xFFFF0000` | 4294901760 |
| transparent | `0x00000000` | 0 |

## Text

`text_ft2_source_v2`:

```json
{
  "text": "Hello",
  "font": {"face": "Helvetica", "size": 72, "style": "Bold", "flags": 0},
  "color1": 4294967295,
  "color2": 4294967295,
  "outline": false,
  "drop_shadow": false,
  "word_wrap": false,
  "custom_width": 0
}
```

`color1` and `color2` are the top and bottom of a vertical gradient; set
both to the same value for flat text. To read from a file instead, set
`from_file: true` and `text_file: "/abs/path.txt"`.

On Windows the kind is `text_gdiplus_v3`, which has a different and richer
setting shape (`align`, `valign`, `bk_color`, `outline_size`).

## Browser

`browser_source`:

```json
{
  "url": "https://example.com",
  "width": 1920,
  "height": 1080,
  "fps_custom": false,
  "fps": 30,
  "css": "body { background-color: rgba(0,0,0,0); margin: 0px auto; overflow: hidden; }",
  "shutdown": false,
  "restart_when_active": false,
  "reroute_audio": false,
  "webpage_control_level": 1
}
```

For local HTML set `is_local_file: true` and `local_file`. The default CSS
makes the page background transparent, which is what makes browser sources
useful as overlays; keep it unless you want an opaque page.

Reload with `PressInputPropertiesButton {"inputName":"...","propertyName":"refreshnocache"}`.

`reroute_audio: true` routes page audio into OBS as a mixable input rather
than straight to the desktop.

## Audio capture

- `coreaudio_input_capture` (mic) and `coreaudio_output_capture` (desktop),
  both `{"device_id":"default","enable_downmix":true}`
- `sck_audio_capture` — per-application audio via ScreenCaptureKit
- Windows: `wasapi_input_capture`, `wasapi_output_capture`,
  `wasapi_process_output_capture`

`GetSpecialInputs` returns the names of the global mic and desktop audio
inputs that OBS creates itself. Mute those rather than creating new ones.
