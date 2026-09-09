import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { callerBaseUrl } from "../src/caller-auth.mjs";
import {
  APPLY_PATCH_TOOL_NAME,
  GROK_APPLY_PATCH_CREATE_EXAMPLE,
  GROK_APPLY_PATCH_GUIDANCE_MARKER,
  GROK_APPLY_PATCH_UPDATE_EXAMPLE,
} from "../src/grok-apply-patch-guidance.mjs";
import { spawnableCommand } from "../src/spawnable-command.mjs";
import { GROK_STRUCTURED_PATCH_CODEC, serializeStructuredPatch } from "../src/grok-structured-patch.mjs";
import { routedModel } from "../src/catalog.mjs";
import { MODEL_BY_SLUG } from "../src/model-registry.mjs";

const structured = process.argv.includes("--structured");
const codexBinary = process.argv.find((arg) => arg.startsWith("--codex="))?.slice("--codex=".length);
if (codexBinary && !structured) throw new Error("--codex requires --structured");
const nativeFault = process.argv.find((arg) => arg.startsWith("--native-fault="))?.slice("--native-fault=".length);
if (nativeFault && (!codexBinary || !["disconnect", "duplicate-close", "invalid-arguments"].includes(nativeFault))) {
  throw new Error("--native-fault=disconnect|duplicate-close|invalid-arguments requires --codex");
}
const structuredOperations = { operations: [{ op: "add", path: 'café "quotes".txt', lines: ["hello “unicode”"] }] };
let nativeRecoveryProbe;

const python = process.argv[2] || process.env.LITELLM_PYTHON;
if (!python) {
  throw new Error(
    "usage: node scripts/verify-grok-apply-patch-guidance.mjs <venv-python>",
  );
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CALLER_KEY = "test-router-caller-capability-with-sufficient-length";
const INTERNAL_KEY = "test-internal-service-key-with-sufficient-length";
const LITELLM_HEALTH_MS = 300_000;
const SERVICE_HEALTH_MS = 15_000;

const V4A_GRAMMAR = [
  "start: begin_patch hunk+ end_patch",
  'begin_patch: "*** Begin Patch" LF',
  'end_patch: "*** End Patch" LF?',
  "",
  "hunk: add_hunk | delete_hunk | update_hunk",
  'add_hunk: "*** Add File: " filename LF add_line+',
  'delete_hunk: "*** Delete File: " filename LF',
  'update_hunk: "*** Update File: " filename LF change_move? change?',
  "filename: /(.+)/",
  'add_line: "+" /(.+)/ LF -> line',
  'change_move: "*** Move to: " filename LF',
  "change: (change_context | change_line)+ eof_line?",
  'change_context: ("@@" | "@@ " /(.+)/) LF',
  'change_line: ("+" | "-" | " ") /(.+)/ LF',
  'eof_line: "*** End of File" LF',
  "%import common.LF",
].join("\n");

const HISTORY_PATCH = [
  "*** Begin Patch",
  "*** Add File: seed.txt",
  "+before",
  "*** End Patch",
].join("\n");

const UNICODE_PATCH = [
  "*** Begin Patch",
  '*** Add File: café "quotes".txt',
  "+hello “unicode”",
  "*** End Patch",
].join("\n");

const MALFORMED_PATCH = "*** Begin Patch\nnot-a-json-object";

const children = [];
const workspace = mkdtempSync(path.join(os.tmpdir(), "grok-apply-patch-guidance-"));
const capturedGrok = [];
let cancelStreamClosed;

function redact(text) {
  return String(text || "")
    .replaceAll(CALLER_KEY, "[caller-key]")
    .replaceAll(INTERNAL_KEY, "[internal-key]")
    .replaceAll("fake-access", "[session-key]");
}

function sse(events) {
  return `${events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;
}

async function openPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function spawnChild(command, args, env, { detached = false } = {}) {
  const spawnable = spawnableCommand(command, args);
  const child = spawn(spawnable.command, spawnable.args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached,
    ...spawnable.options,
  });
  let output = "";
  const collect = (chunk) => {
    output = (output + redact(chunk.toString("utf8"))).slice(-128 * 1024);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.testOutput = () => output;
  children.push(child);
  return child;
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => resolve();
    child.once("exit", done);
    if (process.platform === "win32") {
      spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
    } else if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already gone
      }
    }, 5_000).unref();
  });
}

async function waitHttp(url, child, { headers = {}, timeoutMs = SERVICE_HEALTH_MS } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`exited before ${url}: ${child.testOutput()}`);
    }
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // not bound yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timeout waiting for ${url}: ${child?.testOutput?.() || ""}`);
}

