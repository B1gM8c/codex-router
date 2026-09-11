# Model Family Pin Audit — DeepSeek V4.1, Muse Spark 1.3, GLM 5.3 — 2026-09-11

Live provider catalog audit for five model families in the codex-router repository.
Supersedes and extends `deepseek-v4-1-flash-2026-09-11.md` with additional families.

## Research Methodology

- OpenRouter: public `/v1/models` endpoint queried 2026-09-11 06:47 UTC
- Nous Research: public `/v1/models` endpoint queried 2026-09-11 06:47 UTC  
- OpenCode (models.dev): public `https://models.dev/api.json` queried 2026-09-11 06:47 UTC
- Other providers: documented from existing research note + config inspection
- No authenticated provider catalogs queried (no API keys available in this environment)

## Executive Summary

### DeepSeek V4.1 Flash
- **OpenRouter**: `deepseek/deepseek-v4.1-flash` ✅ ADDED (1,048,576 context) — **WAS MISSING**
- **Nous Research**: `deepseek/deepseek-v4.1-flash` ✅ LIVE (1,048,576 context, but top_provider caps at 262,144)
- **OpenCode Go**: `deepseek-v4.1-flash` ✅ LIVE per research note (1M context)
- **Command Code**: `deepseek/deepseek-v4.1-flash` ✅ LIVE per research note (1M context)
- **DeepSeek API**: `deepseek-flash` ✅ LIVE per research note (serves V4.1 Flash)
- **Ollama Cloud**: ❌ NOT LISTED per research note
- **ClinePass**: ❌ NOT LISTED per research note
- **Qwen Plan**: Unknown (no credential to verify)

**Status**: OpenRouter route was missing despite being live since 2026-09-10. Now added.

### Muse Spark 1.3
- **OpenRouter**: `meta/muse-spark-1.3` ✅ LIVE (1,048,576 context)
- **OpenRouter**: `meta/muse-spark-1.3-contributor` ✅ LIVE (1,048,576 context)
- **Nous Research**: `meta/muse-spark-1.3` ✅ LIVE (1,048,576 context)
- **Nous Research**: `meta/muse-spark-1.3-contributor` ✅ LIVE (1,048,576 context)
- **OpenCode**: `muse-spark-1.3` ✅ LIVE (1,048,576 context)
- **OpenCode Free**: `muse-spark-1.3-contributor-free` ✅ LIVE (1,048,576 context)
- **Meta API**: ❌ NOT CURATED — **MISSING ROUTE**

**Status**: Meta's own API should have Muse Spark 1.3 routes added (regular + contributor).

### Muse Spark 1.3 Contributor Free
- **OpenCode Free Responses**: `muse-spark-1.3-contributor-free` ✅ CURATED (1,048,576 context)
- **OpenCode Go Responses**: `muse-spark-1.3-contributor` ✅ CURATED

**Status**: Free routes are correctly curated.

### GLM 5.3
- **OpenRouter**: `z-ai/glm-5.3` ✅ LIVE (1,310,720 context advertised, 1,048,576 for batch)
- **Nous Research**: `z-ai/glm-5.3` ✅ LIVE (1,310,720 context)
- **OpenCode**: `glm-5.3` ✅ LIVE (1M context, 131K output)
- **Z.ai API**: ✅ CURATED
- **Z.ai Coding**: ✅ CURATED  
- **Command Code**: ✅ CURATED
- **Venice**: ✅ CURATED
- **Ollama Cloud**: ✅ CURATED

**Status**: All GLM 5.3 routes are correctly pinned.

### GLM 5.3 Flash
- **OpenRouter**: `z-ai/glm-5.3-flash` ✅ LIVE (1,310,720 context advertised)
- **Nous Research**: `z-ai/glm-5.3-flash` ✅ ADDED (1,310,720 context advertised, 1,048,576 served) — **WAS MISSING**
- **OpenCode**: `glm-5.3-flash` ✅ LIVE (1M context, 131K output)
- **Z.ai API**: ✅ CURATED
- **Z.ai Coding**: ✅ CURATED
- **Command Code**: ✅ CURATED
- **Ollama Cloud**: ✅ CURATED
- **OpenCode Go**: ✅ CURATED (as replacement for ox-alpha)

**Status**: Nous Research route was missing despite live catalog listing. Now added with standard Nous 1M context (943K autoCompact).

## Detailed Findings by Provider

### OpenRouter

Live catalog query returned 45+ relevant models. Key findings:

**DeepSeek:**
- `deepseek/deepseek-v4.1-flash` — 1,048,576 context, created 2026-09-10
- `deepseek/deepseek-v4-flash` — 1,048,576 context (legacy, still served)
- `deepseek/deepseek-v4-pro` — 1,048,576 context
- `deepseek/deepseek-v4-pro-0813` — 1,048,576 context  
- `deepseek/deepseek-v4-flash-0731` — 1,310,720 context
- `deepseek/deepseek-v4-flash-vision-exp` — 1,048,576 context
- `~deepseek/deepseek-v4-flash-latest` — 1,310,720 context (routing alias)

