# OpenRouter Integration Plan

Date: 2026-07-06

## Executive Summary

Freestyle should implement OpenRouter through the **Vercel AI SDK interface for
both cleanup LLMs and transcription models**. That gives the project one app
boundary for OpenRouter while keeping code changes small:

- The cleanup path is already centralized in `apps/server/src/lib/providers.ts`
  and `apps/server/src/lib/post-process.ts`, which call AI SDK `generateText()`.
- The batch transcription path is already centralized in
  `apps/server/src/lib/streaming/utils.ts`, which calls AI SDK
  `experimental_transcribe`.
- The API key and model configuration tables already store arbitrary provider
  IDs, so no database migration is required.
- The Models page already has a generic cloud-provider key flow.

Use `@ai-sdk/openai` with OpenRouter's OpenAI-compatible `baseURL` for both
LLMs and STT. LLM support uses `.chat(modelId)`. STT support uses
`.transcription(modelId)` through the existing `transcribeWithAiSdk()` path.
There is no `@openrouter/sdk` fallback and no chat-with-audio transcription path
in this plan. If a live compatibility test shows OpenRouter's STT endpoint does
not accept the stock AI SDK OpenAI-compatible transcription request, pause STT
work and revisit the provider choice instead of adding a second implementation.

## Sources Checked

- OpenRouter API reference: OpenRouter uses OpenAI-like chat completion schemas
  and documents optional attribution headers:
  <https://openrouter.ai/docs/api/reference/overview>
- OpenRouter authentication: bearer-token auth and OpenAI-compatible base URL:
  <https://openrouter.ai/docs/api/reference/authentication>
- OpenRouter app attribution headers:
  <https://openrouter.ai/docs/app-attribution>
- OpenRouter OpenAPI spec: `/models` and `/audio/transcriptions` are present:
  <https://openrouter.ai/openapi.json>
- AI SDK OpenAI provider: `createOpenAI` supports `baseURL`, `headers`, `name`,
  custom `fetch`, and transcription models:
  <https://ai-sdk.dev/providers/ai-sdk-providers/openai>
- AI SDK transcription docs: `experimental_transcribe` accepts provider
  transcription models and audio bytes/base64/URL:
  <https://ai-sdk.dev/docs/ai-sdk-core/transcription>

## Current Architecture Relevant to OpenRouter

### Cleanup LLM runtime

File: `apps/server/src/lib/providers.ts`

- Imports provider factories at lines 1-5.
- `PROVIDER_FACTORIES` maps provider IDs to AI SDK chat models at lines 21-67.
- `PROVIDER_PREFIXED_CHAT_MODELS` strips a provider prefix before calling a
  provider at lines 13-19 and 77-85.
- `createChatModel(providerId, modelId)` loads the stored key, finds a factory,
  and returns an AI SDK `LanguageModel` at lines 116-134.

OpenRouter should be added here as a chat provider.

Important model-ID rule:

- Do **not** add `openrouter` to `PROVIDER_PREFIXED_CHAT_MODELS`.
- OpenRouter model IDs already contain upstream provider prefixes such as
  `anthropic/...`, `openai/...`, `google/...`, or `meta-llama/...`.
- The DB row should store `provider = "openrouter"` and
  `model_id = "<native OpenRouter model id>"`.

### Cleanup execution

File: `apps/server/src/lib/post-process.ts`

- `resolveChatModel()` delegates all non-Groq providers to `createChatModel()` at
  lines 110-115.
- `postProcess()` runs cleanup when `llm_cleanup` is enabled and a default LLM is
  configured at lines 203-356.
- `generateText()` is called at lines 321-334.
- Groq-only provider options are already isolated at lines 329-333.

No structural change is needed here for OpenRouter if `createChatModel()` works.
OpenRouter should behave like OpenAI/Anthropic/Google/Mistral in this file.

### Transcription runtime

Files:

- `apps/server/src/lib/streaming/utils.ts`
- `apps/server/src/lib/streaming/types.ts`
- `apps/server/src/lib/streaming/providers/openai.ts`
- `apps/server/src/lib/streaming/providers/groq.ts`
- `apps/server/src/lib/streaming/registry.ts`

Relevant behavior:

- `transcribeWithAiSdk(opts, createProvider, providerId)` expects a provider
  factory with `.transcription(id)` and then calls the AI SDK
  `experimental_transcribe` helper.
- `transcribeWithAiSdk()` strips only the outer provider prefix with
  `stripProviderPrefix()`. For `openrouter/openai/whisper-large-v3`, the value
  sent to OpenRouter should remain `openai/whisper-large-v3`.
- The existing OpenAI and Groq providers already use Vercel AI SDK transcription
  for batch STT.
- OpenRouter STT should add a `TranscriptionProvider` that delegates batch STT to
  `transcribeWithAiSdk(opts, createOpenRouterAiSdkProvider, "openrouter")` and
  reports no realtime streaming support until OpenRouter has a compatible
  streaming transcription API.

This keeps OpenRouter LLM and STT on the same Vercel AI SDK-centered boundary.

### API key storage and lookup

Files:

- `apps/server/src/routes/api-keys.ts`
- `apps/server/src/lib/streaming-stt.ts`
- `apps/server/src/lib/schema.ts`
- `packages/validations/src/api-keys.ts`

Relevant behavior:

- `api_keys.provider` is a text primary key. It accepts arbitrary provider IDs.
- `model_configs.provider` is text. It accepts arbitrary provider IDs.
- `getApiKeyForProvider(providerId)` already reads the key by provider at
  `apps/server/src/lib/streaming-stt.ts` lines 67-78.
- `apiKeySchema` only requires non-empty `provider` and `key`.

No DB migration or route shape change is required.

### API key validation

File: `apps/server/src/lib/validate-key.ts`

- Format hints are defined at lines 19-28.
- Per-provider live validators are defined at lines 41-164.
- The dispatcher map is at lines 170-182.
- Unknown providers currently skip live validation and are accepted at lines
  192-197.

OpenRouter needs a validator so users get immediate key feedback rather than
accepting an invalid key and failing during cleanup.

### Model catalog

File: `apps/server/src/routes/models.ts`

- `AvailableModel` shape is defined at lines 28-39.
- Cloud voice models are curated only at lines 120-179.
- Cleanup LLM providers are allow-listed at lines 181-188.
- Curated cleanup IDs are tracked at lines 190-202.
- Built-in cleanup LLM entries are at lines 204-223.
- `fetchModelsFromRegistry()` pulls `models.dev` at lines 229-243.
- `/available` filters registry models to text-in/text-out LLMs at lines
  343-369.
- Built-ins are deduped into the result at lines 372-380.
- `getModelCost()` is used later by cleanup history/cost tracking at lines
  251-274.
- `isCleanupModelSupported()` prevents unsuitable/deprecated models from running
  at lines 276-305.

OpenRouter should either:

1. Use the OpenRouter `/models` endpoint directly, which is more reliable for an
   OpenRouter catalog; or
2. Rely on `models.dev` if it exposes an `openrouter` provider key.

Recommended: use OpenRouter's own `/models` endpoint and keep `models.dev` for
the existing direct providers.

### Renderer model/key flow

File: `apps/electron/src/renderer/src/lib/models.ts`

- `LLM_PROVIDERS` is the renderer-side provider allow-list at lines 94-102.
- `PROVIDER_DISPLAY_NAMES` already contains `openrouter: "OpenRouter"` at lines
  104-118.
- `PROVIDER_KEY_URLS` needs an OpenRouter key link at lines 120-130.

File: `apps/electron/src/renderer/src/pages/models/utils.ts`

- `groupByProvider()` filters available LLM models through `LLM_PROVIDERS` at
  lines 27-53. OpenRouter will not appear until `LLM_PROVIDERS` includes it.