function itemsByCallId(sseBody) {
  const byCallId = new Map();
  for (const line of sseBody.split(/\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    const item = event.item;
    if (item?.call_id) byCallId.set(item.call_id, item);
  }
  return byCallId;
}

function larkFence(description) {
  const match = String(description || "").match(/Format:\n```lark\n([\s\S]*?)\n```/);
  return match ? match[1] : undefined;
}

function applyPatchRequest({ historyInput, historyId }) {
  return {
    model: "grok-oauth/grok-4.6",
    stream: true,
    input: [
      { type: "message", role: "user", content: [{ type: "input_text", text: "patch notes" }] },
      {
        type: "custom_tool_call",
        id: historyId,
        call_id: "call_history",
        name: APPLY_PATCH_TOOL_NAME,
        input: historyInput,
      },
      { type: "custom_tool_call_output", call_id: "call_history", output: "Done!" },
    ],
    tools: [
      {
        type: "custom",
        name: APPLY_PATCH_TOOL_NAME,
        description: "Apply a patch.",
        format: { type: "grammar", syntax: "lark", definition: V4A_GRAMMAR },
      },
      {
        type: "function",
        name: APPLY_PATCH_TOOL_NAME,
        description: "ordinary same-name function",
        parameters: { type: "object", properties: { path: { type: "string" } } },
      },
      {
        type: "function",
        name: "read_file",
        description: "unrelated ordinary function",
        parameters: { type: "object", properties: { path: { type: "string" } } },
      },
    ],
  };
}

function mockFunctionCall(callId, argumentsText, name = APPLY_PATCH_TOOL_NAME) {
  return sse([
    {
      type: "response.output_item.added",
      item: {
        type: "function_call",
        id: `fc_${callId}`,
        call_id: callId,
        name,
      },
    },
    ...[argumentsText.slice(0, 13), argumentsText.slice(13, 29), argumentsText.slice(29)].map((delta) => ({
      type: "response.function_call_arguments.delta",
      item_id: `fc_${callId}`,
      delta,
    })),
    {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        id: `fc_${callId}`,
        call_id: callId,
        name,
        arguments: argumentsText,
      },
    },
    { type: "response.completed", response: { usage: { input_tokens: 12, output_tokens: 9 } } },
  ]);
}

