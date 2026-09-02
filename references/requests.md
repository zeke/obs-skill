# Request types by task

Full protocol: <https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md>

`GetVersion` returns `availableRequests`, the authoritative list for the
connected instance.

Most requests that take a `sceneName`, `inputName`, or `sourceName` also
accept a `*Uuid` variant. UUIDs survive renames, so prefer them when doing
multi-step work on something whose name you might change.

## Inspecting

| Request | Notes |
| ------- | ----- |
| `GetVersion` | OBS version, platform, `availableRequests`, `supportedImageFormats` |
| `GetVideoSettings` | `baseWidth`/`baseHeight` are the canvas; `outputWidth`/`outputHeight` the encode size |
| `GetSceneList` | all scenes plus `currentProgramSceneName` |
| `GetSceneItemList` `{sceneName}` | items with IDs, indices, transforms, blend modes |
| `GetSceneItemId` `{sceneName, sourceName}` | takes optional `searchOffset` when a source appears twice |
| `GetInputList` `{inputKind?}` | every input in the scene collection |
| `GetInputSettings` `{inputName}` | only returns non-default values |
| `GetInputDefaultSettings` `{inputKind}` | every key with its default; use this to learn key names |
| `GetSourceFilterList` `{sourceName}` | filters in render order |
| `GetSourceFilterDefaultSettings` `{filterKind}` | same trick as above for filters |
| `GetInputKindList`, `GetSourceFilterKindList`, `GetTransitionKindList` | what this install supports |
| `GetSpecialInputs` | the global desktop audio / mic inputs |
| `GetMonitorList` | displays, for display capture |
| `GetSourceActive` `{sourceName}` | whether it is showing in program |

## Scenes

- `CreateScene` `{sceneName}`
- `RemoveScene` `{sceneName}`
- `SetSceneName` `{sceneName, newSceneName}`
- `SetCurrentProgramScene` `{sceneName}`
- `SetCurrentPreviewScene` `{sceneName}` (studio mode only)
- `GetSceneCollectionList`, `SetCurrentSceneCollection` `{sceneCollectionName}`

## Sources and scene items

- `CreateInput` `{sceneName, inputName, inputKind, inputSettings?, sceneItemEnabled?}` → `{inputUuid, sceneItemId}`
- `CreateSceneItem` `{sceneName, sourceName, sceneItemEnabled?}` → `{sceneItemId}`, reuses an existing source
- `DuplicateSceneItem` `{sceneName, sceneItemId, destinationSceneName?}` — makes a copy of the source, not a reference
- `RemoveInput` `{inputName}` — deletes the source from every scene
- `RemoveSceneItem` `{sceneName, sceneItemId}` — removes it from one scene only
- `SetInputName` `{inputName, newInputName}`
- `SetInputSettings` `{inputName, inputSettings, overlay?}` — `overlay: true` (default) merges; `false` resets unspecified keys to defaults
- `SetSceneItemEnabled` `{sceneName, sceneItemId, sceneItemEnabled}` — show/hide
- `SetSceneItemLocked` `{sceneName, sceneItemId, sceneItemLocked}`
- `SetSceneItemIndex` `{sceneName, sceneItemId, sceneItemIndex}` — higher is on top
- `SetSceneItemTransform` `{sceneName, sceneItemId, sceneItemTransform}` — see `transforms.md`
- `SetSceneItemBlendMode` `{sceneName, sceneItemId, sceneItemBlendMode}` — `OBS_BLEND_NORMAL`, `ADDITIVE`, `SUBTRACT`, `SCREEN`, `MULTIPLY`, `LIGHTEN`, `DARKEN`
- `GetGroupList`, `GetGroupSceneItemList` `{sceneName}` — groups behave like scenes for item requests

Dynamic device lists (cameras, displays, audio devices) come from
`GetInputPropertiesListPropertyItems` `{inputName, propertyName}`. The
input must already exist, so create it with empty settings first, list the
devices, then `SetInputSettings`. Buttons in a source's properties dialog,
like the browser source reload, are triggered with
`PressInputPropertiesButton` `{inputName, propertyName}` (`refreshnocache`).