File: `apps/electron/src/renderer/src/pages/models/index.tsx`

- `onPickCloud()` is already generic. Any non-local, non-Freestyle-Cloud
  provider without a stored key goes through the key modal at lines 149-179.

File: `apps/electron/src/renderer/src/components/model-row.tsx`

- `PROVIDER_FILTER_MARKS` has compact marks for provider filter chips at lines
  7-13. Add `openrouter: "OR"` for a clean fallback if the logo cannot load.

## Recommended Scope: Vercel AI SDK-Only OpenRouter Integration

### 1. Add a shared OpenRouter AI SDK helper module

Add `apps/server/src/lib/openrouter.ts`. This file is the only place that knows
how OpenRouter maps onto the Vercel AI SDK.

Recommended contents:

```ts
import { createOpenAI } from "@ai-sdk/openai";

export const OPENROUTER_PROVIDER_ID = "openrouter";
export const OPENROUTER_PROVIDER_NAME = "OpenRouter";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const OPENROUTER_HEADERS = {
  "HTTP-Referer": "https://github.com/freestyle-voice/freestyle",
  "X-OpenRouter-Title": "Freestyle",
  "X-OpenRouter-Categories": "writing-assistant",
} as const;

export function createOpenRouterAiSdkProvider(config: { apiKey: string }) {
  return createOpenAI({
    apiKey: config.apiKey,
    baseURL: OPENROUTER_BASE_URL,
    name: OPENROUTER_PROVIDER_ID,
    headers: OPENROUTER_HEADERS,
  });
}

export function createOpenRouterChatModel(apiKey: string, modelId: string) {
  return createOpenRouterAiSdkProvider({ apiKey }).chat(modelId);
}

export function createOpenRouterTranscriptionModel(
  apiKey: string,
  modelId: string,
) {
  return createOpenRouterAiSdkProvider({ apiKey }).transcription(modelId);
}
```

Why this module:

- Keeps OpenRouter on the Vercel AI SDK boundary for both LLM and STT.
- Avoids repeating the base URL and attribution headers in providers, key
  validation, and model catalog code.
- Gives Phase 2 STT one place to use the same stock AI SDK provider factory.
  If that stock path is incompatible with OpenRouter STT, Phase 2 should stop
  and revisit the integration strategy rather than adding a fallback path.
- Prevents typos in `"openrouter"` across the server.

Privacy note:

- The attribution headers identify the app, not the user's transcript or key.
- Keep existing diagnostic rules: never log API keys, prompts, transcripts, or
  request bodies.

### 2. Add OpenRouter to `createChatModel()`

File: `apps/server/src/lib/providers.ts`

Minimal implementation:

- Import `OPENROUTER_PROVIDER_ID` and `createOpenRouterChatModel`.
- Add a factory entry:

```ts
[OPENROUTER_PROVIDER_ID]: (apiKey) => ({
  chat: (modelId) => createOpenRouterChatModel(apiKey, modelId),
}),
```

Do not add OpenRouter to `PROVIDER_PREFIXED_CHAT_MODELS`.

Do not add `@openrouter/sdk` or use chat-with-audio for the STT path. Keep the
OpenRouter integration on the Vercel AI SDK surface only.

### 3. Add OpenRouter key validation

File: `apps/server/src/lib/validate-key.ts`

Changes:

- Add a format hint:

```ts
openrouter: {
  prefix: "sk-or-",
  hint: 'OpenRouter keys usually start with "sk-or-".',
},
```

- Add a validator:

```ts
async function validateOpenRouter(apiKey: string): Promise<ValidationResult> {
  const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...OPENROUTER_HEADERS,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return { valid: true };
  if (res.status === 401) {
    return { valid: false, error: "Invalid API key. Please check and try again." };
  }
  if (res.status === 403) {
    return { valid: false, error: "API key lacks permission." };
  }
  return { valid: false, error: `OpenRouter returned HTTP ${res.status}.` };
}
```

