import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENROUTER_BASE_URL } from "../src/lib/openrouter.js";
import { validateApiKey } from "../src/lib/validate-key.js";

describe("validateApiKey - openrouter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns format hint immediately without fetch for invalid prefix", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await validateApiKey("openrouter", "bad-key-format");
    expect(result).toEqual({
      valid: false,
      error: 'OpenRouter keys usually start with "sk-or-".',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls openrouter API and returns valid for HTTP 200", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await validateApiKey("openrouter", "sk-or-v1-test");
    expect(result).toEqual({ valid: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${OPENROUTER_BASE_URL}/models`);
    expect(options.headers).toMatchObject({
      Authorization: "Bearer sk-or-v1-test",
      "HTTP-Referer": "https://github.com/freestyle-voice/freestyle",
      "X-OpenRouter-Title": "Freestyle",
      "X-OpenRouter-Categories": "writing-assistant",
    });
  });

  it("returns standard invalid key error for HTTP 401", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await validateApiKey("openrouter", "sk-or-v1-invalid");
    expect(result).toEqual({
      valid: false,
      error: "Invalid API key. Please check and try again.",
    });
  });

  it("returns lacks permission error for HTTP 403", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await validateApiKey("openrouter", "sk-or-v1-forbidden");
    expect(result).toEqual({
      valid: false,
      error: "API key lacks permission.",
    });
  });

  it("returns generic status error for other HTTP failures", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await validateApiKey("openrouter", "sk-or-v1-error500");
    expect(result).toEqual({
      valid: false,
      error: "OpenRouter returned HTTP 500.",
    });
  });

  it("returns timeout error when fetch times out", async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValue(new DOMException("Timeout", "TimeoutError"));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await validateApiKey("openrouter", "sk-or-v1-timeout");
    expect(result).toEqual({
      valid: false,
      error: "Validation timed out. Check your network and try again.",
    });
  });

  it("returns reach API error on network failure", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("Network Error"));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await validateApiKey("openrouter", "sk-or-v1-fail");
    expect(result).toEqual({
      valid: false,
      error:
        "Could not reach openrouter API. Check your network and try again.",
    });
  });
});
