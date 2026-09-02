# Scene item transforms

`SetSceneItemTransform {sceneName, sceneItemId, sceneItemTransform}`.
Partial objects are fine; unspecified fields keep their current value.

Read the current one first with `GetSceneItemTransform`, or take it from
`GetSceneItemList`, which includes every item's transform.

```json
{
  "positionX": 0,
  "positionY": 0,
  "rotation": 0,
  "scaleX": 1,
  "scaleY": 1,
  "alignment": 5,
  "boundsType": "OBS_BOUNDS_NONE",
  "boundsAlignment": 0,
  "boundsWidth": 0,
  "boundsHeight": 0,
  "cropLeft": 0,
  "cropRight": 0,
  "cropTop": 0,
  "cropBottom": 0,
  "cropToBounds": false
}
```

Read-only fields in the response: `sourceWidth`, `sourceHeight` (the
source's native size) and `width`, `height`. All four are `0` until the
source has rendered a frame.

`width`, `height`, `scaleX`, and `scaleY` do not account for bounds. A
1920x1080 source with `OBS_BOUNDS_SCALE_INNER` bounds of 5120x2880 renders
full-canvas but still reports `scaleX: 1` and `width: 1920`. Bounds are
applied at render time and are invisible in the transform response. Do not
read those fields back to check whether bounds took effect; take a
screenshot instead.

## Canvas coordinates

Origin is top-left. Get the canvas size from `GetVideoSettings`
(`baseWidth`, `baseHeight`) every time. It is often not 1920x1080; a
5120x2880 canvas is common on Retina setups, and hardcoded 1080p numbers
put sources in the wrong corner.

## Alignment

`alignment` is a bitmask describing which point of the source sits at
`positionX`/`positionY`:

| Value | Anchor |
| ----- | ------ |
| 0 | center |
| 1 | left |
| 2 | right |
| 4 | top |
| 8 | bottom |
| 5 | top-left (OBS default for new items) |
| 6 | top-right |
| 9 | bottom-left |
| 10 | bottom-right |

Centering something is `{"alignment": 0, "positionX": baseWidth/2, "positionY": baseHeight/2}`.

Pinning to the bottom-right corner with a 40px margin is
`{"alignment": 10, "positionX": baseWidth - 40, "positionY": baseHeight - 40}`.
Using corner alignment means the margin stays correct no matter how the
source is scaled, which is much less fragile than computing a top-left
position from the source's size.

## Bounds versus scale

`scaleX`/`scaleY` are multipliers on the native size. To use them you need
`sourceWidth`/`sourceHeight`, which may be `0`.

Bounds are better: define a target box and let OBS fit the source into it.

| `boundsType` | Behavior |
| ------------ | -------- |
| `OBS_BOUNDS_NONE` | bounds ignored, use scale |
| `OBS_BOUNDS_SCALE_INNER` | fit inside the box, preserve aspect (letterbox) |
| `OBS_BOUNDS_SCALE_OUTER` | cover the box, preserve aspect (overflow) |
| `OBS_BOUNDS_STRETCH` | fill the box exactly, distort aspect |
| `OBS_BOUNDS_SCALE_TO_WIDTH` | match box width |
| `OBS_BOUNDS_SCALE_TO_HEIGHT` | match box height |
| `OBS_BOUNDS_MAX_ONLY` | shrink to fit, never enlarge |

`boundsAlignment` uses the same bitmask as `alignment` and positions the
source within the bounds box when there is leftover space.

Fill the canvas without distortion, cropping the overflow:

```json
{
  "alignment": 0,
  "positionX": 2560,
  "positionY": 1440,
  "boundsType": "OBS_BOUNDS_SCALE_OUTER",
  "boundsAlignment": 0,
  "boundsWidth": 5120,
  "boundsHeight": 2880
}
```

Swap to `OBS_BOUNDS_SCALE_INNER` to see the whole source with bars, or add
`"cropToBounds": true` to hard-clip the overflow rather than let it render
outside the box.

## Crop

`cropLeft`, `cropRight`, `cropTop`, `cropBottom` are in source pixels and
are applied before scaling and bounds. This is the per-instance crop; the
`crop_filter` in `filters.md` is the per-source one.

To crop a 16:9 webcam into a square, crop equal amounts off the left and
right: `(sourceWidth - sourceHeight) / 2` on each side. This needs
`sourceWidth`, so read the transform after the source has warmed up.

## Rotation

`rotation` is degrees clockwise, and rotates around the `alignment`
anchor. Rotating something that is anchored top-left swings it out of
frame; set `alignment: 0` first if you want it to spin in place.

## Layer order

Layer order is not part of the transform. Use
`SetSceneItemIndex {sceneName, sceneItemId, sceneItemIndex}`. Index 0 is
the bottom layer and the highest index is on top, the reverse of how the
list reads in the OBS UI. New items are appended at the top.

To send a background to the back, set its index to 0. To bring an overlay
to the front, set its index to `itemCount - 1`. Indices of the other items
shift to accommodate, so re-read `GetSceneItemList` before the next move.
