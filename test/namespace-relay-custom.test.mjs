import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import test from "node:test";

import {
  bridgeCustomTools,
  buildNamespaceLookups,
  flattenNamespacedHistory,
  flattenNamespaceTools,
  flattenToolChoice,
  NamespaceToolCallTransform,
  rewriteNamespaceResponsePayload,
  strictOpenCodeCompactionInput,
} from "../src/namespace-relay.mjs";
import { deepSeekCustomToolNames } from "../src/deepseek-responses.mjs";

function fixture(extraTools = []) {
  const tools = [
    { type: "namespace", name: "functions", tools: [{ type: "custom", name: "exec" }] },
    ...extraTools,
  ];
  const input = [
    { type: "custom_tool_call", namespace: "functions", name: "exec", call_id: "prior", input: "text(1)" },
    { type: "custom_tool_call_output", call_id: "prior", output: "1" },
  ];
  const choice = { type: "custom", namespace: "functions", name: "exec" };
  const flattened = flattenNamespaceTools(tools);
  const bridged = bridgeCustomTools(flattened.tools, input, flattened.namespaces, choice,
    deepSeekCustomToolNames(flattened.tools, input, choice));
  const providerName = bridged.tools[0].name;
  return { ...bridged, providerName, namespaces: flattened.namespaces };
}

function sourceCall(name, input = "text(2)") {
  return { type: "function_call", id: "fc_custom", call_id: "call_custom", name,
    arguments: JSON.stringify({ input }), status: "completed" };
}

const frame = (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
const parse = (text) => text.split("\n").filter((line) => line.startsWith("data: "))
  .map((line) => JSON.parse(line.slice(6)));

async function transformEvents(events, namespaces) {
  const chunks = [];
  let error;
  try {
    await pipeline(Readable.from(events.map(frame)),
      new NamespaceToolCallTransform(namespaces, "text/event-stream"),
      new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk); callback(); } }));
  } catch (caught) { error = caught; }
  return { events: parse(Buffer.concat(chunks).toString()), error };
}

test("namespaced custom tools preserve exact input, choice and output identity", () => {
  for (const extraTools of [[],
    [{ type: "function", name: "functions__exec", parameters: { type: "object" } }],
    [{ type: "custom", name: "functions__exec" }],
  ]) {
    const built = fixture(extraTools);
    assert.equal(new Set(built.tools.map((tool) => tool.name)).size, built.tools.length);
    const input = flattenNamespacedHistory(built.input, built.namespaces);
    assert.equal(input[0].name, built.providerName);
    assert.equal(input[0].namespace, undefined);
    assert.equal(input[0].arguments, '{"input":"text(1)"}');
    assert.equal(input[1].type, "function_call_output");
    assert.deepEqual(flattenToolChoice(built.toolChoice, built.namespaces), {
      type: "function", name: built.providerName,
    });
    const output = rewriteNamespaceResponsePayload({ output: [sourceCall(built.providerName)] },
      buildNamespaceLookups(built.namespaces)).output[0];
    assert.equal(output.type, "custom_tool_call");
    assert.equal(output.name, "exec");
    assert.equal(output.namespace, "functions");
    assert.equal(output.input, "text(2)");
    if (extraTools[0]?.type === "custom") {
      const plain = rewriteNamespaceResponsePayload({ output: [sourceCall(built.tools[1].name)] },
        buildNamespaceLookups(built.namespaces)).output[0];
      assert.equal(plain.name, "functions__exec");
      assert.equal(plain.namespace, undefined);
    } else if (extraTools[0]?.type === "function") {
      const payload = { output: [sourceCall(built.tools[1].name)] };
      const plain = (rewriteNamespaceResponsePayload(payload,
        buildNamespaceLookups(built.namespaces)) || payload).output[0];
      assert.equal(plain.type, "function_call");
      assert.equal(plain.name, "functions__exec");
      assert.equal(plain.namespace, undefined);
    }
  }
});