const mockXai = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  capturedGrok.push({
    authorizationPresent: Boolean(request.headers.authorization),
    body,
  });
  const structuredTool = body.tools?.find((tool) => tool.parameters?.properties?.operations);
  const toolName = structured ? structuredTool?.name : APPLY_PATCH_TOOL_NAME;
  if (nativeRecoveryProbe) {
    const probe = nativeRecoveryProbe;
    probe.requests += 1;
    if (probe.requests > (nativeFault === "invalid-arguments" ? 6 : 3) || !structuredTool) {
      response.writeHead(500);
      response.end("Unexpected native probe request");
      return;
    }
    const outputs = (body.input || []).filter((item) => item.type === "function_call_output" || item.type === "custom_tool_call_output");
    if (nativeFault === "invalid-arguments" && outputs.length > 0) probe.invalidArgumentFeedback = true;
    probe.contextFailure ||= outputs.some((item) => item.call_id === "call_native_missing" && /Failed to find expected lines/.test(String(item.output)));
    probe.successFeedback ||= outputs.some((item) => item.call_id === "call_native_repair" && /Success/.test(String(item.output)));
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    if (nativeFault === "invalid-arguments") {
      response.end(mockFunctionCall("call_invalid_native", '{"operations":[]}', toolName));
      return;
    }
    if (probe.requests < 3 && (!nativeFault || !probe.successFeedback)) {
      const operations = { operations: [{ op: "update", path: "fixture.txt", hunks: [{ lines: [
        { kind: "remove", text: !nativeFault && probe.requests === 1 ? "absent" : "old" },
        { kind: "add", text: nativeFault ? "old" : "new" },
        ...(nativeFault ? [{ kind: "add", text: "marker" }] : []),
      ] }] }] };
      const callId = !nativeFault && probe.requests === 1 ? "call_native_missing" : "call_native_repair";
      const argumentsText = JSON.stringify(operations);
      const wire = mockFunctionCall(callId, argumentsText, toolName);
      if (nativeFault && probe.requests === 1) {
        const terminalOffset = wire.indexOf("event: response.completed");
        assert.ok(terminalOffset > 0);
        const prefix = wire.slice(0, terminalOffset);
        if (nativeFault === "disconnect") {
          response.write(prefix);
          setTimeout(() => response.destroy(), 50);
        } else {
          const duplicate = sse([{ type: "response.output_item.done", item: {
            type: "function_call", id: `fc_${callId}`, call_id: callId, name: toolName, arguments: argumentsText,
          } }]).replace("data: [DONE]\n\n", "");
          response.end(prefix + duplicate + wire.slice(terminalOffset));
        }
      } else response.end(wire);
    } else {
      const item = { type: "message", id: "msg_native_final", role: "assistant", status: "completed", content: [{ type: "output_text", text: "probe complete", annotations: [] }] };
      response.end(sse([
        { type: "response.created", response: { id: "resp_native_final", status: "in_progress", output: [] } },
        { type: "response.output_item.added", output_index: 0, item },
        { type: "response.output_text.delta", item_id: item.id, output_index: 0, content_index: 0, delta: "probe complete" },
        { type: "response.output_item.done", output_index: 0, item },
        { type: "response.completed", response: { id: "resp_native_final", status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 1 } } },
      ]));
    }
    return;
  }
  const history = (body.input || []).find(
    (item) => item?.type === "function_call" && item.name === toolName,
  );
  const historyArgs = typeof history?.arguments === "string" ? history.arguments : "";
  if (structured && historyArgs.includes("CODEC_CANCEL_WIRE")) {
    cancelStreamClosed = new Promise((resolve) => response.once("close", resolve));
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(sse([
      { type: "response.output_item.added", item: { type: "function_call", id: "fc_cancel", call_id: "call_cancel", name: toolName, arguments: "" } },
      { type: "response.function_call_arguments.delta", item_id: "fc_cancel", delta: '{"operations":[' },
    ]).replace("data: [DONE]\n\n", ""));
    return;
  }
  if (structured && historyArgs.includes("CODEC_REJECT_WIRE")) {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end(mockFunctionCall("call_rejected", '{"operations":[]}', toolName));
    return;
  }
  const malformed = historyArgs.includes("not-a-json-object");
  const outgoingArgs = structured ? JSON.stringify(structuredOperations) : malformed ? historyArgs : JSON.stringify({ content: UNICODE_PATCH });
  const callId = malformed ? "call_malformed" : "call_unicode";
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  response.end(mockFunctionCall(callId, outgoingArgs, toolName));
});

