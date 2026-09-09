# Experimental Grok structured patch bridge

This candidate is not a recommended runtime profile. Quality and performance
acceptance are pending. It does not establish parity with Grok CLI or Build.

`CODEX_ROUTER_GROK_STRUCTURED_PATCH=1` opts a Router process into schema version
1 for the exact `grok-oauth/grok-4.6` route. The default is off. The client must
declare a native custom `apply_patch` in that request; history and forced tool
choice alone cannot enable it. Other routes retain their existing behavior.

Router presents structured arguments for that tool and deterministically
compiles them into native patch text. Codex executes the native tool and owns
its permission checks, sandbox, context matching, and newline semantics.
Router does not read source files or apply edits.

## Argument contract

The root contains `operations`, a nonempty array:

- `add`: `path` and `lines`, an array of literal logical lines.
- `delete`: `path`.
- `update`: `path` and `hunks`. Each hunk has `lines` containing `{kind, text}`
  entries; `kind` is `context`, `add`, or `remove`. Optional `anchor` specifies
  the native exact context marker. Optional `endOfFile: true` is allowed only
  on the final hunk.

The canonical schema and bounds are in `src/grok-structured-patch.mjs`. Unknown
fields, ambiguous JSON keys, unsupported operations, embedded line separators,
invalid Unicode, duplicate paths, and no-op update hunks are rejected. Paths
are literal single header values; allowing an absolute path is not permission
to access it. Native Codex authorization still applies.

The serializer authors patch delimiters and line prefixes. It does not fix
source code, search for approximate matches, or request another model response.
The existing native parser owns line-oriented file behavior, including final
newlines. This interface does not promise arbitrary binary or byte-exact file
creation.

Legacy calls, including failed patches outside the new subset, remain in
history as lossless `{input: rawPatch}` envelopes under the collision-resolved
provider tool name. That envelope is not accepted for newly generated calls.
Call IDs, paired results, tool choices, and ordinary same-name tools retain
their identities.

Complete structured arguments are validated before any compiled patch input
is emitted. The response relay compares the source and compiled input across
arguments completion, item completion, and terminal summaries. Ambiguous,
contradictory, or oversized responses fail closed in this mode.

## Evidence and limitations

Usage events expose only `{enabled, applied, schemaVersion}` in
`grokStructuredPatch`; `applied` distinguishes actual conversion from an enabled
flag without a native tool. Historical usage rows need not contain this field.
No prompt, patch content, or reasoning is included in this metadata.

The offline verifier uses real Router, LiteLLM and forwarder processes with
mock xAI responses:

```sh
node scripts/verify-grok-apply-patch-guidance.mjs <venv-python> --structured
```

An optional `--codex=<installed-codex-binary>` additionally verifies the native
handler under `workspace-write`: a context mismatch returns through the full
path, then a supplied correction modifies a temporary fixture. It builds a
temporary catalog using Router's catalog conversion and the binary's bundled
metadata. This separate CLI process is an offline handler probe, not a native
Desktop benchmark or proof of benchmark isolation.

Malformed structured arguments currently abort the transport. They do not
produce model-visible native tool feedback. Context-error recovery does not
resolve that limitation. Live provider schema adherence, the complete
cancellation/replay matrix, benchmark read isolation, and comparative quality
acceptance remain separate gates. Do not enable this mode by default or treat
passing protocol tests as evidence of faster or better model work.
