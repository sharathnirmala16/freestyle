import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENROUTER_BASE_URL } from "../src/lib/openrouter.js";
import { OpenRouterTranscriptionProvider } from "../src/lib/streaming/providers/openrouter.js";
import { getProvider } from "../src/lib/streaming/registry.js";

describe("OpenRouterTranscriptionProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is registered correctly in the registry", () => {
    const provider = getProvider("openrouter");
    expect(provider).toBeInstanceOf(OpenRouterTranscriptionProvider);
    expect(provider?.providerId).toBe("openrouter");
  });

  it("supportsStreaming returns false", () => {
    const provider = new OpenRouterTranscriptionProvider();
    expect(provider.supportsStreaming("openai/whisper-large-v3-turbo")).toBe(
      false,
    );
  });

  it("transcribe converts audio to base64, strips prefix, and sends correct JSON payload", async () => {
    const provider = new OpenRouterTranscriptionProvider();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          text: "transcribed text content",
          usage: { seconds: 15.5 },
        }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const audio = new Uint8Array([1, 2, 3, 4]);
    const expectedBase64 = Buffer.from(audio).toString("base64");

    const result = await provider.transcribe({
      audio,
      model: "openrouter/openai/whisper-large-v3-turbo",
      apiKey: "sk-or-test-key",
    });

    expect(result).toEqual({
      text: "transcribed text content",
      durationInSeconds: 15.5,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${OPENROUTER_BASE_URL}/audio/transcriptions`);
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer sk-or-test-key",
      "HTTP-Referer": "https://github.com/freestyle-voice/freestyle",
      "X-OpenRouter-Title": "Freestyle",
      "X-OpenRouter-Categories": "writing-assistant",
    });

    const body = JSON.parse(options.body);
    expect(body).toEqual({
      model: "openai/whisper-large-v3-turbo",
      input_audio: {
        data: expectedBase64,
        format: "wav",
      },
    });
  });

  it("forwards language code when specific language is requested", async () => {
    const provider = new OpenRouterTranscriptionProvider();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: "hello" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await provider.transcribe({
      audio: new Uint8Array([1, 2]),
      model: "openrouter/openai/whisper-large-v3-turbo",
      apiKey: "sk-or-test-key",
      language: "fr",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.language).toBe("fr");
  });

  it("does not forward language when language is auto or undefined", async () => {
    const provider = new OpenRouterTranscriptionProvider();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: "hello" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    // Test with "auto"
    await provider.transcribe({
      audio: new Uint8Array([1, 2]),
      model: "openrouter/openai/whisper-large-v3-turbo",
      apiKey: "sk-or-test-key",
      language: "auto",
    });

    const bodyAuto = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(bodyAuto.language).toBeUndefined();

    // Test with undefined
    await provider.transcribe({
      audio: new Uint8Array([1, 2]),
      model: "openrouter/openai/whisper-large-v3-turbo",
      apiKey: "sk-or-test-key",
    });

    const bodyUndefined = JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(bodyUndefined.language).toBeUndefined();
  });

  it("throws error with status and text detail when STT request fails", async () => {
    const provider = new OpenRouterTranscriptionProvider();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad Request Details"),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      provider.transcribe({
        audio: new Uint8Array([1]),
        model: "openrouter/openai/whisper-large-v3-turbo",
        apiKey: "sk-or-test-key",
      }),
    ).rejects.toThrow(
      "OpenRouter STT request failed with status 400: Bad Request Details",
    );
  });
});
