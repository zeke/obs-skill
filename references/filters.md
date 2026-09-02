# Filter kinds and their settings

Ranges below come from the OBS filter source; defaults come from
`GetSourceFilterDefaultSettings` on OBS 32.1.2. Confirm against the live
instance:

```sh
node <skill-directory>/scripts/obs.mjs GetSourceFilterKindList
node <skill-directory>/scripts/obs.mjs GetSourceFilterDefaultSettings '{"filterKind":"chroma_key_filter_v2"}'
```

Always prefer the `_v2` kind when both exist. The v1 kinds are kept only
for backwards compatibility and use different value scales (integer
`opacity` 0-100 instead of float 0-1, narrower contrast range).

Filters render bottom-up by `filterIndex`. Order matters: crop before
chroma key gets rid of edge junk the keyer would otherwise chew on; color
correction after chroma key avoids shifting the key color out of range.

## Chroma key (greenscreen)

`chroma_key_filter_v2`

```json
{
  "key_color_type": "green",
  "key_color": 65280,
  "similarity": 400,
  "smoothness": 80,
  "spill": 100,
  "opacity": 1,
  "contrast": 0,
  "brightness": 0,
  "gamma": 0
}
```

- `key_color_type`: `"green"`, `"blue"`, `"magenta"`, or `"custom"`. With
  `"custom"`, set `key_color` as `0xBBGGRR` (no alpha byte).
- `similarity` 1-1000: how far from the key color still counts as
  background. Raise it if green fringe remains, lower it if parts of the
  subject go transparent. 400 is the default; 250-500 is the usual range.
- `smoothness` 1-1000: edge feathering.
- `spill` 1-1000: removes green light bounced onto the subject.
- `opacity` 0-1, `contrast` -4 to 4, `brightness` -1 to 1, `gamma` -1 to 1.

For a webcam with no real greenscreen, a chroma key will not work. Say so
rather than tuning it forever. Background removal needs a plugin such as
`obs-backgroundremoval`; check `GetSourceFilterKindList` for it.

`color_key_filter_v2` is the simpler single-color keyer (same keys, no
`spill`, `similarity` default 80). `luma_key_filter_v2` keys on brightness:
`{"luma_min":0,"luma_max":1,"luma_min_smooth":0,"luma_max_smooth":0}`.

## Color correction and contrast

`color_filter_v2`

```json
{
  "brightness": 0,
  "contrast": 0,
  "gamma": 0,
  "saturation": 0,
  "hue_shift": 0,
  "opacity": 1,
  "color_multiply": 16777215,
  "color_add": 0
}
```

- All values are offsets from neutral, so `0` means unchanged. This trips
  people up: `contrast: 1` is a big push, not "100%".
- `contrast` -4 to 4. Subtle punch: 0.15 to 0.4.
- `brightness` -1 to 1, `gamma` -3 to 3.
- `saturation` -1 to 5. `-1` is fully desaturated (black and white),
  `0` unchanged, `0.2` to `0.6` a moderate boost.
- `hue_shift` -180 to 180 degrees.
- `opacity` 0 to 1.
- `color_multiply` tints (`0xBBGGRR`, `16777215` = white = no tint),
  `color_add` adds light (`0` = none).

`clut_filter` applies a LUT file: `{"image_path":"/abs/path.png","clut_amount":1,"passthrough_alpha":false}`.
This is the way to get a graded film look. OBS ships LUTs in its data
directory.

## Crop

`crop_filter`

```json
{"relative": true, "left": 0, "top": 0, "right": 0, "bottom": 0}
```

With `relative: false`, `left`/`top` become the origin and `cx`/`cy` set
the output width and height, which is how you crop to a fixed region.

There are two ways to crop and they are not the same thing:

- `crop_filter` on the source changes what the source outputs, so every
  scene item using it is cropped.
- `cropLeft`/`cropRight`/`cropTop`/`cropBottom` in a scene item transform
  crops just that one instance. Prefer this for one-off framing.

## Image mask and blend

`mask_filter_v2`

```json
{
  "type": "mask_color_filter.effect",
  "image_path": "/abs/path/mask.png",
  "color": 16777215,
  "opacity": 1,
  "stretch": true
}
```

- `type` is a literal effect filename. `"mask_color_filter.effect"` for a
  black-and-white mask image (white = visible), `"mask_alpha_filter.effect"`
  for a mask that carries a real alpha channel.
- `color` is the channel treated as visible, `0xBBGGRR`; `16777215` is white.
- `stretch: true` scales the mask to the source; otherwise it tiles at its
  native size, so the mask should be authored at the source's native
  resolution.

This is the filter for non-rectangular sources: rounded corners, circular
webcams, device frames. See `recipes.md`.

## Scale, sharpness, delay

- `scale_filter`: `{"resolution":"None","sampling":"bicubic","undistort":false}`.
  `sampling` accepts `point`, `bilinear`, `bicubic`, `lanczos`, `area`.
  `resolution` is a string like `"1280x720"` or `"None"`.
- `sharpness_filter_v2`: `{"sharpness":0.08}`, range 0 to 1. Small values
  only; anything past 0.3 looks crunchy.
- `gpu_delay`: `{"delay_ms":0}` — delays video to line up with delayed audio.
- `hdr_tonemap_filter` — only relevant for HDR captures.
- `scroll_filter`: `{"speed_x":0,"speed_y":0,"limit_cx":false,"limit_cy":false,"loop":true}`
  with `cx`/`cy` as the limit sizes. Useful for credit rolls and tickers.

There is no blur filter in stock OBS. Blur, glow, outlines, drop shadows,
and rounded corners with feathering all need a plugin, usually
`obs-shaderfilter` or StreamFX. Check `GetSourceFilterKindList` before
promising the user a blur.

## Audio filters

- `gain_filter`: `{"db":0}`, -30 to 30
- `noise_suppress_filter_v2`: `{"method":"rnnoise","suppress_level":-30}`.
  `method` is `speex`, `rnnoise`, or `nvafx`. RNNoise is the good default;
  Speex is cheaper.
- `noise_gate_filter`: `{"open_threshold":-26,"close_threshold":-32,"attack_time":25,"hold_time":200,"release_time":150}`
- `compressor_filter`: `{"ratio":10,"threshold":-18,"attack_time":6,"release_time":60,"output_gain":0,"sidechain_source":"none"}`
- `limiter_filter`: `{"threshold":-6,"release_time":60}`
- `expander_filter`, `upward_compressor_filter`, `basic_eq_filter`,
  `invert_polarity_filter`, `async_delay_filter` (`{"delay_ms":0}`)

A serviceable voice chain, in this order: noise suppression, then noise
gate, then compressor, then gain.

## Plugin filters

Filter kinds from plugins appear in `GetSourceFilterKindList` alongside the
built-ins, and their settings are discoverable the same way with
`GetSourceFilterDefaultSettings`. Do not assume a plugin filter exists;
list the kinds first.
