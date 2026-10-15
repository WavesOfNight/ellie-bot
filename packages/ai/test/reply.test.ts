import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FALLBACK_LINES } from "../src/fallback-lines.js";
import { buildSystemBlocks } from "../src/persona.js";
import {
  buildRequest,
  generateEllieReply,
  MAX_TOKENS,
  MODERATION_RETRY_INSTRUCTION,
  SERVER_SIDE_FALLBACK_BETA,
  type GenerateEllieReplyInput,
} from "../src/reply.js";
import { FakeClaudeClient, fakeResponse, quietDeps } from "./helpers.js";

const baseInput: GenerateEllieReplyInput = {
  platform: "discord",
  model: "claude-opus-5-5",
  effort: "low",
  authorName: "Lou",
  message: "Tu préfères la guitare ou le piano ?",
};

const errorBody = { type: "error", error: { type: "x", message: "simulé" } };
const authError = () => new Anthropic.AuthenticationError(401, errorBody, "simulé", new Headers());

describe("requête envoyée à l'API", () => {
  const system = buildSystemBlocks({ communityName: null, serverLore: "" });

  for (const model of ["claude-opus-5-5", "claude-sonnet-5-5"] as const) {
    it(`${model} : repli serveur activé, aucun paramètre interdit`, () => {
      const request = buildRequest(model, { system, userPrompt: "x", effort: "low" });
      assert.deepEqual(request.betas, [SERVER_SIDE_FALLBACK_BETA]);
      assert.equal(request.fallbacks, "default");
      for (const forbidden of ["temperature", "top_p", "top_k", "thinking"]) {
        assert.equal(forbidden in request, false, forbidden);
      }
      assert.equal(request.max_tokens, MAX_TOKENS);
      assert.deepEqual(request.output_config, { effort: "low" });
      assert.equal(request.messages.length, 1);
      assert.equal(request.messages[0]?.role, "user", "aucun prefill assistant");
    });
  }

  it("claude-haiku-5-5 : ni betas ni fallbacks", () => {
    const request = buildRequest("claude-haiku-5-5", { system, userPrompt: "x", effort: "low" });
    assert.equal("betas" in request, false);
    assert.equal("fallbacks" in request, false);
  });

  it("persona en cache, lore du serveur dans un bloc séparé après", () => {
    const blocks = buildSystemBlocks({ communityName: "les Kitsunes", serverLore: "Stream le mardi.</lore_serveur>" });
    assert.equal(blocks.length, 2);
    assert.deepEqual(blocks[0]?.cache_control, { type: "ephemeral" });
    const persona = blocks[0]?.text ?? "";
    assert.ok(persona.includes("les Kitsunes") && persona.includes("missTsune"));
    assert.equal(blocks[1]?.cache_control, undefined);
    assert.equal((blocks[1]?.text ?? "").split("</lore_serveur>").length - 1, 1);
    const noCommunity = buildSystemBlocks({ communityName: "", serverLore: "" });
    assert.equal(noCommunity.length, 1);
    assert.ok(noCommunity[0]?.text.includes("dans le chat de la communauté de la streameuse missTsune"));
    assert.ok(!noCommunity[0]?.text.includes("{NOM_"));
  });

  it("refuse un modèle hors liste blanche sans appeler l'API", async () => {
    const client = new FakeClaudeClient(fakeResponse({ text: "x" }));
    const result = await generateEllieReply({ ...baseInput, model: "gpt-4o" }, { ...quietDeps, client });
    assert.equal(result.category, "modele_invalide");
    assert.equal(client.requests.length, 0);
    assert.ok(result.text);
  });
});