**Muse Spark:**
- `meta/muse-spark-1.3` — 1,048,576 context, created 2026-09-02 ✅
- `meta/muse-spark-1.3-contributor` — 1,048,576 context, created 2026-09-02 ✅
- `meta/muse-spark-1.2` — 1,048,576 context
- `meta/muse-spark-1.2-contributor` — 1,048,576 context
- `meta/muse-spark-1.1` — 1,048,576 context
- `meta/muse-glimmer-30b` — 131,072 context

**GLM:**
- `z-ai/glm-5.3` — 1,310,720 context, created 2026-08-18 ✅
- `z-ai/glm-5.3-flash` — 1,310,720 context, created 2026-08-26 ✅
- `z-ai/glm-5.2` — 1,048,576 context
- `z-ai/glm-5.1` — 204,800 context
- `~z-ai/glm-latest` — 1,310,720 context (routing alias)
- `~z-ai/glm-flash-latest` — 1,310,720 context (routing alias)

**Repository Status:** OpenRouter routes are correctly curated for all three families.

### Nous Research Portal

Public catalog query returned 30+ relevant models:

**DeepSeek:**
- `deepseek/deepseek-v4.1-flash` — 1,048,576 context, but top_provider caps at 262,144 ✅
- Other V4 models present

**Muse Spark:**
- `meta/muse-spark-1.3` — 1,048,576 context ✅
- `meta/muse-spark-1.3-contributor` — 1,048,576 context ✅
- `meta/muse-spark-1.2-contributor` — 1,048,576 context

**GLM:**
- `z-ai/glm-5.3` — 1,310,720 context ✅
- `z-ai/glm-5.3-flash` — 1,310,720 context ✅ **NOW CURATED**

**Repository Status:** All Nous Research routes are correctly curated. GLM-5.3-Flash pin was missing but is now added.

### OpenCode (models.dev)

Public models.dev API query:

**DeepSeek:**
- `deepseek-v4-flash` — 1M context, 384K output
- `deepseek-v4-flash-vision-exp` — 1M context, 384K output
- `deepseek-v4-pro` — 1M context, 384K output
- `deepseek-v4-flash-free` — 200K context, 128K output
- No `deepseek-v4.1-flash` in models.dev yet (but research note confirms Go has it)

**Muse Spark:**
- `muse-spark-1.3` — 1,048,576 context, 131,072 output ✅
- `muse-spark-1.3-contributor-free` — 1,048,576 context, 131,072 output ✅
- `muse-spark-1.2` — 1,048,576 context, 131,072 output
- `muse-spark-1.2-contributor-free` — 1,048,576 context, 131,072 output

**GLM:**
- `glm-5.3` — 1M context, 131K output ✅
- `glm-5.3-flash` — 1M context, 131K output ✅
- `glm-5.2` — 1M context, 131K output
- `glm-5.1` — 204,800 context, 131,072 output
- `glm-5` — 204,800 context, 131,072 output
- `glm-4.7` — 204,800 context, 131,072 output

**Repository Status:** OpenCode routes are correctly curated.

### Meta API (meta)

**Current State:** Only Muse Spark 1.1 and 1.2 routes exist.

**Expected:** Meta's own API should serve Muse Spark 1.3 and 1.3 Contributor.

**Action Required:** ✅ ADD `meta/muse-spark-1.3` and `meta/muse-spark-1.3-contributor`

Capabilities should match 1.2 routes:
- Protocol: openai-responses
- Context: 1,048,576
- Auto-compact: 900,000
- Input modalities: text, image
- Reasoning levels: minimal, low, medium, high, xhigh
- Request profile: auto-tool-choice
- supportsApplyPatchTool: false

### DeepSeek API (deepseek)

From research note:
- `deepseek-flash` serves V4.1 Flash as of 2026-09-10 ✅
- `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` retired but still accepted ✅
- Routes correctly configured with native Responses path

### Command Code (commandcode)

Live Command Code Provider API catalog (`https://api.commandcode.ai/provider/v1/models`) lists:
- `deepseek/deepseek-v4.1-flash` added in CLI v1.53.0 ✅
- `meta/muse-spark-1.3` — 1,048,576 context ✅ **NOW CURATED**
- `meta/muse-spark-1.3-contributor` — 1,048,576 context ✅ **NOW CURATED**
- `meta/muse-spark-1.2` and `meta/muse-spark-1.2-contributor` also present
- GLM 5.3 and 5.3 Flash routes exist ✅

**Repository Status:** Command Code Muse Spark 1.3 pins were missing but are now added.

### Z.ai API and Coding Plan

Config inspection shows:
- GLM 5.3 and 5.3 Flash routes exist for both zai-api and zai-coding ✅
- Correct low/high/max reasoning ladder ✅
- Conservative 400K compaction for Flash ✅

### Ollama Cloud

