# DeepSeek V4.1 Flash across providers — 2026-09-11

DeepSeek released V4.1 Flash on 2026-09-10. There is no V4.1 Pro yet. This
note records what each provider serves, the evidence, and why the checked-in
routes look the way they do. Every existing V4 route stays listed.

## DeepSeek API (`deepseek`)

Sources: https://api-docs.deepseek.com/news/news260910,
https://api-docs.deepseek.com/quick_start/pricing/,
https://api-docs.deepseek.com/guides/thinking_mode,
https://api-docs.deepseek.com/guides/vision/,
https://api-docs.deepseek.com/quick_start/agent_integrations/codex/.

- Current ids are `deepseek-flash` and `deepseek-v4-pro`. The live `/models`
  response on 2026-09-10 listed exactly those two.
- `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are retired but still
  accepted, served by V4.1 Flash at Flash price, with no end date. The V4 Flash
  routes therefore keep working, now on V4.1 Flash.
- From 2026-09-14 04:00 UTC, `deepseek-v4-pro` requests are served by V4.1
  Flash at Flash rates until V4.1 Pro launches.
- `deepseek-chat` and `deepseek-reasoner` were discontinued on 2026-07-24.
- V4.1 Flash: 1M context (Codex guide: `context_window` 1048576), 384K maximum
  output, text and image input (at most 1,024 tokens per image), thinking on
  by default at `high`, efforts low/high/max, `thinking: {type: disabled}` to
  turn it off.
- Default completion is 64K in thinking mode and 128K at `max`. Routes keep at
  least 128K between `autoCompact` and the window.
- In thinking mode `required` and named tool choices return 400 on Chat
  Completions. The `deepseek-thinking` profile already downgrades them to
  `auto`.

Route: `deepseek/deepseek-v4.1-flash` with `deepseek-thinking`. Standalone web
search is not declared, because that capability is only listed for routes
verified against Codex's replay path.

## opencode Go (`opencode-go`)

Sources: https://opencode.ai/docs/go/, https://models.dev/api.json,
https://github.com/anomalyco/models.dev/commit/2858118c,
https://github.com/anomalyco/opencode/pull/48363.

- Added as `deepseek-flash` on 2026-09-10, then renamed to
  `deepseek-v4.1-flash` about 14 hours later. models.dev marks `deepseek-flash`
  deprecated. The live catalog still serves both ids.
- models.dev: 1,000,000 context, 384,000 output, text+image input, reasoning
  low/high/max, tool calls, `interleaved: {field: "reasoning_content"}`.
- Chat Completions only (`https://opencode.ai/zen/go/v1/chat/completions`).
- V4 Flash, V4 Flash Vision Exp and V4 Pro remain listed. OpenCode has not said
  what its V4 Pro serves after 2026-09-14.
- Go allowance for V4.1 Flash is $15 against V4 Flash's $30, with a temporary
  4x usage promotion.
- Related open issue: https://github.com/anomalyco/opencode/issues/48180
  (400 on V4 Flash when `reasoning_content` is echoed with `reasoning_effort`).

Route: `opencode-go/deepseek-v4.1-flash` with `auto-tool-choice`, window
1,000,000 compacting at 850,000.

## Nous Research Portal (`nousresearch`)

Source: https://inference-api.nousresearch.com/v1/models (public).

- Lists `deepseek/deepseek-v4.1-flash` (alias
  `deepseek/deepseek-v4.1-flash-20260910`), created 2026-09-10.
- `context_length` is 1,048,576, but `top_provider` caps context at 262,144
  and output at 235,929. The route uses the served 262,144 window.
- Text+image input; supported efforts max/high/low, default high; supports
  `tools`, `tool_choice`, `reasoning_effort`.
- V4 Flash and V4 Pro ids remain listed.

Route: `nousresearch/deepseek-v4.1-flash`, window 262,144 compacting at
134,000.

## Ollama Cloud (`ollama-cloud`)

Sources: https://ollama.com/search?c=cloud, https://ollama.com/api/tags,
https://github.com/ollama/ollama/issues/18360.

- No V4.1 Flash as of 2026-09-11; `library/deepseek-v4.1-flash` returns 404
  and the cloud API lists only `deepseek-v4-flash:0731` and
  `deepseek-v4-pro:0813`. An open request asks for it.
- No route added. The library page now lists V4 Pro at 1M context while the
  checked-in route declares 524,288; not changed here.

## Command Code (`commandcode`)

Sources: https://commandcode.ai/changelog,
https://api.commandcode.ai/provider/v1/models,
https://commandcode.ai/docs/provider,
https://commandcode.ai/models/deepseek-v4-1-flash.

- CLI v1.53.0 (2026-09-09) added `deepseek/deepseek-v4.1-flash`; the live
  `/models` response lists it as "DeepSeek V4.1 Flash" with a 1,000,000
  context.
- `deepseek/deepseek-v4-flash` and `deepseek/deepseek-v4-pro` remain listed,
  now named "(latest)", alongside `-flash-fast` and `-flash-vision-exp`. No
  retirement or remap notice.
- Provider API: `https://api.commandcode.ai/provider/v1`, OpenAI Chat
  Completions; `/messages` rejects non-Anthropic models.
- Price matches V4 Flash ($0.15 / $0.60 per M off-peak); available on Go and
  above.
- Not documented: maximum output, effort values, tool_choice or
  `reasoning_content` behavior. Image input appears only in marketing copy.

Route: `commandcode/deepseek-v4.1-flash`, text-only until image input is
verified at the API, window 1,000,000 compacting at 850,000. The low/high/max
ladder is DeepSeek's documented ladder for this model, matching the existing
Command Code V4 Flash route; it is not separately documented by Command Code.

## ClinePass (`clinepass`)

Sources: https://docs.cline.bot/getting-started/clinepass,
https://api.cline.bot/api/v1/models, `cline/cline`
`sdk/packages/llms/src/catalog/catalog.generated.ts`.

- ClinePass lists only `cline-pass/deepseek-v4-flash` and
  `cline-pass/deepseek-v4-pro` as of 2026-09-11; its pricing table still shows
  V4 Flash rates.
- Cline's pay-per-use API (not ClinePass) lists `deepseek/deepseek-v4.1-flash`.
- The authenticated ClinePass model list could not be read, so a server-side
  addition is not ruled out.

No route added.

## Qwen Plan (`qwen-plan`)

Not covered in this pass. No Qwen Plan credential was available for live
discovery, and Model Studio's documentation was not reviewed. The checked-in
V4 routes are unchanged.

## Known limitation: stateless tool-result compatibility check

DeepSeek requires every prior assistant turn to carry `reasoning_content`
whenever the request includes `tools`, otherwise it returns 400. The
`stateless tool result` check in `src/compatibility-test.mjs` replays a
`function_call` with no reasoning item, which is exactly that shape, so it is
expected to fail against thinking-mode V4.1 Flash (reproduced on opencode Go in
https://github.com/duolahypercho/codex-router/pull/679). Ordinary Codex turns
store reasoning and the router carries it onto the following assistant turn,
so this does not indicate a failure on real traffic. Live verification and
the native subagent probe have not been run for these routes.