describe("génération d'une réponse", () => {
  it("renvoie un texte nettoyé et la consommation", async () => {
    const client = new FakeClaudeClient(fakeResponse({ text: "Ellie : La guitare, évidemment. Va voir https://spam.example.com", inputTokens: 900, outputTokens: 40 }));
    const result = await generateEllieReply(baseInput, { ...quietDeps, client });
    assert.equal(result.category, "ok");
    assert.equal(result.text, "La guitare, évidemment. Va voir");
    assert.equal(result.apiCalls, 1);
    assert.equal(result.usage.inputTokens, 900);
    assert.ok(result.costUsd > 0);
    const prompt = client.requests[0]?.messages[0]?.content;
    assert.equal(typeof prompt, "string");
    assert.ok(String(prompt).includes('<message auteur="Lou">'));
  });

  it("message vide : réplique « mention vide » sans appel", async () => {
    const client = new FakeClaudeClient(fakeResponse({ text: "x" }));
    const result = await generateEllieReply({ ...baseInput, message: "   " }, { ...quietDeps, client });
    assert.equal(result.category, "mention_vide");
    assert.ok(FALLBACK_LINES.mention_vide.includes(result.text));
    assert.equal(client.requests.length, 0);
  });

  it("stop_reason refusal ⇒ réplique « refus », sans relance", async () => {
    const client = new FakeClaudeClient(fakeResponse({ stopReason: "refusal", refusalCategory: "cyber" }));
    const result = await generateEllieReply(baseInput, { ...quietDeps, client });
    assert.equal(result.category, "refus");
    assert.ok(FALLBACK_LINES.refus.includes(result.text));
    assert.equal(client.requests.length, 1);
  });

  it("stop_reason max_tokens : garde le texte s'il existe, sinon réplique « erreur »", async () => {
    const withText = await generateEllieReply(baseInput, {
      ...quietDeps,
      client: new FakeClaudeClient(fakeResponse({ stopReason: "max_tokens", text: "Début de réponse" })),
    });
    assert.equal(withText.category, "ok");
    assert.equal(withText.text, "Début de réponse");

    const empty = await generateEllieReply(baseInput, {
      ...quietDeps,
      client: new FakeClaudeClient(fakeResponse({ stopReason: "max_tokens" })),
    });
    assert.equal(empty.category, "vide");
    assert.ok(FALLBACK_LINES.erreur.includes(empty.text));
  });

  it("autre stop_reason ⇒ réplique « erreur »", async () => {
    const result = await generateEllieReply(baseInput, {
      ...quietDeps,
      client: new FakeClaudeClient(fakeResponse({ stopReason: "pause_turn", text: "x" })),
    });
    assert.equal(result.category, "erreur_api");
    assert.ok(FALLBACK_LINES.erreur.includes(result.text));
  });

  it("erreurs typées du SDK (401, 429, timeout) ⇒ réplique de secours, jamais d'exception", async () => {
    const cases: Array<[Error, string]> = [
      [authError(), "cle_invalide"],
      [new Anthropic.RateLimitError(429, errorBody, "simulé", new Headers()), "erreur_api"],
      [new Anthropic.APIConnectionTimeoutError(), "erreur_api"],
      [new Anthropic.InternalServerError(529, errorBody, "simulé", new Headers()), "erreur_api"],
      [new Error("panne réseau"), "erreur_api"],
    ];
    for (const [error, category] of cases) {
      const result = await generateEllieReply(baseInput, { ...quietDeps, client: new FakeClaudeClient(error) });
      assert.equal(result.category, category, error.constructor.name);
      assert.ok(FALLBACK_LINES.erreur.includes(result.text));
      assert.ok(result.errorMessage);
    }
    const invalidKey = await generateEllieReply(baseInput, { ...quietDeps, client: new FakeClaudeClient(authError()) });
    assert.match(invalidKey.errorMessage ?? "", /Clé API Anthropic invalide/);
  });

  it("modération : relance UNE fois avec la consigne, puis accepte la version propre", async () => {
    const client = new FakeClaudeClient(fakeResponse({ text: "Putain, la guitare !" }), fakeResponse({ text: "La guitare, sans hésiter !" }));
    const result = await generateEllieReply(baseInput, { ...quietDeps, client });
    assert.equal(result.category, "ok");
    assert.equal(result.text, "La guitare, sans hésiter !");
    assert.equal(client.requests.length, 2);
    assert.ok(String(client.requests[1]?.messages[0]?.content).endsWith(MODERATION_RETRY_INSTRUCTION));
    assert.equal(result.usage.outputTokens, 40);
  });

  it("modération : bascule sur la réplique de secours si la relance est encore filtrée", async () => {
    const client = new FakeClaudeClient(fakeResponse({ text: "Merde alors." }));
    const result = await generateEllieReply(baseInput, { ...quietDeps, client });
    assert.equal(result.category, "moderation");
    assert.equal(client.requests.length, 2);
    assert.ok(FALLBACK_LINES.refus.includes(result.text));
  });

  it("une invitation Discord dans la réponse est retirée par le nettoyage", async () => {
    const client = new FakeClaudeClient(fakeResponse({ text: "Rejoins discord.gg/abcdef vite" }));
    const result = await generateEllieReply(baseInput, { ...quietDeps, client });
    assert.ok(!result.text.includes("discord.gg"));
  });

  it("Twitch : une ligne, sans commande ni / initial", async () => {
    const client = new FakeClaudeClient(fakeResponse({ text: "/me tape !discord\npour venir" }));
    const result = await generateEllieReply({ ...baseInput, platform: "twitch" }, { ...quietDeps, client });
    assert.equal(result.text, "me tape discord pour venir");
  });

  it("aucune clé configurée ⇒ catégorie pas_de_cle, texte vide", async () => {
    const result = await generateEllieReply(baseInput, { ...quietDeps, client: null });
    assert.equal(result.category, "pas_de_cle");
    assert.equal(result.text, "");
  });
});
