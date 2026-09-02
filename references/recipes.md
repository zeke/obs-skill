# Recipes

Working sequences for common requests. Substitute real scene names, input
names, and scene item IDs from `--state`, and real canvas dimensions from
`GetVideoSettings`. The examples assume a 1920x1080 canvas.

## Webcam with greenscreen and a contrast bump

```sh
S=<skill-directory>/scripts/obs.mjs

# create with empty settings so the device list can be read
node $S CreateInput '{"sceneName":"Main","inputName":"Webcam","inputKind":"av_capture_input_v2","inputSettings":{}}'
node $S GetInputPropertiesListPropertyItems '{"inputName":"Webcam","propertyName":"uid"}'

node $S --batch <<'EOF'
[
  {"requestType":"SetInputSettings","requestData":{"inputName":"Webcam","inputSettings":{"uid":"<itemValue from above>"},"overlay":true}},
  {"requestType":"CreateSourceFilter","requestData":{"sourceName":"Webcam","filterName":"Chroma Key","filterKind":"chroma_key_filter_v2","filterSettings":{"key_color_type":"green","similarity":400,"smoothness":80,"spill":100}}},
  {"requestType":"CreateSourceFilter","requestData":{"sourceName":"Webcam","filterName":"Color Correction","filterKind":"color_filter_v2","filterSettings":{"contrast":0.25,"saturation":0.15}}}
]
EOF
```

Then screenshot the input on its own to tune the key without the rest of
the scene in the way:

```sh
node $S SaveSourceScreenshot '{"sourceName":"Webcam","imageFormat":"png","imageFilePath":"/tmp/cam.png","imageWidth":640}'
```

Cameras need a moment to start, and report `sourceWidth: 0` until they do.
If the screenshot is blank, wait a second and retry.

## Picture-in-picture webcam, bottom right

```json
{
  "requestType": "SetSceneItemTransform",
  "requestData": {
    "sceneName": "Main",
    "sceneItemId": 3,
    "sceneItemTransform": {
      "alignment": 10,
      "positionX": 1880,
      "positionY": 1040,
      "boundsType": "OBS_BOUNDS_SCALE_INNER",
      "boundsAlignment": 10,
      "boundsWidth": 480,
      "boundsHeight": 270
    }
  }
}
```

Bottom-right alignment plus bounds means the 40px margin holds even if the
camera resolution changes.

## Full-bleed background image behind everything

```sh
node $S --batch <<'EOF'
[
  {"requestType":"CreateInput","requestData":{"sceneName":"Main","inputName":"Background","inputKind":"image_source","inputSettings":{"file":"/Users/you/Pictures/bg.jpg"}}},
  {"requestType":"SetSceneItemTransform","requestData":{"sceneName":"Main","sceneItemId":7,"sceneItemTransform":{"alignment":0,"positionX":960,"positionY":540,"boundsType":"OBS_BOUNDS_SCALE_OUTER","boundsAlignment":0,"boundsWidth":1920,"boundsHeight":1080}}},
  {"requestType":"SetSceneItemIndex","requestData":{"sceneName":"Main","sceneItemId":7,"sceneItemIndex":0}}
]
EOF
```

Use the `sceneItemId` that `CreateInput` returned. `SCALE_OUTER` fills the
canvas and crops the overflow instead of leaving bars.

## Adding a whole directory of images as layers

Loop in the shell, one `CreateInput` per file, using the filename as the
input name. Check the existing `inputs` list from `--state` first and skip
names that already exist, or `CreateInput` will fail with code 601.

Give them all a fit transform and then hide all but one with
`SetSceneItemEnabled`, so the user can flip between them.

## Video clip that loops in the background

```json
{
  "requestType": "CreateInput",
  "requestData": {
    "sceneName": "Main",
    "inputName": "Loop",
    "inputKind": "ffmpeg_source",
    "inputSettings": {
      "local_file": "/Users/you/Movies/loop.mp4",
      "is_local_file": true,
      "looping": true,
      "restart_on_activate": false,
      "hw_decode": true
    }
  }
}
```