try {
  await new Promise((resolve, reject) => {
    mockXai.once("error", reject);
    mockXai.listen(0, "127.0.0.1", resolve);
  });
  const xaiPort = mockXai.address().port;

  const grokPort = await openPort();
  const gatewayPort = await openPort();
  const routerPort = await openPort();
  const pythonDir = path.dirname(python);
  const litellmBin = path.join(
    pythonDir,
    process.platform === "win32" ? "litellm.exe" : "litellm",
  );
  assert.ok(existsSync(python), `venv python missing: ${python}`);
  assert.ok(existsSync(litellmBin), `litellm entry point missing: ${litellmBin}`);

  const authPath = path.join(workspace, "auth.json");
  writeFileSync(
    authPath,
    JSON.stringify({ "https://auth.x.ai::test-client-id": { key: "fake-access" } }),
    { mode: 0o600 },
  );
  const litellmConfig = path.join(workspace, "litellm.yaml");
  writeFileSync(
    litellmConfig,
    [
      "model_list:",
      '  - model_name: "grok-oauth-grok-4-6"',
      "    litellm_params:",
      '      model: "openai/grok-4.6"',
      "      api_base: os.environ/GROK_OAUTH_FORWARD_BASE_URL",
      '      api_key: "os.environ/CODEX_ROUTER_INTERNAL_KEY"',
      "      use_chat_completions_api: true",
      "      num_retries: 0",
      "",
      "litellm_settings:",
      "  drop_params: true",
      "  request_timeout: 60",
      "",
      "router_settings:",
      "  disable_cooldowns: true",
      "",
      "general_settings:",
      "  disable_spend_logs: true",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  const sharedEnv = {
    MODEL_ROUTER_TARGET: "codex",
    MODEL_ROUTER_QUIET: "1",
    MODEL_ROUTER_INTERNAL_KEY: INTERNAL_KEY,
    CODEX_ROUTER_INTERNAL_KEY: INTERNAL_KEY,
    CODEX_ROUTER_CALLER_KEY: CALLER_KEY,
    CODEX_ROUTER_GROK_PROGRESS_ONLY_RETRY: "0",
    CODEX_ROUTER_GROK_STRUCTURED_PATCH: structured ? "1" : "0",
    LITELLM_MASTER_KEY: INTERNAL_KEY,
    LITELLM_LOG: "ERROR",
    LITELLM_TELEMETRY: "False",
    LITELLM_LOCAL_MODEL_COST_MAP: "True",
    NO_COLOR: "1",
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    PATH: `${pythonDir}${path.delimiter}${process.env.PATH || ""}`,
  };

  const grokChild = spawnChild(
    process.execPath,
    [path.join(root, "src", "grok-oauth-forwarder.mjs")],
    {
      ...sharedEnv,
      MODEL_ROUTER_GROK_OAUTH_PORT: String(grokPort),
      GROK_CLI_CHAT_PROXY_BASE_URL: `http://127.0.0.1:${xaiPort}`,
      GROK_CLI: path.join(root, "test", "fixtures", "missing-grok-cli"),
      GROK_AUTH_PATH: authPath,
    },
  );
  await waitHttp(`http://127.0.0.1:${grokPort}/health`, grokChild, {
    headers: { Authorization: `Bearer ${INTERNAL_KEY}` },
  });

  const litellmChild = spawnChild(
    litellmBin,
    ["--config", litellmConfig, "--host", "127.0.0.1", "--port", String(gatewayPort)],
    {
      ...sharedEnv,
      GROK_OAUTH_FORWARD_BASE_URL: `http://127.0.0.1:${grokPort}/v1`,
    },
    { detached: process.platform !== "win32" },
  );
  await waitHttp(`http://127.0.0.1:${gatewayPort}/health/liveliness`, litellmChild, {
    timeoutMs: LITELLM_HEALTH_MS,
  });

  const stateDir = path.join(workspace, "state");
  const codexHome = path.join(workspace, "codex-home");
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  writeFileSync(
    path.join(stateDir, "enabled-providers.json"),
    `${JSON.stringify({ version: 1, providers: ["grok-oauth"] }, null, 2)}\n`,
    { mode: 0o600 },
  );
  const routerChild = spawnChild(process.execPath, [path.join(root, "src", "router.mjs")], {
    ...sharedEnv,
    MODEL_ROUTER_STATE_DIR: stateDir,
    CODEX_ROUTER_STATE_DIR: stateDir,
    CODEX_HOME: codexHome,
    CODEX_ROUTER_PORT: String(routerPort),
    CODEX_ROUTER_GATEWAY_BASE_URL: `http://127.0.0.1:${gatewayPort}/v1`,
    CODEX_ROUTER_GATEWAY_HEALTH_URL: `http://127.0.0.1:${gatewayPort}/health/liveliness`,
    CODEX_ROUTER_GROK_OAUTH_HEALTH_URL: `http://127.0.0.1:${grokPort}/health`,
    MODEL_ROUTER_GROK_OAUTH_PORT: String(grokPort),
  });
  await waitHttp(`http://127.0.0.1:${routerPort}/health`, routerChild);

  const routerUrl = `${callerBaseUrl(routerPort, CALLER_KEY)}/responses`;

  async function postTurn(payload) {
    const response = await fetch(routerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CALLER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    });
    const body = await response.text();
    assert.equal(response.status, 200, redact(body));
    return body;
  }

  const unicodeBody = await postTurn(
    applyPatchRequest({ historyInput: HISTORY_PATCH, historyId: "ctc_history" }),
  );
  assert.equal(capturedGrok.length, 1);
  const grokRequest = capturedGrok[0].body;
  const grokTools = grokRequest.tools || [];
  const grokApply = grokTools.filter((tool) => structured
    ? tool.parameters?.properties?.operations
    : tool.type === "function" && tool.name === APPLY_PATCH_TOOL_NAME);
  assert.equal(grokApply.length, 1);
  assert.equal(grokApply[0].description.includes("Apply a patch."), true);
  if (structured) {
    assert.deepEqual(grokApply[0].parameters, GROK_STRUCTURED_PATCH_CODEC.parameters);
    assert.notEqual(grokApply[0].name, APPLY_PATCH_TOOL_NAME);
    const ordinary = grokTools.find((tool) => tool.name === APPLY_PATCH_TOOL_NAME);
    assert.equal(ordinary?.description, "ordinary same-name function");
    assert.deepEqual(ordinary.parameters.properties, { path: { type: "string" } });
  } else {
    assert.equal(grokApply[0].description.includes(GROK_APPLY_PATCH_GUIDANCE_MARKER), true);
    assert.equal(grokApply[0].description.includes(GROK_APPLY_PATCH_CREATE_EXAMPLE), true);
    assert.equal(grokApply[0].description.includes(GROK_APPLY_PATCH_UPDATE_EXAMPLE), true);
    assert.equal(larkFence(grokApply[0].description), V4A_GRAMMAR);
    assert.deepEqual(grokApply[0].parameters?.required, ["content"]);
    assert.equal(grokApply[0].parameters?.properties?.path, undefined);
  }
  const readFile = grokTools.find((tool) => tool.type === "function" && tool.name === "read_file");
  assert.equal(readFile?.description, "unrelated ordinary function");
  assert.equal(String(readFile?.description || "").includes(GROK_APPLY_PATCH_GUIDANCE_MARKER), false);

  const historyCall = (grokRequest.input || []).find(
    (item) => item?.type === "function_call" && item.call_id === "call_history",
  );
  assert.ok(historyCall, "history call_id must survive LiteLLM and the Grok forwarder");
  assert.equal(historyCall.name, grokApply[0].name);
  assert.deepEqual(JSON.parse(historyCall.arguments), structured ? { input: HISTORY_PATCH } : { content: HISTORY_PATCH });
  const historyResult = (grokRequest.input || []).find(
    (item) => item?.type === "function_call_output" && item.call_id === "call_history",
  );
  assert.equal(historyResult?.output, "Done!");

  const unicodeItem = itemsByCallId(unicodeBody).get("call_unicode");
  assert.equal(unicodeItem?.type, "custom_tool_call");
  assert.equal(unicodeItem.input, structured ? serializeStructuredPatch(structuredOperations) : UNICODE_PATCH);

  const malformedBody = await postTurn(
    applyPatchRequest({ historyInput: MALFORMED_PATCH, historyId: "ctc_malformed" }),
  );
  assert.equal(capturedGrok.length, 2);
  const malformedHistory = (capturedGrok[1].body.input || []).find(
    (item) => item?.type === "function_call" && item.call_id === "call_history",
  );
  assert.deepEqual(JSON.parse(malformedHistory.arguments), structured ? { input: MALFORMED_PATCH } : { content: MALFORMED_PATCH });
  const malformedItem = itemsByCallId(malformedBody).get("call_malformed");
  assert.equal(malformedItem?.type, "custom_tool_call");
  assert.equal(malformedItem.input, structured ? serializeStructuredPatch(structuredOperations) : MALFORMED_PATCH);
  if (structured) {
    const rejected = await postTurn(applyPatchRequest({ historyInput: "CODEC_REJECT_WIRE", historyId: "ctc_reject" }));
    assert.equal(capturedGrok.length, 3, "invalid arguments must not cause a hidden Router request");
    assert.ok(rejected.includes('"type":"error"') || rejected.includes('"type":"response.failed"'), "invalid arguments must surface a transport error");
    assert.equal(rejected.includes("*** Begin Patch"), false, "invalid arguments must not produce executable patch input");
    assert.equal(itemsByCallId(rejected).get("call_rejected")?.input || "", "");
    assert.equal(rejected.includes('"type":"response.completed"'), false);

    const canceler = new AbortController();
    const held = fetch(routerUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(applyPatchRequest({ historyInput: "CODEC_CANCEL_WIRE", historyId: "ctc_cancel" })),
      signal: canceler.signal,
    }).then((response) => response.text()).then(() => undefined, (error) => error);
    const startedDeadline = Date.now() + 10_000;
    while (!cancelStreamClosed && Date.now() < startedDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    canceler.abort();
    const canceled = await held;
    assert.ok(cancelStreamClosed, "the canceled request must have reached the mock upstream");
    assert.equal(canceled?.name, "AbortError");
    let closeTimer;
    await Promise.race([
      cancelStreamClosed,
      new Promise((_, reject) => { closeTimer = setTimeout(() => reject(new Error("cancellation did not reach mock upstream")), 10_000); }),
    ]).finally(() => clearTimeout(closeTimer));
    assert.equal(capturedGrok.length, 4, "client cancellation must not trigger a replay");
    process.stdout.write("ok malformed arguments fail closed without a hidden request; client cancellation closes the complete local upstream path\n");
  }
  if (codexBinary) {
    // Offline handler integration only. This separate CLI process is not a
    // native Desktop benchmark or evidence of benchmark read isolation.
    const fixtureDir = path.join(workspace, "native-fixture");
    mkdirSync(fixtureDir);
    writeFileSync(path.join(fixtureDir, "fixture.txt"), "old\n");
    // Match the Router's catalog conversion. Unknown-model fallback metadata
    // does not advertise native apply_patch and cannot exercise this bridge.
    const bundled = spawnSync(codexBinary, ["debug", "models", "--bundled"], {
      encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL", maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    assert.equal(bundled.status, 0, "read the installed binary's bundled model metadata");
    const nativeModels = JSON.parse(bundled.stdout).models;
    const template = nativeModels.find((model) => model.apply_patch_tool_type === "freeform");
    assert.ok(template, "bundled metadata must provide the native freeform patch tool");
    const catalogPath = path.join(workspace, "probe-catalog.json");
    writeFileSync(catalogPath, JSON.stringify({ models: [routedModel(template, MODEL_BY_SLUG.get("grok-oauth/grok-4.6"))] }));
    nativeRecoveryProbe = { requests: 0, contextFailure: false, successFeedback: false, invalidArgumentFeedback: false };
    const args = ["exec", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check", "--sandbox", "workspace-write", "--color", "never", "--json", "--model", "grok-oauth/grok-4.6", "--cd", fixtureDir, "--disable", "plugins", "--disable", "remote_plugin"];
    for (const setting of [
      'model_provider="local-protocol"',
      `model_catalog_json=${JSON.stringify(catalogPath)}`,
      'model_providers.local-protocol.name="Offline structured patch proof"',
      `model_providers.local-protocol.base_url=${JSON.stringify(callerBaseUrl(routerPort, CALLER_KEY))}`,
      'model_providers.local-protocol.wire_api="responses"',
      'model_providers.local-protocol.requires_openai_auth=false',
      'model_providers.local-protocol.supports_websockets=false',
      'approval_policy="never"',
      'model_reasoning_effort="high"',
    ]) args.push("-c", setting);
    args.push("Offline tool protocol test. Only fixture.txt in this temporary workspace may be edited. Process the supplied tool calls and finish.");
    const client = spawnChild(codexBinary, args, { CODEX_HOME: codexHome });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // The shared shutdown path escalates to SIGKILL after five seconds;
      // a client ignoring SIGTERM must not keep the deadline promise pending.
      void stopChild(client);
    }, 60_000);
    const exit = await new Promise((resolve, reject) => {
      client.once("error", reject);
      client.once("exit", (code) => resolve(code));
    }).finally(() => clearTimeout(timer));
    assert.equal(timedOut, false, "native offline handler probe deadline");
    if (exit !== 0 && nativeFault !== "invalid-arguments") {
      process.stderr.write(`offline probe state: ${JSON.stringify(nativeRecoveryProbe)}\n`);
      process.stderr.write(`Router: ${routerChild.testOutput()}\nForwarder: ${grokChild.testOutput()}\nLiteLLM: ${litellmChild.testOutput()}\n`);
    }
    if (nativeFault === "invalid-arguments") {
      assert.equal(exit, 1, "invalid arguments currently fail the Codex turn");
      assert.deepEqual(nativeRecoveryProbe, { requests: 6, contextFailure: false, successFeedback: false, invalidArgumentFeedback: false });
      assert.equal(readFileSync(path.join(fixtureDir, "fixture.txt"), "utf8"), "old\n");
      assert.match(client.testOutput(), /turn.failed/);
      process.stdout.write("observed limitation: invalid structured arguments leave the fixture unchanged, but Codex makes six transport attempts and fails without native tool feedback\n");
    } else if (nativeFault) {
      assert.equal(exit, 0, client.testOutput());
      assert.ok(nativeRecoveryProbe.requests >= 2 && nativeRecoveryProbe.requests <= 3);
      assert.equal(nativeRecoveryProbe.successFeedback, true);
      assert.equal(readFileSync(path.join(fixtureDir, "fixture.txt"), "utf8"), "old\nmarker\n", "fault/retry must not apply the insertion twice");
      process.stdout.write(`ok installed Codex ${nativeFault}: one marker after fault/retry, ${nativeRecoveryProbe.requests} upstream requests\n`);
    } else {
      assert.equal(exit, 0, client.testOutput());
      assert.deepEqual(nativeRecoveryProbe, { requests: 3, contextFailure: true, successFeedback: true, invalidArgumentFeedback: false });
      assert.equal(readFileSync(path.join(fixtureDir, "fixture.txt"), "utf8"), "new\n");
      process.stdout.write("ok installed Codex workspace-write handler received context failure, then applied repair through the complete local protocol path\n");
    }
  }
} finally {
  await Promise.all(children.map((child) => stopChild(child)));
  mockXai.closeAllConnections();
  if (mockXai.listening) await new Promise((resolve) => mockXai.close(resolve));
  rmSync(workspace, { recursive: true, force: true });
}

process.stdout.write(`ok grok apply_patch ${structured ? "structured codec" : "guidance"} through Router, LiteLLM, Grok forwarder, and mock xAI\n`);
