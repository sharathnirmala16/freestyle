import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import createApp from "../src/index.js";
import { getDb } from "../src/lib/db.js";

const app = createApp();

describe("API Keys Endpoint Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDb()
      .prepare("DELETE FROM api_keys WHERE provider = ?")
      .run("openrouter");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    getDb()
      .prepare("DELETE FROM api_keys WHERE provider = ?")
      .run("openrouter");
  });

  it("handles the API key lifecycle (POST, GET, DELETE) for openrouter", async () => {
    // 1. Initially, GET /api/keys/openrouter should return 404
    const getInitial = await app.request("/api/keys/openrouter");
    expect(getInitial.status).toBe(404);

    // 2. POST /api/keys to store an OpenRouter key
    const postRes = await app.request("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openrouter",
        key: "sk-or-v1-mytestkey12345",
      }),
    });
    expect(postRes.status).toBe(200);
    expect(await postRes.json()).toEqual({
      provider: "openrouter",
      configured: true,
    });

    // 3. GET /api/keys/openrouter should now return status and configured details (no raw key)
    const getRes = await app.request("/api/keys/openrouter");
    expect(getRes.status).toBe(200);
    const details = (await getRes.json()) as any;
    expect(details.provider).toBe("openrouter");
    expect(details.configured).toBe(true);
    expect(details.status).toBe("valid");
    expect(details.key).toBeUndefined(); // raw key must not be returned!

    // 4. GET /api/keys should list the key and expose only a last-4 hint
    const listRes = await app.request("/api/keys");
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as any[];
    const entry = list.find((k) => k.provider === "openrouter");
    expect(entry).toBeDefined();
    expect(entry.hint).toBe("…2345");
    expect(entry.key).toBeUndefined(); // raw key must not be returned!

    // 5. DELETE /api/keys/openrouter should remove the key
    const delRes = await app.request("/api/keys/openrouter", {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({ ok: true });

    // 6. GET /api/keys/openrouter should return 404 again
    const getFinal = await app.request("/api/keys/openrouter");
    expect(getFinal.status).toBe(404);
  });

  it("POST /api/keys/validate validates format or live API", async () => {
    // Format check returns invalid immediately without calling fetch
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const valRes = await app.request("/api/keys/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openrouter",
        key: "invalid-prefix-key",
      }),
    });
    expect(valRes.status).toBe(200);
    expect(await valRes.json()).toEqual({
      valid: false,
      error: 'OpenRouter keys usually start with "sk-or-".',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
