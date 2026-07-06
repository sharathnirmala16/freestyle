import { Buffer } from "node:buffer";
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_HEADERS,
  OPENROUTER_PROVIDER_ID,
} from "../../openrouter.js";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { stripProviderPrefix } from "../types.js";

export class OpenRouterTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = OPENROUTER_PROVIDER_ID;

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const nativeModel = stripProviderPrefix(opts.model);
    const audioBase64 = Buffer.from(opts.audio).toString("base64");

    const payload: Record<string, any> = {
      model: nativeModel,
      input_audio: {
        data: audioBase64,
        format: "wav",
      },
    };

    if (opts.language && opts.language !== "auto") {
      payload.language = opts.language;
    }

    const res = await fetch(`${OPENROUTER_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
        ...OPENROUTER_HEADERS,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `OpenRouter STT request failed with status ${res.status}: ${text}`,
      );
    }

    const data = (await res.json()) as {
      text: string;
      usage?: { seconds?: number };
    };

    return {
      text: data.text || "",
      durationInSeconds: data.usage?.seconds,
    };
  }

  supportsStreaming(_modelId: string): boolean {
    return false;
  }
}