- Add `openrouter: validateOpenRouter` to `LIVE_VALIDATORS`.

Open question to verify during implementation:

- Confirm that `GET /api/v1/models` with an invalid bearer token returns 401.
  If OpenRouter treats `/models` as fully public even with invalid auth, use the
  smallest non-billable authenticated endpoint available at implementation
  time, or keep only the format pre-check and rely on first-use errors.

### 4. Fetch OpenRouter models directly

File: `apps/server/src/routes/models.ts`

Add types:

```ts
interface OpenRouterModel {
  id: string;
  name: string;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    modality?: string | null;
  };
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}
```

Add a cache separate from `models.dev`:

```ts
let openRouterModelsCache:
  | { data: OpenRouterModel[]; fetchedAt: number }
  | null = null;
```

Add helper functions:

- `fetchOpenRouterModels(): Promise<OpenRouterModel[]>`
- `isOpenRouterTextModel(model: OpenRouterModel): boolean`
- `openRouterPricingPerToken(model: OpenRouterModel)`
- `openRouterToAvailableModel(model: OpenRouterModel): AvailableModel`

Filtering rules:

- Include only text input and text output:
  `architecture.input_modalities.includes("text")` and
  `architecture.output_modalities.includes("text")`.
- Reuse `isCleanupSuitableModel()` by adapting `{ id, name, family }`.
- Exclude obvious image, embedding, moderation, guardrail, and classifier models
  through the existing `UNSUITABLE_CLEANUP_MODEL_PATTERN`.
- Treat `model.id.split("/")[0]` as `family` when OpenRouter does not provide a
  compatible family field.

Cost normalization:

- OpenRouter pricing examples use per-token string prices.
- `AvailableModel.cost_input` and `cost_output` currently mirror `models.dev`,
  which the server treats as per-million token prices.
- Store OpenRouter catalog costs as per-million values for consistency:

```ts
cost_input: Number(model.pricing?.prompt ?? 0) * 1_000_000,
cost_output: Number(model.pricing?.completion ?? 0) * 1_000_000,
```

Then update `getModelCost()` for `providerId === "openrouter"` to return
per-token prices directly:

```ts
return {
  input: Number(model.pricing?.prompt ?? 0),
  output: Number(model.pricing?.completion ?? 0),
};
```

Update `/available`:

- Fetch OpenRouter models in its own `try/catch`, just like `models.dev`.
- Append them before `BUILTIN_LLM_MODELS` are deduped.
- Do not let OpenRouter outage take down local, Freestyle Cloud, or existing
  curated models.

Update `isCleanupModelSupported()`:

- If `providerId === "openrouter"`, validate against the OpenRouter model cache.
- Return `false` when the model is missing or not text-in/text-out.
- Return `true` on fetch errors, matching the current permissive registry
  failure behavior at lines 302-304.

### 5. Curate the first OpenRouter cleanup models

File: `apps/server/src/routes/models.ts`

Add OpenRouter IDs to `CURATED_LLM_IDS` using the composed key format:

```ts
"openrouter/openai/gpt-4o-mini",
"openrouter/google/gemini-2.5-flash",
"openrouter/anthropic/claude-haiku-4-5",
```

The actual `model_id` stored in `model_configs` remains the native OpenRouter
ID, for example `openai/gpt-4o-mini`.

If a curated ID is not returned by `/models`, add one conservative
`BUILTIN_LLM_MODELS` fallback:

```ts
{
  provider_id: "openrouter",
  provider_name: "OpenRouter",
  model_id: "openai/gpt-4o-mini",
  model_name: "GPT-4o mini via OpenRouter",
  family: "openai",
  type: "llm",
  curated: true,
}
```

Keep the curated set small. The existing UI already hides non-curated LLMs
behind "Show all models", so a full OpenRouter catalog can become noisy.

### 6. Update renderer provider constants

