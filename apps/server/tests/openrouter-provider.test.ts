import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to declare mock functions before they are referenced in the hoisted vi.mock call.
const { mockChat, mockTranscription, mockCreateOpenAI } = vi.hoisted(() => {
  const chatFn = vi.fn((modelId) => ({ type: "chat", modelId }));
  const transFn = vi.fn((modelId) => ({ type: "transcription", modelId }));
  const createOpenAIFn = vi.fn(() => ({
    chat: chatFn,
    transcription: transFn,
  }));
  return {
    mockChat: chatFn,
    mockTranscription: transFn,
    mockCreateOpenAI: createOpenAIFn,
  };
});

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mockCreateOpenAI,
}));

import { getDb } from "../src/lib/db.js";
// Now import target modules AFTER mocking
import {
  createOpenRouterAiSdkProvider,
  createOpenRouterChatModel,
  createOpenRouterTranscriptionModel,
} from "../src/lib/openrouter.js";
import { createChatModel } from "../src/lib/providers.js";

describe("OpenRouter Provider & Factory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDb()
      .prepare("DELETE FROM api_keys WHERE provider = ?")
      .run("openrouter");
  });

  afterEach(() => {
    getDb()
      .prepare("DELETE FROM api_keys WHERE provider = ?")
      .run("openrouter");
  });

  it("createOpenRouterAiSdkProvider initializes createOpenAI with correct options", () => {
    createOpenRouterAiSdkProvider({ apiKey: "test-key" });

    expect(mockCreateOpenAI).toHaveBeenCalledTimes(1);
    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://openrouter.ai/api/v1",
      name: "openrouter",
      headers: {
        "HTTP-Referer": "https://github.com/freestyle-voice/freestyle",
        "X-OpenRouter-Title": "Freestyle",
        "X-OpenRouter-Categories": "writing-assistant",
      },
    });
  });

  it("createOpenRouterChatModel returns a chat model", () => {
    const chatModel = createOpenRouterChatModel(
      "test-key",
      "anthropic/claude-sonnet-4",
    );
    expect(mockChat).toHaveBeenCalledWith("anthropic/claude-sonnet-4");
    expect(chatModel).toEqual({
      type: "chat",
      modelId: "anthropic/claude-sonnet-4",
    });
  });

  it("createOpenRouterTranscriptionModel returns a transcription model", () => {
    const transModel = createOpenRouterTranscriptionModel(
      "test-key",
      "openai/whisper-large-v3",
    );
    expect(mockTranscription).toHaveBeenCalledWith("openai/whisper-large-v3");
    expect(transModel).toEqual({
      type: "transcription",
      modelId: "openai/whisper-large-v3",
    });
  });

  it("createChatModel throws when OpenRouter key is missing", () => {
    expect(() => createChatModel("openrouter", "openai/gpt-4o-mini")).toThrow(
      "No API key configured for provider: openrouter",
    );
  });

  it("createChatModel creates correct chat model with native ID preserving vendor prefix when key is present", () => {
    getDb()
      .prepare(
        "INSERT OR REPLACE INTO api_keys (provider, key, created_at, status) VALUES (?, ?, datetime('now'), 'valid')",
      )
      .run("openrouter", "sk-or-test-key");

    createChatModel("openrouter", "google/gemini-2.5-flash");

    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-or-test-key" }),
    );
    expect(mockChat).toHaveBeenCalledWith("google/gemini-2.5-flash");
  });
});
