import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateDiscordTrigger,
  isKnownChatBot,
  mentionsTwitchBot,
  startsWithEllieKeyword,
  stripTwitchMention,
  type DiscordTriggerConfig,
  type DiscordTriggerInput,
} from "../src/triggers.js";

const BOT = "111111111111111111";
const CHANNEL = "222222222222222222";
const USER = "333333333333333333";

const config: DiscordTriggerConfig = {
  enabled: true,
  apiKeyConfigured: true,
  allowedChannelIds: [CHANNEL],
  blockedUserIds: [],
  replyToReplies: true,
  keywordTrigger: false,
};

function input(overrides: Partial<DiscordTriggerInput>): DiscordTriggerInput {
  return {
    content: `<@${BOT}> salut toi`,
    authorId: USER,
    authorIsBot: false,
    isDirectMessage: false,
    channelId: CHANNEL,
    botUserId: BOT,
    isReplyToEllie: false,
    handledElsewhere: false,
    ...overrides,
  };
}

describe("déclencheurs Discord", () => {
  it("mention directe : déclenche et retire la mention", () => {
    const decision = evaluateDiscordTrigger(input({}), config);
    assert.deepEqual(decision, { triggered: true, kind: "mention", text: "salut toi" });
    assert.equal(evaluateDiscordTrigger(input({ content: `<@!${BOT}> yo` }), config).triggered, true);
  });

  it("@everyone, @here et les mentions de rôle ne déclenchent jamais", () => {
    for (const content of ["@everyone salut", "@here ça va ?", "<@&444444444444444444> coucou"]) {
      assert.equal(evaluateDiscordTrigger(input({ content }), config).triggered, false, content);
    }
  });

  it("réponse à un message d'Ellie seulement si replyToReplies", () => {
    const reply = input({ content: "et toi ?", isReplyToEllie: true });
    assert.equal(evaluateDiscordTrigger(reply, config).triggered, true);
    assert.equal(evaluateDiscordTrigger(reply, { ...config, replyToReplies: false }).triggered, false);
    assert.equal(evaluateDiscordTrigger(input({ content: "et toi ?" }), config).triggered, false);
  });

  it("mot-clé « Ellie » en début de message seulement s'il est activé", () => {
    const keyword = input({ content: "Ellie, tu joues à quoi ?" });
    assert.equal(evaluateDiscordTrigger(keyword, config).triggered, false);
    assert.equal(evaluateDiscordTrigger(keyword, { ...config, keywordTrigger: true }).triggered, true);
    assert.ok(startsWithEllieKeyword("ÉLLIE: salut"));
    assert.ok(startsWithEllieKeyword("ellie !"));
    assert.ok(startsWithEllieKeyword("Ellie tu dors ?"));
    assert.equal(startsWithEllieKeyword("salut ellie"), false);
    assert.equal(startsWithEllieKeyword("Ellipse"), false);
  });

  it("ignore les bots, les MP, les salons non autorisés, les membres bloqués et les messages déjà traités", () => {
    assert.equal(evaluateDiscordTrigger(input({ authorIsBot: true }), config).triggered, false);
    assert.equal(evaluateDiscordTrigger(input({ authorId: BOT }), config).triggered, false);
    assert.equal(evaluateDiscordTrigger(input({ isDirectMessage: true }), config).triggered, false);
    assert.equal(evaluateDiscordTrigger(input({ channelId: "999999999999999999" }), config).triggered, false);
    assert.equal(evaluateDiscordTrigger(input({}), { ...config, allowedChannelIds: [] }).triggered, false);
    assert.equal(evaluateDiscordTrigger(input({}), { ...config, blockedUserIds: [USER] }).triggered, false);
    assert.equal(evaluateDiscordTrigger(input({ handledElsewhere: true }), config).triggered, false);
    assert.equal(evaluateDiscordTrigger(input({}), { ...config, enabled: false }).triggered, false);
    assert.equal(evaluateDiscordTrigger(input({}), { ...config, apiKeyConfigured: false }).triggered, false);
  });

  it("une mention seule donne un texte vide (réplique de secours sans API)", () => {
    const decision = evaluateDiscordTrigger(input({ content: `<@${BOT}>` }), config);
    assert.deepEqual(decision, { triggered: true, kind: "mention", text: "" });
  });

  it("tronque le message à 1000 caractères", () => {
    const decision = evaluateDiscordTrigger(input({ content: `<@${BOT}> ${"a".repeat(1500)}` }), config);
    assert.ok(decision.triggered && decision.text.length === 1000);
  });
});

describe("déclencheurs Twitch", () => {
  it("@nom_du_bot en mot entier, insensible à la casse", () => {
    assert.ok(mentionsTwitchBot("@EllieBot salut", "elliebot"));
    assert.ok(mentionsTwitchBot("hey @elliebot, ça va ?", "elliebot"));
    assert.equal(mentionsTwitchBot("@elliebot2 salut", "elliebot"), false);
    assert.equal(mentionsTwitchBot("mail@elliebot", "elliebot"), false);
    assert.equal(mentionsTwitchBot("elliebot salut", "elliebot"), false);
  });

  it("retire la mention et reconnaît les bots connus", () => {
    assert.equal(stripTwitchMention("@EllieBot, tu fais quoi ?", "elliebot"), "tu fais quoi ?");
    assert.ok(isKnownChatBot("Nightbot"));
    assert.equal(isKnownChatBot("misstsune"), false);
  });
});