Mute it unless the audio is wanted: `SetInputMute {"inputName":"Loop","inputMuted":true}`.

For a stinger or intro clip, use `restart_on_activate: true` and
`clear_on_media_end: true` instead.

## Lower third

Two items: a color source bar and a text source on top of it.

```sh
node $S --batch <<'EOF'
[
  {"requestType":"CreateInput","requestData":{"sceneName":"Main","inputName":"LT Bar","inputKind":"color_source_v3","inputSettings":{"color":3204448256,"width":900,"height":120}}},
  {"requestType":"CreateInput","requestData":{"sceneName":"Main","inputName":"LT Text","inputKind":"text_ft2_source_v2","inputSettings":{"text":"Zeke Sikelianos","font":{"face":"Helvetica","size":56,"style":"Bold","flags":0},"color1":4294967295,"color2":4294967295}}}
]
EOF
```

`3204448256` is `0xBF000000`, black at 75% alpha. Position the bar at
`{"alignment":9,"positionX":80,"positionY":1000}` (bottom-left anchor) and
the text just inside it. Then group the intent by setting the text's index
above the bar's.

## Circular or rounded webcam

Author a mask PNG at the camera's native resolution: white where the image
should show, black elsewhere. Then:

```json
{
  "requestType": "CreateSourceFilter",
  "requestData": {
    "sourceName": "Webcam",
    "filterName": "Circle Mask",
    "filterKind": "mask_filter_v2",
    "filterSettings": {
      "type": "mask_color_filter.effect",
      "image_path": "/Users/you/obs/circle-mask.png",
      "color": 16777215,
      "opacity": 1,
      "stretch": true
    }
  }
}
```

`stretch: true` lets a mask of any size work, but a mask authored at a
different aspect ratio than the source will distort the shape. For a
perfect circle, either crop the source to square first (transform crop) or
author the mask at the source's exact resolution.

## Device-frame overlay (webcam inside a phone shell)

Three pieces:

1. A frame PNG: the device bezel, opaque, with both the screen interior
   and the surrounding background fully transparent. Add it as an
   `image_source` and give it the higher `sceneItemIndex` so it renders
   on top.
2. A mask PNG derived from the frame: white in the screen hole, black
   elsewhere, cropped to the hole's bounding box and resized to the
   camera's native capture resolution. Apply it to the camera as
   `mask_filter_v2` with `type: "mask_color_filter.effect"`.
3. A transform on the camera that places it exactly in the hole. Compute
   the hole rectangle in canvas coordinates from the frame item's current
   transform (`positionX/Y` plus the hole's bbox in source pixels times
   `scaleX/Y`), then set the camera to
   `{"boundsType":"OBS_BOUNDS_STRETCH","boundsWidth":<w>,"boundsHeight":<h>,"positionX":<x>,"positionY":<y>,"alignment":5}`.

`OBS_BOUNDS_STRETCH` guarantees an exact fill regardless of aspect
mismatch. The two items do not follow each other: if the frame is moved or
rescaled, recompute and reapply the camera transform.

To find the screen hole in the frame PNG programmatically, flood-fill the
transparent regions and pick the connected region that does not touch the
canvas border. That is the enclosed screen, not the outer background.

## Duplicating a scene as a variant

There is no `DuplicateScene` request. Create a new scene, then
`CreateSceneItem` for each source from the original (which shares the
sources rather than copying them), then reapply each transform from the
original's `GetSceneItemList`. Copy the transforms verbatim; do not
recompute them.

If the variant needs different filters on a shared source, that source has
to be duplicated with `DuplicateSceneItem` instead, since filters live on
the source.

## Screenshotting for verification

```sh
node $S SaveSourceScreenshot \
  '{"sourceName":"Main","imageFormat":"png","imageFilePath":"/tmp/obs-check.png","imageWidth":1280}'
```

Then read `/tmp/obs-check.png`. This works with OBS in the background and
is the fastest way to close the loop on a visual change. Use a modest
`imageWidth` (640-1280); the cap is 4096 and full-resolution screenshots of
a large canvas are slow and wasteful.

Screenshot a single input rather than the scene when isolating a problem
with one source.
