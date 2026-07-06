import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import createApp from "../src/index.js";
import {
  getModelCost,
  isCleanupModelSupported,
  resetModelsCacheForTesting,
} from "../src/routes/models.js";

const app = createApp();

const OPENROUTER_API_FIXTURE = {
  data: [
    {
      id: "openai/gpt-4o-mini",
      name: "GPT-4o mini",
      architecture: {
        input_modalities: ["text"],
        output_modalities: ["text"],
      },
      pricing: {
        prompt: "0.00000015",
        completion: "0.0000006",
      },
    },
    {
      id: "openai/dall-e-3",
      name: "DALL-E 3",
      architecture: {
        input_modalities: ["text"],
        output_modalities: ["image"],
      },
      pricing: {},
    },
  ],
};

describe("OpenRouter Model Catalog & Pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetModelsCacheForTesting();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET /api/models/available returns openrouter models and excludes unsuitable ones", async () => {
    const fetchSpy = vi.fn((url: string) => {
      if (url.includes("models.dev/api.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response);
      }
      if (url.includes("openrouter.ai/api/v1/models")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(OPENROUTER_API_FIXTURE),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const res = await app.request("/api/models/available");
    expect(res.status).toBe(200);
    const available = (await res.json()) as any[];

    // Should include GPT-4o mini (as text-in/text-out)
    const mini = available.find(
      (m) =>
        m.provider_id === "openrouter" && m.model_id === "openai/gpt-4o-mini",
    );
    expect(mini).toBeDefined();
    expect(mini.model_name).toBe("GPT-4o mini");
    expect(mini.family).toBe("openai");
    expect(mini.type).toBe("llm");
    // Costs are converted to per-million:
    // prompt: 0.00000015 * 1,000,000 = 0.15
    // completion: 0.0000006 * 1,000,000 = 0.60
    expect(mini.cost_input).toBeCloseTo(0.15);
    expect(mini.cost_output).toBeCloseTo(0.6);

    // Should exclude DALL-E 3 (as it is not text-only or is unsuitable)
    const dalle = available.find(
      (m) => m.provider_id === "openrouter" && m.model_id === "openai/dall-e-3",
    );
    expect(dalle).toBeUndefined();
  });

  it("getModelCost returns per-token prompt and completion costs", async () => {
    const fetchSpy = vi.fn((url: string) => {
      if (url.includes("openrouter.ai/api/v1/models")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(OPENROUTER_API_FIXTURE),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const cost = await getModelCost("openrouter", "openai/gpt-4o-mini");
    expect(cost).toEqual({
      input: 0.00000015,
      output: 0.0000006,
    });
  });

  it("isCleanupModelSupported checks if the model is compatible", async () => {
    const fetchSpy = vi.fn((url: string) => {
      if (url.includes("openrouter.ai/api/v1/models")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(OPENROUTER_API_FIXTURE),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const isMiniSupported = await isCleanupModelSupported(
      "openrouter",
      "openai/gpt-4o-mini",
    );
    expect(isMiniSupported).toBe(true);

    const isDalleSupported = await isCleanupModelSupported(
      "openrouter",
      "openai/dall-e-3",
    );
    expect(isDalleSupported).toBe(false);
  });

  it("GET /api/models/available returns built-in fallback models when OpenRouter fetch fails", async () => {
    const fetchSpy = vi.fn((url: string) => {
      if (url.includes("models.dev/api.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response);
      }
      // Fail OpenRouter fetch
      if (url.includes("openrouter.ai/api/v1/models")) {
        return Promise.resolve({
          ok: false,
          status: 500,
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const res = await app.request("/api/models/available");
    expect(res.status).toBe(200);
    const available = (await res.json()) as any[];

    // Ensure it still has the fallback models
    const fallback = available.find(
      (m) =>
        m.provider_id === "openrouter" &&
        m.model_id === "google/gemma-4-26b-a4b-it",
    );
    expect(fallback).toBeDefined();
    expect(fallback.model_name).toBe("Gemma 4 26B A4B IT Free via OpenRouter");
  });
});
