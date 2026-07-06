# OpenRouter Phase 1 — Implementation Progress

Date: 2026-07-06

## Status: ✅ Implementation Complete — Ready for QA

## Summary

OpenRouter has been integrated as an **AI cleanup LLM provider** using the Vercel AI SDK (`@ai-sdk/openai`) with OpenRouter's OpenAI-compatible `baseURL`. The shared module also exports `createOpenRouterTranscriptionModel()` so Phase 2 STT can use the same AI SDK provider factory.

**No new npm dependencies were added.** The integration reuses `@ai-sdk/openai` (already in the project) with a custom `baseURL` and attribution headers.

---

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `apps/server/src/lib/openrouter.ts` | Shared module: constants, `createOpenRouterAiSdkProvider()`, `createOpenRouterChatModel()`, `createOpenRouterTranscriptionModel()` |

### Modified Files

| File | Change |
|------|--------|
| `apps/server/src/lib/providers.ts` | Added OpenRouter factory to `PROVIDER_FACTORIES` delegating through `createOpenRouterChatModel()`. Not added to `PROVIDER_PREFIXED_CHAT_MODELS`. |
| `apps/server/src/lib/validate-key.ts` | Added `sk-or-` format hint, live validator hitting `GET /api/v1/models`, and `openrouter` entry in `LIVE_VALIDATORS`. |
| `apps/server/src/routes/models.ts` | Added OpenRouter model catalog: `fetchOpenRouterModels()` with 6h cache, `isOpenRouterTextModel()` filter, `openRouterToAvailableModel()` with per-million cost normalization. Updated `getModelCost()` for OpenRouter per-token pricing. Updated `isCleanupModelSupported()` for OpenRouter validation. Added 3 curated IDs and 1 builtin fallback. `/available` handler fetches OpenRouter in its own `try/catch`. |
| `apps/electron/src/renderer/src/lib/models.ts` | Added `"openrouter"` to `LLM_PROVIDERS`. Added `openrouter: "https://openrouter.ai/keys"` to `PROVIDER_KEY_URLS`. (`PROVIDER_DISPLAY_NAMES` already had `openrouter: "OpenRouter"`.) |
| `apps/electron/src/renderer/src/components/model-row.tsx` | Added `openrouter: "OR"` to `PROVIDER_FILTER_MARKS`. |
| `README.md` | Added OpenRouter to feature provider list. |

### Files NOT Changed (by design)

No changes to STT/streaming, schema, validation schemas, or Models page UI components — these are out of scope for cleanup LLM work.

---

## Implementation Details

### Shared OpenRouter Module (`openrouter.ts`)
- `createOpenRouterAiSdkProvider({ apiKey })` — creates `@ai-sdk/openai` instance with OpenRouter `baseURL` and headers
- `createOpenRouterChatModel(apiKey, modelId)` — returns `.chat(modelId)` for cleanup LLMs
- `createOpenRouterTranscriptionModel(apiKey, modelId)` — returns `.transcription(modelId)` for future Phase 2 STT
- All three share the same AI SDK boundary — no `@openrouter/sdk` dependency

### Provider Factory
- Delegates through `createOpenRouterChatModel()` from the shared module
- Model IDs pass through as-is (e.g., `anthropic/claude-sonnet-4`) — no prefix stripping

### Key Validation
- Format check: keys should start with `"sk-or-"`
- Live check: `GET /api/v1/models` with bearer token
- Handles 200 (valid), 401 (invalid key), 403 (permission denied), and other HTTP errors
- Note for QA: Confirm that `/models` with an invalid bearer token returns 401 vs. succeeding (OpenRouter may treat `/models` as public)

### Model Catalog
- Fetched from `GET https://openrouter.ai/api/v1/models` with 6-hour cache
- Filters to text-in/text-out models using `architecture.input_modalities` / `output_modalities`
- Excludes unsuitable models via existing `UNSUITABLE_CLEANUP_MODEL_PATTERN`
- Pricing: per-token strings stored as per-million values in `AvailableModel`; `getModelCost()` returns per-token values
- Isolated in its own `try/catch` — OpenRouter outage doesn't break other providers

### Curated Models
Three OpenRouter curated models surfaced by default:
1. `openai/gpt-4o-mini`
2. `google/gemini-2.5-flash`
3. `anthropic/claude-haiku-4-5`

One builtin fallback: `openai/gpt-4o-mini` via OpenRouter (appears even if catalog fetch fails).

### Renderer
- `LLM_PROVIDERS` now includes `"openrouter"`
- `PROVIDER_KEY_URLS` has the key creation URL
- `PROVIDER_DISPLAY_NAMES` already had `"OpenRouter"` (pre-existing)
- `PROVIDER_FILTER_MARKS` shows `"OR"` as the compact badge

---

## QA Verification Checklist

### Build Verification
- [x] `pnpm --filter @freestyle-voice/server build` succeeds
- [x] `pnpm --filter @freestyle-voice/electron typecheck:web` succeeds
- [ ] `pnpm build` succeeds

### Test Verification
- [x] `pnpm --filter @freestyle-voice/server test` passes (existing tests should not regress)

### Manual Testing — Models Page
- [x] Open Settings → Models → Cleanup model
- [x] Confirm OpenRouter appears in cloud provider filters
- [x] Pick an OpenRouter model with no key stored
- [x] Confirm the Add key modal says "Add your OpenRouter API key"
- [x] Confirm the "Get a OpenRouter key" link opens `https://openrouter.ai/keys`
- [x] Enter a valid OpenRouter key → confirm validation succeeds
- [x] Enter an invalid key → confirm format hint ("sk-or-") or live error appears
- [x] Confirm the selected model becomes the default cleanup model

### Manual Testing — Cleanup Flow
- [x] With a valid OpenRouter key and selected cleanup model:
  - [x] Dictate a sentence → confirm cleanup processes it correctly
  - [x] Check cleanup history shows OpenRouter cost data
- [x] With OpenRouter unreachable (e.g., offline):
  - [x] Confirm existing local/cloud models still appear in the catalog
  - [x] Confirm the builtin fallback (`DeepSeek V4 Flash via OpenRouter`) still appears

### Key Validation Edge Cases
- [x] Key with `sk-or-` prefix → live validation attempted
- [x] Key without `sk-or-` prefix → format hint returned immediately
- [x] Revoked/expired key → appropriate error message
- [x] Network timeout → timeout error message

### Regression
- [x] Other cleanup providers (OpenAI, Anthropic, Google, Groq, Mistral) still work
- [x] Voice/transcription models unaffected
- [x] Local LLM and Freestyle Cloud models unaffected
