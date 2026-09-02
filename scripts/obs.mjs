#!/usr/bin/env node
// Minimal obs-websocket v5 client. No dependencies: uses Node's built-in
// WebSocket (Node 22+) and node:crypto for the auth handshake.
//
// Usage:
//   node obs.mjs <RequestType> [requestDataJson]
//   node obs.mjs --state
//   echo '[{"requestType":"GetSceneList"}]' | node obs.mjs --batch
//
// Env: OBS_URL (default ws://127.0.0.1:4455), OBS_PASSWORD.
// If OBS_PASSWORD is unset, the local obs-websocket config file is read.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_URL = "ws://127.0.0.1:4455";

function configPath() {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData/Roaming");
    return path.join(appData, "obs-studio/plugin_config/obs-websocket/config.json");
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");
  return path.join(xdg, "obs-studio/plugin_config/obs-websocket/config.json");
}

function localConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return null;
  }
}

function resolveConnection() {
  const cfg = localConfig();
  let url = process.env.OBS_URL?.trim();
  if (!url && cfg?.server_port) url = `ws://127.0.0.1:${cfg.server_port}`;
  let password = process.env.OBS_PASSWORD;
  if (password === undefined && cfg?.auth_required) password = cfg.server_password;
  return { url: url || DEFAULT_URL, password: password ?? "" };
}

function authString(password, salt, challenge) {
  const secret = crypto.createHash("sha256").update(password + salt).digest("base64");
  return crypto.createHash("sha256").update(secret + challenge).digest("base64");
}

export function callObs(calls, conn = resolveConnection()) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(conn.url);
    const results = [];
    let i = 0;

    const next = () => {
      if (i >= calls.length) {
        ws.close();
        resolve(results);
        return;
      }
      const call = calls[i];
      ws.send(JSON.stringify({
        op: 6,
        d: {
          requestType: call.requestType,
          requestId: String(i),
          requestData: call.requestData ?? {},
        },
      }));
    };

    ws.onerror = () => reject(new Error(`Could not reach OBS at ${conn.url}. Is OBS running with Tools > WebSocket Server Settings enabled?`));

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.op === 0) {
        const d = { rpcVersion: msg.d.rpcVersion ?? 1 };
        if (msg.d.authentication) {
          d.authentication = authString(conn.password, msg.d.authentication.salt, msg.d.authentication.challenge);
        }
        ws.send(JSON.stringify({ op: 1, d }));
      } else if (msg.op === 2) {
        next();
      } else if (msg.op === 7) {
        results.push({
          requestType: msg.d.requestType,
          ok: msg.d.requestStatus.result,
          code: msg.d.requestStatus.code,
          error: msg.d.requestStatus.comment,
          data: msg.d.responseData,
        });
        i += 1;
        next();
      }
    };
  });
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function stateCalls() {
  const base = await callObs([
    { requestType: "GetVersion" },
    { requestType: "GetVideoSettings" },
    { requestType: "GetSceneList" },
    { requestType: "GetInputList" },
    { requestType: "GetStreamStatus" },
    { requestType: "GetRecordStatus" },
  ]);

  const [version, video, scenes, inputs, stream, record] = base.map((r) => r.data ?? {});
  const sceneNames = (scenes.scenes ?? []).map((s) => s.sceneName);
  const itemResults = await callObs(
    sceneNames.map((sceneName) => ({ requestType: "GetSceneItemList", requestData: { sceneName } }))
  );

  return {
    obsVersion: version.obsVersion,
    obsWebSocketVersion: version.obsWebSocketVersion,
    platform: version.platformDescription,
    supportedImageFormats: version.supportedImageFormats,
    canvas: { width: video.baseWidth, height: video.baseHeight },
    output: { width: video.outputWidth, height: video.outputHeight },
    fps: video.fpsNumerator / video.fpsDenominator,
    currentProgramScene: scenes.currentProgramSceneName,
    currentPreviewScene: scenes.currentPreviewSceneName,
    scenes: sceneNames,
    sceneItems: Object.fromEntries(
      sceneNames.map((name, idx) => [
        name,
        (itemResults[idx].data?.sceneItems ?? []).map((item) => ({
          id: item.sceneItemId,
          index: item.sceneItemIndex,
          source: item.sourceName,
          kind: item.inputKind ?? item.sourceType,
          enabled: item.sceneItemEnabled,
          locked: item.sceneItemLocked,
        })),
      ])
    ),
    inputs: (inputs.inputs ?? []).map((input) => ({ name: input.inputName, kind: input.inputKind })),
    streaming: stream.outputActive,
    recording: record.outputActive,
  };
}

async function main() {
  const argv = process.argv.slice(2);

  if (!argv.length || argv[0] === "--help" || argv[0] === "-h") {
    console.log([
      "Usage:",
      "  node obs.mjs <RequestType> [requestDataJson]",
      "  node obs.mjs --state",
      "  node obs.mjs --batch  (reads a JSON array of {requestType,requestData} on stdin)",
    ].join("\n"));
    return;
  }

  if (argv[0] === "--state") {
    console.log(JSON.stringify(await stateCalls(), null, 2));
    return;
  }

  const calls = argv[0] === "--batch"
    ? JSON.parse(await readStdin())
    : [{ requestType: argv[0], requestData: argv[1] ? JSON.parse(argv[1]) : {} }];

  const results = await callObs(calls);
  const failed = results.filter((r) => !r.ok);

  for (const result of results) {
    if (result.ok) {
      const body = result.data && Object.keys(result.data).length ? JSON.stringify(result.data, null, 2) : "ok";
      console.log(`${result.requestType}: ${body}`);
    } else {
      console.error(`${result.requestType}: FAILED (${result.code}) ${result.error ?? ""}`);
    }
  }

  if (failed.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
