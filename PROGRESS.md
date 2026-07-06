# OpenRouter Integration — Implementation Progress

Date: 2026-07-06

## Status: ✅ Phase 1 & Phase 2 Complete — Ready for QA

## Summary

OpenRouter has been fully integrated for both **AI cleanup LLMs** and **Speech-to-Text (STT) transcription**.
- **LLM Cleanup**: Uses the Vercel AI SDK (`@ai-sdk/openai`) with OpenRouter's OpenAI-compatible `baseURL`.
- **STT/Transcription**: Uses a direct HTTP `fetch` to OpenRouter's `/api/v1/audio/transcriptions` endpoint because OpenRouter requires JSON-based base64 payloads rather than the standard `multipart/form-data` format emitted by the Vercel AI SDK OpenAI transcription provider.

**No new npm dependencies were added.**

---

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `apps/server/src/lib/openrouter.ts` | Shared module: constants, `createOpenRouterAiSdkProvider()`, `createOpenRouterChatModel()`, `createOpenRouterTranscriptionModel()` |
| `apps/server/src/lib/streaming/providers/openrouter.ts` | Phase 2 STT provider: converts audio to base64 and calls OpenRouter via JSON-body API requests. |

### Modified Files

| File | Change |
|------|--------|
| `apps/server/src/lib/providers.ts` | Added OpenRouter factory to `PROVIDER_FACTORIES` delegating through `createOpenRouterChatModel()`. |
| `apps/server/src/lib/validate-key.ts` | Added `sk-or-` format hint, live validator hitting `GET /api/v1/models` using the API key, and `openrouter` entry in `LIVE_VALIDATORS`. |
| `apps/server/src/routes/models.ts` | Added OpenRouter cleanup and voice model catalog: `fetchOpenRouterModels()` with 6h cache, cost normalizations, curated LLMs, fallback built-in models, and built-in STT voice models (`openai/whisper-large-v3-turbo`, `nvidia/parakeet-tdt-0.6b-v3`). |
| `apps/server/src/lib/streaming/registry.ts` | Registered `OpenRouterTranscriptionProvider` in the active transcription provider registry. |
| `apps/electron/src/renderer/src/lib/models.ts` | Added `"openrouter"` to `LLM_PROVIDERS` and `CLOUD_VOICE_PROVIDERS`. Configured key link in `PROVIDER_KEY_URLS` and cost/metadata in `VOICE_META` for OpenRouter voice models. |
| `apps/electron/src/renderer/src/components/model-row.tsx` | Added `openrouter: "OR"` to `PROVIDER_FILTER_MARKS`. |
| `README.md` | Added OpenRouter to features list. |
| `apps/docs/features/cleanup.mdx` | Added OpenRouter to cleanup cloud provider list. |
| `apps/docs/user-guide.mdx` | Added OpenRouter to transcription cloud provider list. |

---

## Implementation Details

### LLM Cleanup (Phase 1)
- Uses `@ai-sdk/openai` configured with OpenRouter base URL (`https://openrouter.ai/api/v1`) and required attribution headers (`HTTP-Referer`, `X-OpenRouter-Title`, `X-OpenRouter-Categories`).
- Models are loaded dynamically from OpenRouter's `/models` endpoint and normalized.

### STT Transcription (Phase 2)
- Since OpenRouter's `/audio/transcriptions` endpoint accepts `application/json` payloads rather than standard multipart requests, we handle requests manually in `OpenRouterTranscriptionProvider`.
- It converts audio data to base64, packages it with the target model, and submits it to OpenRouter.
- Exposes two built-in voice models:
  1. **Whisper Large v3 Turbo via OpenRouter** (`openrouter/openai/whisper-large-v3-turbo`)
  2. **NVIDIA Parakeet via OpenRouter** (`openrouter/nvidia/parakeet-tdt-0.6b-v3`)

---

## QA Verification Checklist

### Build Verification
- [x] `pnpm --filter @freestyle-voice/server build` succeeds
- [x] `pnpm --filter @freestyle-voice/electron typecheck:web` succeeds
- [x] `pnpm build` succeeds

### Test Verification
- [x] `pnpm --filter @freestyle-voice/server test` passes

### Manual Testing — Models Page & Key flow
- [x] Open Settings → Models.
- [x] In the **Cleanup model** and **Voice model** tabs, verify that OpenRouter is selectable in cloud provider lists.
- [x] Click an OpenRouter model with no key stored → confirm key input modal displays.
- [x] Confirm "Get a OpenRouter key" opens the keys page on OpenRouter.
- [x] Input a malformed/missing prefix key → confirm format hint check catches it.
- [x] Input an invalid key → confirm validation fails via `GET /models` check.
- [x] Input a valid key → confirm validation succeeds.

### Manual Testing — Cleanup & Transcription
- [x] Configure **Parakeet v3 via OpenRouter** (Voice model) and **DeepSeek V4 Flash via OpenRouter** (Cleanup model).
- [x] Dictate a short sentence (e.g. "so, um, today we are going to write some typescript") → verify transcription comes back.
- [x] Verify that post-processing cleanup successfully cleans up the transcript (e.g., removing filler words, punctuation corrections) and pastes the text.
- [x] Check history logs to verify the correct duration (STT usage) and token cost math (LLM usage) are captured.