File: `apps/electron/src/renderer/src/lib/models.ts`

Changes:

- Add `"openrouter"` to `LLM_PROVIDERS`.
- Keep the existing display name entry.
- Add a key URL:

```ts
openrouter: "https://openrouter.ai/keys",
```

File: `apps/electron/src/renderer/src/components/model-row.tsx`

Change:

```ts
openrouter: "OR",
```

No new Models page state or modal code is needed. `onPickCloud()` already opens
the key step for unknown BYOK providers.

Optional polish: the existing generic key-link text renders as
`Get a OpenRouter key`. If implementation touches that component anyway, make
the article grammar-aware; otherwise leave it alone to keep the Phase 1 change
small.

### 7. Update user-facing docs

Files:

- `README.md`
- `apps/docs/features/cleanup.mdx`
- `apps/docs/user-guide.mdx`

Changes:

- Add OpenRouter to cleanup/LLM provider lists.
- Add OpenRouter to transcription provider lists when the STT provider is wired
  through `transcribeWithAiSdk()`.
- Explain that OpenRouter uses one user-supplied key for both cleanup LLMs and
  transcription models.

No locale changes are required unless new visible strings are introduced. The
current key modal uses generic provider text and `displayName()`.

## Files That Should Not Need Phase 1 LLM Changes

- `apps/server/src/lib/streaming/registry.ts`
- `apps/server/src/lib/streaming/providers/*`
- `apps/server/src/lib/streaming/utils.ts`
- `apps/server/src/routes/transcribe.ts`
- `apps/server/src/lib/streaming-stt.ts`
- `apps/server/src/lib/schema.ts`
- `packages/validations/src/api-keys.ts`
- `packages/validations/src/models.ts`
- `apps/electron/src/renderer/src/pages/models/index.tsx`
- `apps/electron/src/renderer/src/pages/models/model-modal.tsx`
- `apps/electron/src/renderer/src/pages/models/model-list.tsx`

If one of these becomes necessary during Phase 1 implementation, re-check the
design: it likely means the change is drifting from cleanup LLM support into
Phase 2 voice/STT or custom UI behavior.

## Test Plan

### Unit tests: key validation

Add `apps/server/tests/validate-key.test.ts`.

Cases:

- `validateApiKey("openrouter", "bad")` returns the format hint without calling
  `fetch`.
- `validateApiKey("openrouter", "sk-or-v1-test")` calls
  `https://openrouter.ai/api/v1/models` with:
  - `Authorization: Bearer sk-or-v1-test`
  - `HTTP-Referer`
  - `X-OpenRouter-Title`
  - `X-OpenRouter-Categories`
- HTTP 200 returns `{ valid: true }`.
- HTTP 401 returns the standard invalid-key message.
- HTTP 403 returns a permission message.
- Timeout returns the existing timeout message.
- Network failure returns the existing "Could not reach openrouter API" pattern.

### Unit tests: provider factory

Add `apps/server/tests/openrouter-provider.test.ts`.

Use `vi.mock("@ai-sdk/openai", ...)` before importing `openrouter.ts` and
`providers.ts`.

Cases:

- `createOpenRouterAiSdkProvider({ apiKey })` calls `createOpenAI()` with:
  - `apiKey` from the caller
  - `baseURL: "https://openrouter.ai/api/v1"`
  - `name: "openrouter"`
  - OpenRouter attribution headers
- `createChatModel("openrouter", "anthropic/claude-sonnet-4")` delegates through
  `createOpenRouterChatModel()`.
- The `chat()` model ID is exactly `anthropic/claude-sonnet-4`, not stripped to
  `claude-sonnet-4`.
- `createOpenRouterTranscriptionModel(apiKey, "openai/whisper-large-v3")`
  delegates to the same AI SDK provider factory. Add this in Phase 1 even before
  wiring the transcription provider.
- Missing OpenRouter key throws `No API key configured for provider: openrouter`.
- Unknown provider behavior remains unchanged.