test("bounded namespaced custom aliases remain consistent in allowed-tools choices", () => {
  const namespace = "namespace_with_a_long_but_valid_native_identity";
  const name = "freeform_tool_with_a_long_native_name";
  const tools = [{ type: "namespace", name: namespace, tools: [{ type: "custom", name }] }];
  const input = [{ type: "custom_tool_call", namespace, name, call_id: "prior", input: "raw" }];
  const choice = { type: "allowed_tools", tools: [{ type: "custom", namespace, name }] };
  const flattened = flattenNamespaceTools(tools, { maxNameLength: 64 });
  const bridged = bridgeCustomTools(flattened.tools, input, flattened.namespaces, choice,
    deepSeekCustomToolNames(flattened.tools, input, choice), { maxNameLength: 64 });
  const providerName = bridged.tools[0].name;
  assert.ok(providerName.length <= 64);
  assert.equal(flattenNamespacedHistory(bridged.input, flattened.namespaces)[0].name, providerName);
  assert.deepEqual(flattenToolChoice(bridged.toolChoice, flattened.namespaces), {
    type: "allowed_tools", tools: [{ type: "function", name: providerName }],
  });
  const output = rewriteNamespaceResponsePayload({ output: [sourceCall(providerName)] },
    buildNamespaceLookups(flattened.namespaces)).output[0];
  assert.equal(output.name, name);
  assert.equal(output.namespace, namespace);
});

test("namespaced custom apply_patch history remains paired during compaction", () => {
  const input = [
    { type: "custom_tool_call", namespace: "functions", name: "apply_patch", call_id: "patch", input: "*** Begin Patch\n*** End Patch" },
    { type: "custom_tool_call_output", call_id: "patch", output: [{ type: "input_image", file_id: "file-api-fixture" }] },
  ];
  const original = structuredClone(input);
  const output = strictOpenCodeCompactionInput(input, []);
  assert.equal(output.length, 2);
  assert.equal(output[0].type, "function_call");
  assert.equal(output[0].namespace, undefined);
  assert.equal(output[1].type, "function_call_output");
  assert.equal(output[0].call_id, output[1].call_id);
  assert.equal(JSON.parse(output[0].arguments).input, original[0].input);
  assert.deepEqual(output[1].output, original[1].output);
  assert.deepEqual(input, original);
});

test("namespaced custom calls retain identity through streamed and atomic lifecycles", async () => {
  const built = fixture();
  const call = sourceCall(built.providerName);
  const done = { type: "response.output_item.done", output_index: 0, item: call };
  const terminal = { type: "response.completed", response: { id: "resp_custom", output: [call] } };
  const open = { type: "response.output_item.added", output_index: 0,
    item: { ...call, status: "in_progress", arguments: "" } };
  const events = [open,
    { type: "response.function_call_arguments.delta", output_index: 0, item_id: call.id, delta: call.arguments },
    { type: "response.function_call_arguments.done", output_index: 0, item_id: call.id, arguments: call.arguments },
    done, terminal];
  for (const source of [events, [done, terminal], [terminal]]) {
    const result = await transformEvents(source, built.namespaces);
    assert.equal(result.error, undefined);
    for (const event of result.events) {
      for (const item of event.item ? [event.item] : event.response?.output || []) {
        assert.equal(item.type, "custom_tool_call");
        assert.equal(item.name, "exec");
        assert.equal(item.namespace, "functions");
        assert.equal(item.call_id, call.call_id);
      }
    }
    if (source === events) {
      assert.equal(result.events.find((event) => event.type === "response.custom_tool_call_input.delta").delta, "text(2)");
      assert.equal(result.events.find((event) => event.type === "response.custom_tool_call_input.done").input, "text(2)");
    }
  }
  const forged = { ...done, item: { ...call, namespace: "forged" } };
  const result = await transformEvents([open, forged], built.namespaces);
  assert.equal(result.error?.code, "ERR_NAMESPACE_RELAY_COMMITTED_STREAM");
  assert.equal(result.events.length, 1, "a namespace change must not close an already restored call");
  const atomicForged = await transformEvents([forged], built.namespaces);
  assert.equal(atomicForged.events[0].item.type, "function_call");
  assert.equal(atomicForged.events[0].item.namespace, "forged", "an untrusted namespace cannot select a custom relay");
});