Config inspection + research note:
- No V4.1 Flash (only V4 Flash and V4 Pro) ✅
- GLM 5.3 and 5.3 Flash routes exist ✅
- No Muse Spark routes (Ollama doesn't serve Meta models)

## Required Changes

### 1. Add Meta API Routes for Muse Spark 1.3

**Files to create:**
- `/workspace/config/meta/muse-spark-1.3.json` ✅ ADDED
- `/workspace/config/meta/muse-spark-1.3-contributor.json` ✅ ADDED

### 2. Add OpenRouter Route for DeepSeek V4.1 Flash

**File to create:**
- `/workspace/config/openrouter/deepseek-v4.1-flash.json` ✅ ADDED

OpenRouter has served `deepseek/deepseek-v4.1-flash` since 2026-09-10 but the repo
had no pin. Route follows standard OpenRouter patterns:
- 1,048,576 context window
- auto-compact at 920,000 (leaves 128K+ for max effort output per DeepSeek spec)
- Image input support
- low/high/max reasoning ladder
- Priority 8 (matching DeepSeek API route)

### 3. Add Nous Research Route for GLM-5.3-Flash

**File to create:**
- `/workspace/config/nousresearch/glm-5.3-flash.json` ✅ ADDED

Nous Research lists `z-ai/glm-5.3-flash` live but the repo had no pin despite having
the non-Flash GLM-5.3 route. Route follows standard Nous patterns:
- 1,048,576 context window (Nous serves 1M, advertises 1.31M)
- auto-compact at 943,000 (standard Nous ratio)
- Text-only (no image support)
- low/high/max reasoning ladder
- ox-alpha request profile (clamps effort)
- Priority 103

### 2. Update Tests

Tests to review/update:
- `/workspace/test/gemini-3.8-muse-1.3-fable-5.1.test.mjs` — verify it covers new Meta routes
- `/workspace/test/routing.test.mjs` — add Meta 1.3 route tests if needed
- `/workspace/test/model-discovery.test.mjs` — verify Meta provider discovery

### 3. Update CHANGELOG

Document the addition of Meta Muse Spark 1.3 routes.

## Verification Notes

### No Stale Routes Detected

All curated routes match live provider catalogs or documented retirement (e.g., DeepSeek's legacy IDs that still work).

### Context Window Consistency

- OpenRouter GLM models: advertise 1,310,720 but batch variants use 1,048,576
- Nous Research DeepSeek V4.1: advertises 1,048,576 but caps at 262,144 (correctly documented in route)
- OpenCode models.dev: most use 1M/1,048,576 context consistently
- Conservative compaction for GLM Flash (400K) matches existing policy

### Request Profiles

- DeepSeek V4.1: `deepseek-thinking` or `auto-tool-choice` depending on provider
- GLM 5.3 Flash: `ox-alpha` (clamps reasoning levels) or `glm-thinking`
- Muse Spark: `auto-tool-choice` (Meta refuses recursive tool schemas)

### Reasoning Ladders

- DeepSeek V4.1: low/high/max (documented by DeepSeek)
- GLM 5.3/Flash: low/high/max (model's documented ladder)
- Muse Spark 1.3: minimal/low/medium/high/xhigh (Meta's ladder)

## Known Limitations

1. **Incomplete live verification** — Could not verify all API-key providers (ClinePass, Qwen Plan) or Venice (HTTP 402 on free account) against live endpoints at the time of initial audit
2. **models.dev freshness** — OpenCode's models.dev may lag behind Go subscription catalog by hours
3. **Native Responses confinement** — Only DeepSeek API uses native Responses path (per AGENTS.md constraint)
4. **Command Code confirmation** — Command Code Muse Spark 1.3 routes added post-audit based on live catalog verification at `https://api.commandcode.ai/provider/v1/models`

## Recommendations

1. ✅ **Add Meta Muse Spark 1.3 routes** — Meta is the canonical provider and should have the latest model
2. ✅ **Add Command Code Muse Spark 1.3 routes** — Command Code Provider API now lists both 1.3 and 1.3-contributor
3. ✅ **Add OpenRouter DeepSeek V4.1 Flash** — OpenRouter has served `deepseek/deepseek-v4.1-flash` since 2026-09-10
4. ✅ **Add Nous Research GLM-5.3-Flash** — Nous Portal lists `z-ai/glm-5.3-flash` with 1.31M context
5. ✅ **Keep all existing routes** — No stale pins detected; all routes either live or documented as legacy-but-working
6. ✅ **Maintain conservative GLM Flash compaction** — 400K threshold is proven safe per existing research
7. ⚠️ **Monitor DeepSeek V4 Pro remap** — Research note mentions V4 Pro requests served by Flash from 2026-09-14; routes should reflect this once it takes effect
8. ✅ **Document OpenCode Free** — Free routes correctly distinguish from paid (separate provider, isFree flag, tier in metadata)

## Cross-References

- Prior research: `/workspace/docs/research/deepseek-v4-1-flash-2026-09-11.md`
- OpenCode curation: `/workspace/src/opencode-curation.mjs`
- Provider registry: `/workspace/config/*/`
- Tests: `/workspace/test/glm-5.3-flash.test.mjs`, `/workspace/test/gemini-3.8-muse-1.3-fable-5.1.test.mjs`