### Unit tests: model catalog and pricing

Add `apps/server/tests/openrouter-models.test.ts`.

Stub `global.fetch` so:

- `https://models.dev/api.json` returns `{}`.
- `https://openrouter.ai/api/v1/models` returns a small fixture:

```json
{
  "data": [
    {
      "id": "openai/gpt-4o-mini",
      "name": "GPT-4o mini",
      "architecture": {
        "input_modalities": ["text"],
        "output_modalities": ["text"]
      },
      "pricing": {
        "prompt": "0.00000015",
        "completion": "0.0000006"
      }
    },
    {
      "id": "openai/dall-e-3",
      "name": "DALL-E 3",
      "architecture": {
        "input_modalities": ["text"],
        "output_modalities": ["image"]
      },
      "pricing": {}
    }
  ]
}
```

Cases:

- `GET /api/models/available` includes `openai/gpt-4o-mini` with
  `provider_id: "openrouter"` and `type: "llm"`.
- The image-output model is excluded.
- OpenRouter costs are exposed as per-million values in `AvailableModel`.
- `getModelCost("openrouter", "openai/gpt-4o-mini")` returns per-token input
  and output costs.
- `isCleanupModelSupported("openrouter", "openai/gpt-4o-mini")` is `true`.
- `isCleanupModelSupported("openrouter", "openai/dall-e-3")` is `false`.
- If OpenRouter fetch fails, `/api/models/available` still returns existing
  built-in/local/Freestyle models.

### Integration tests: API key routes

Extend `apps/server/tests/api.test.ts` or add a focused file.

Cases:

- `POST /api/keys` stores an OpenRouter key.
- `GET /api/keys` returns `provider: "openrouter"` and only a last-4 hint.
- `GET /api/keys/openrouter` never returns the raw key.
- `DELETE /api/keys/openrouter` removes the key.

The generic API key route probably already passes these, but one explicit
OpenRouter case protects the new provider ID and hint behavior.

### Renderer/type tests

No renderer unit test framework is currently wired for model constants. Use
typecheck/build verification:

- `pnpm --filter @freestyle-voice/electron typecheck:web`

Manual UI verification:

- Open Settings -> Models -> Cleanup model.
- Confirm OpenRouter appears in cloud provider filters once available models
  include it.
- Pick an OpenRouter model with no key.
- Confirm the Add key modal says "Add your OpenRouter API key".
- Confirm the "Get a OpenRouter key" link opens `https://openrouter.ai/keys`.
- If the optional article polish is implemented, confirm this reads
  "Get an OpenRouter key" instead.
- Save a stubbed/real key and confirm the selected model becomes the default
  cleanup model.

### Full verification commands

Run after implementation:

```bash
pnpm --filter @freestyle-voice/server test
pnpm --filter @freestyle-voice/server build
pnpm --filter @freestyle-voice/electron typecheck:web
pnpm build
```

## Phase 2: OpenRouter STT via Vercel AI SDK

OpenRouter's OpenAPI spec includes `/audio/transcriptions`, and the Vercel AI
SDK already exposes `experimental_transcribe`. The app should wire OpenRouter
STT through the existing `transcribeWithAiSdk()` helper, not through a separate
SDK and not through chat completions with audio attachments.

Phase 2 files:

- `apps/server/src/lib/openrouter.ts`
- `apps/server/src/lib/streaming/providers/openrouter.ts`
- `apps/server/src/lib/streaming/registry.ts`
- `apps/server/src/routes/models.ts`
- `apps/electron/src/renderer/src/lib/models.ts`
- `apps/server/tests/streaming-capabilities.test.ts`
- New provider tests for SDK delegation, language forwarding, error handling,
  and no realtime streaming support.

Implementation shape:

```ts
export class OpenRouterTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = OPENROUTER_PROVIDER_ID;

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    return transcribeWithAiSdk(
      opts,
      createOpenRouterAiSdkProvider,
      this.providerId,
    );
  }

  supportsStreaming(): boolean {
    return false;
  }
}
```

