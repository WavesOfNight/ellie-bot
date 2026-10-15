import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FALLBACK_LINES } from "../src/fallback-lines.js";
import { ConcurrencyLimiter, BUSY } from "../src/limits.js";
import { silentLogger } from "../src/logger.js";
import { EllieResponder, type EllieRespondRequest } from "../src/responder.js";
import { FakeClaudeClient, fakeResponse, MemoryUsageStore } from "./helpers.js";

function setup(options: { now?: Date } = {}) {
  let current = options.now ?? new Date("2026-10-15T18:00:00Z");
  const client = new FakeClaudeClient(fakeResponse({ text: "Salut toi." }));
  const store = new MemoryUsageStore();
  const responder = new EllieResponder({
    store,
    getClient: async () => client,
    now: () => current,
    random: () => 0,
    logger: silentLogger,
  });
  const advance = (ms: number) => {
    current = new Date(current.getTime() + ms);
  };
  return { client, store, responder, advance };
}

function discordRequest(overrides: Partial<EllieRespondRequest> = {}): EllieRespondRequest {
  return {
    scope: "guild-1",
    userKey: "guild-1:user-1",
    channelKey: "channel-1",
    limits: { userCooldownSeconds: 20, channelMaxPerMinute: 6, dailyReplyCap: 200 },
    canReact: true,
    logContext: "discord guild=guild-1 channel=channel-1",
    input: { platform: "discord", model: "claude-opus-5-5", authorName: "Lou", message: "salut" },
    ...overrides,
  };
}

describe("orchestration (cooldowns, plafond, comptage)", () => {
  it("répond puis comptabilise la consommation", async () => {
    const { responder, store, client } = setup();
    const action = await responder.respond(discordRequest());
    assert.equal(action.kind, "reply");
    assert.equal(client.requests.length, 1);
    assert.equal(store.recorded.length, 1);
    assert.equal(store.recorded[0]?.delta.replies, 1);
    assert.equal(store.recorded[0]?.date, "2026-10-15");
  });

  it("cooldown utilisateur : aucun appel, une seule réaction ⏳ par cooldown", async () => {
    const { responder, client, advance } = setup();
    await responder.respond(discordRequest());
    advance(5_000);
    assert.deepEqual(await responder.respond(discordRequest()), { kind: "react", emoji: "⏳" });
    advance(1_000);
    assert.deepEqual(await responder.respond(discordRequest()), { kind: "silent", reason: "cooldown" });
    assert.equal(client.requests.length, 1);
    advance(20_000);
    assert.equal((await responder.respond(discordRequest())).kind, "reply");
    assert.equal(client.requests.length, 2);
  });

  it("plafond par salon et par minute", async () => {
    const { responder, client } = setup();
    const limits = { userCooldownSeconds: 5, channelMaxPerMinute: 2, dailyReplyCap: 200 };
    await responder.respond(discordRequest({ userKey: "a", limits }));
    await responder.respond(discordRequest({ userKey: "b", limits }));
    assert.deepEqual(await responder.respond(discordRequest({ userKey: "c", limits })), { kind: "react", emoji: "⏳" });
    assert.equal(client.requests.length, 2);
  });

  it("plafond quotidien : une seule réplique « plafond » (sans API), puis 💤", async () => {
    const { responder, store, client } = setup();
    store.replies.set("guild-1:2026-10-15", 200);
    const first = await responder.respond(discordRequest());
    assert.equal(first.kind, "reply");
    assert.ok(first.kind === "reply" && FALLBACK_LINES.plafond.includes(first.text));
    assert.deepEqual(await responder.respond(discordRequest({ userKey: "autre" })), { kind: "react", emoji: "💤" });
    assert.equal(client.requests.length, 0);
  });

  it("Twitch : cooldown global et plafond en silence (pas de réaction possible)", async () => {
    const { responder, store, client, advance } = setup();
    const twitch = (userKey: string): EllieRespondRequest => ({
      scope: "TWITCH",
      userKey,
      limits: { userCooldownSeconds: 30, globalCooldownSeconds: 10, dailyReplyCap: 100 },
      canReact: false,
      logContext: "twitch",
      input: { platform: "twitch", model: "claude-haiku-5-5", authorName: "viewer", message: "salut" },
    });
    assert.equal((await responder.respond(twitch("a"))).kind, "reply");
    assert.deepEqual(await responder.respond(twitch("b")), { kind: "silent", reason: "cooldown" });
    assert.deepEqual(await responder.respond(twitch("a")), { kind: "silent", reason: "cooldown" });
    assert.equal(client.requests.length, 1);
    assert.equal("betas" in (client.requests[0] ?? {}), false, "Haiku : pas de repli serveur");

    advance(11_000);
    store.replies.set("TWITCH:2026-10-15", 100);
    assert.equal((await responder.respond(twitch("c"))).kind, "reply");
    assert.deepEqual(await responder.respond(twitch("d")), { kind: "silent", reason: "plafond" });
    assert.equal(client.requests.length, 1);
  });

  it("sans clé API : silence, aucun appel", async () => {
    const responder = new EllieResponder({ store: new MemoryUsageStore(), getClient: async () => null, logger: silentLogger });
    assert.deepEqual(await responder.respond(discordRequest()), { kind: "silent", reason: "pas_de_cle" });
  });

  it("concurrence limitée : les appels en trop sont abandonnés après le délai d'attente", async () => {
    const limiter = new ConcurrencyLimiter(1, 20);
    let release: () => void = () => {};
    const slow = limiter.run(() => new Promise<string>((resolve) => (release = () => resolve("ok"))));
    assert.equal(await limiter.run(async () => "trop tard"), BUSY);
    release();
    assert.equal(await slow, "ok");
    assert.equal(await limiter.run(async () => "libre"), "libre");
  });
});
