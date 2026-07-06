/**
 * OpenRouter constants and Vercel AI SDK helpers shared across the server.
 *
 * This is the only place that knows how OpenRouter maps onto the Vercel AI SDK.
 * Both LLM cleanup and future STT go through the same `createOpenAI` factory.
 *
 * Privacy: the headers identify the app, not the user's transcript or key.
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, experimental_transcribe as transcribe } from "ai";

export const OPENROUTER_PROVIDER_ID = "openrouter";
export const OPENROUTER_PROVIDER_NAME = "OpenRouter";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const OPENROUTER_HEADERS = {
  "HTTP-Referer": "https://github.com/freestyle-voice/freestyle",
  "X-OpenRouter-Title": "Freestyle",
  "X-OpenRouter-Categories": "writing-assistant",
} as const;

/** Transcription model type derived from the AI SDK transcribe signature. */
type TranscriptionModel = Parameters<typeof transcribe>[0]["model"];

export function createOpenRouterAiSdkProvider(config: { apiKey: string }) {
  return createOpenAI({
    apiKey: config.apiKey,
    baseURL: OPENROUTER_BASE_URL,
    name: OPENROUTER_PROVIDER_ID,
    headers: OPENROUTER_HEADERS,
  });
}

export function createOpenRouterChatModel(
  apiKey: string,
  modelId: string,
): LanguageModel {
  return createOpenRouterAiSdkProvider({ apiKey }).chat(modelId);
}

export function createOpenRouterTranscriptionModel(
  apiKey: string,
  modelId: string,
): TranscriptionModel {
  return createOpenRouterAiSdkProvider({ apiKey }).transcription(modelId);
}