Compatibility check:

- Test `createOpenRouterAiSdkProvider({ apiKey }).transcription(modelId)` against
  one real OpenRouter STT model.
- If the stock OpenAI-compatible provider cannot reach OpenRouter STT correctly,
  do not add a fallback implementation in this plan. Mark STT as blocked and
  revisit whether the project should accept a non-AI-SDK OpenRouter client or
  wait for AI SDK/OpenRouter provider support.
- This keeps the integration strictly Vercel AI SDK-only: routes and streaming
  providers depend on AI SDK model interfaces, not `@openrouter/sdk`.

Model/UI rules:

- Store `provider_id = "openrouter"` and native OpenRouter STT model IDs such as
  `openai/whisper-large-v3` in `model_configs`.
- Add OpenRouter to `CLOUD_VOICE_PROVIDERS` only when this provider is wired.
- Add `VOICE_META` entries for curated OpenRouter STT models so the UI shows
  cost/speed/quality consistently.
- Do not advertise realtime streaming until OpenRouter has a compatible realtime
  transcription API.

## Risks and Mitigations

- **Huge model catalog:** OpenRouter exposes many models. Mitigate by showing
  only curated models by default and relying on the existing "Show all models"
  expansion/search.
- **Model ID confusion:** Do not store `openrouter/<model>`. Store the native
  OpenRouter ID and keep provider separately.
- **Cost mismatch:** Normalize OpenRouter pricing strings carefully. Use
  per-million values for UI/catalog fields and per-token values for history
  cost math.
- **Provider-specific params:** Avoid OpenRouter-specific `providerOptions` in
  `post-process.ts` for Phase 1. Start with the same `temperature: 0` and
  `maxOutputTokens` behavior used for other providers.
- **Dependency churn:** Use the existing Vercel AI SDK packages. Do not add
  `@openrouter/sdk` for this integration.
- **Validation uncertainty:** Confirm invalid bearer behavior on `/models`.
  Keep tests stubbed and add one manual validation pass with a real revoked or
  malformed OpenRouter key before shipping.

## Implementation Order

1. Add `apps/server/src/lib/openrouter.ts` with constants,
   `createOpenRouterAiSdkProvider()`, `createOpenRouterChatModel()`, and
   `createOpenRouterTranscriptionModel()`.
2. Add the OpenRouter chat factory to `apps/server/src/lib/providers.ts` through
   `createOpenRouterChatModel()`.
3. Add OpenRouter key validation in `apps/server/src/lib/validate-key.ts`.
4. Add OpenRouter model fetch, filtering, pricing, and support checks in
   `apps/server/src/routes/models.ts` for cleanup LLMs.
5. Add OpenRouter to renderer LLM provider constants in
   `apps/electron/src/renderer/src/lib/models.ts`.
6. Add `openrouter: "OR"` to
   `apps/electron/src/renderer/src/components/model-row.tsx`.
7. Update README and docs provider lists for cleanup LLM support.
8. Add server tests for validation, shared SDK helper, provider factory, model
   catalog/pricing, and generic API key route behavior.
9. Run server tests, server build, renderer typecheck, then full build.
10. Manual smoke test the Models page key flow and one real cleanup request.
11. Phase 2: add `OpenRouterTranscriptionProvider` through
    `transcribeWithAiSdk(opts, createOpenRouterAiSdkProvider, "openrouter")`.
12. Phase 2: run a real OpenRouter STT compatibility test through
    `createOpenRouterAiSdkProvider({ apiKey }).transcription(modelId)`. If it
    fails because the stock AI SDK request shape is incompatible, stop and mark
    STT as blocked instead of adding a fallback implementation.
13. Phase 2: once compatibility is confirmed, add curated OpenRouter voice
    models, renderer voice constants, `VOICE_META`, registry wiring, and STT
    tests.