## Filters

- `CreateSourceFilter` `{sourceName, filterName, filterKind, filterSettings?}`
- `RemoveSourceFilter` `{sourceName, filterName}`
- `SetSourceFilterName` `{sourceName, filterName, newFilterName}`
- `SetSourceFilterEnabled` `{sourceName, filterName, filterEnabled}`
- `SetSourceFilterSettings` `{sourceName, filterName, filterSettings, overlay?}`
- `SetSourceFilterIndex` `{sourceName, filterName, filterIndex}` — filters apply bottom-up by index

`filterName` is a free-text label you choose; `filterKind` is the internal
type. Filters attach to the source, so they apply everywhere that source
appears. To filter one instance only, put the source in its own scene and
filter the nested scene item, or use a `crop_filter` on the scene item.

## Audio

- `SetInputMute` `{inputName, inputMuted}`, `ToggleInputMute` `{inputName}`
- `SetInputVolume` `{inputName, inputVolumeDb}` or `{inputVolumeMul}` — dB range is -100 to 26
- `SetInputAudioBalance` `{inputName, inputAudioBalance}` — 0 to 1, 0.5 centered
- `SetInputAudioSyncOffset` `{inputName, inputAudioSyncOffsetMs}`
- `SetInputAudioMonitorType` `{inputName, monitorType}` — `OBS_MONITORING_TYPE_NONE`, `MONITOR_ONLY`, `MONITOR_AND_OUTPUT`
- `SetInputAudioTracks` `{inputName, inputAudioTracks}`

## Output

- `StartStream`, `StopStream`, `ToggleStream`, `GetStreamStatus`
- `StartRecord`, `StopRecord`, `ToggleRecord`, `PauseRecord`, `ResumeRecord`, `GetRecordStatus`
- `SplitRecordFile`, `CreateRecordChapter` `{chapterName?}`
- `StartVirtualCam`, `StopVirtualCam`, `ToggleVirtualCam`, `GetVirtualCamStatus`
- `StartReplayBuffer`, `SaveReplayBuffer`, `GetLastReplayBufferReplay`
- `GetRecordDirectory`, `SetRecordDirectory` `{recordDirectory}`

## Screenshots

- `SaveSourceScreenshot` `{sourceName, imageFormat, imageFilePath, imageWidth?, imageHeight?, imageCompressionQuality?}`
- `GetSourceScreenshot` — same fields minus the path, returns base64 in `imageData`

Prefer `SaveSourceScreenshot`: writing to a file avoids dumping a large
base64 blob into the session, and the image can then be read directly.
Dimensions are clamped to 4096 and treated as scale-to-inner.

## Transitions and studio mode

- `SetCurrentSceneTransition` `{transitionName}`
- `SetCurrentSceneTransitionDuration` `{transitionDuration}` (ms)
- `SetCurrentSceneTransitionSettings` `{transitionSettings, overlay?}`
- `SetSceneSceneTransitionOverride` `{sceneName, transitionName?, transitionDuration?}`
- `SetStudioModeEnabled` `{studioModeEnabled}`, `TriggerStudioModeTransition`

## Media sources

- `GetMediaInputStatus` `{inputName}` — duration and cursor in ms
- `TriggerMediaInputAction` `{inputName, mediaAction}` — `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY`, `PAUSE`, `STOP`, `RESTART`, `NEXT`, `PREVIOUS`
- `SetMediaInputCursor` `{inputName, mediaCursor}`, `OffsetMediaInputCursor` `{inputName, mediaCursorOffset}`

## Escape hatches

- `TriggerHotkeyByName` `{hotkeyName}` — `GetHotkeyList` for the names. Reaches features with no API request.
- `CallVendorRequest` `{vendorName, requestType, requestData?}` — plugin-specific APIs.
- `OpenInputPropertiesDialog`, `OpenInputFiltersDialog`, `OpenSourceProjector` — hand off to the GUI when a setting genuinely needs a human.
- `Sleep` `{sleepMillis}` or `{sleepFrames}` — only valid inside a real protocol request batch (op 8), not in this script's sequential mode. Use a shell `sleep` between calls instead.
