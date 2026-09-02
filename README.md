# obs-skill

An agent skill for controlling OBS Studio with natural language.

Start a session in your coding agent, point it at a running OBS, and ask
for what you want:

> add my webcam to the current scene with a greenscreen filter and bump the contrast

> put desert.jpeg behind everything and make it fill the canvas

> the phone camera is too far left, nudge it into the frame

> take a screenshot so I can see what it looks like

The agent talks to OBS through its built-in WebSocket server, makes the
change, screenshots the result, looks at it, and adjusts. No clicking
through the properties dialog.

## Install

```sh
npx skills add zeke/obs-skill --global --yes
```

## Requirements

- OBS Studio 28 or newer, with the WebSocket server enabled under
  Tools > WebSocket Server Settings
- Node.js 22 or newer

No npm dependencies. The client is a single file using Node's built-in
WebSocket.

## Why it exists

OBS's WebSocket API is complete but its setting keys are almost entirely
undocumented, inconsistently versioned, and different on every platform.
An agent left to guess will invent plausible key names that OBS silently
ignores. This skill supplies the keys that actually work, the value ranges
that actually look good, and a screenshot loop so the agent can check its
own work.

## Contributing

Every real session tends to surface something new: a filter setting that
does not behave the way its name suggests, a camera that needs a specific
device property, a value that works better in practice than the default.
Pull requests with those findings are the point of this repo. Include your
OBS version and platform, and the exact request payload that worked.

Technical notes for working on this repo are in [AGENTS.md](AGENTS.md).
