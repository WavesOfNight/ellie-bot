import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SLASH_COMMAND_NAMES } from "@ellie/database/shared";
import { commands } from "../src/commands/index.js";
import { buildActionTree } from "../src/lib/action-chain.js";
import { formatDuration, parseDuration } from "../src/lib/durations.js";
import { drawWinners } from "../src/lib/giveaways.js";
import { parseYoutubeFeed } from "../src/lib/social-alerts.js";

describe("commandes slash", () => {
  it("le catalogue (/help et panel) correspond exactement aux commandes enregistrées", () => {
    const registered = commands.map((command) => command.data.name).sort();
    assert.deepEqual(registered, [...SLASH_COMMAND_NAMES].sort());
  });


  it("chaque commande a une description en français valide (≤ 100 caractères)", () => {
    for (const command of commands) {
      const json = command.data.toJSON();
      assert.ok(json.description.length > 0 && json.description.length <= 100, json.name);
    }
  });
});

describe("durées", () => {
  it("analyse 10m, 2h, 1d, 1j, 1h30m", () => {
    assert.equal(parseDuration("10m"), 600_000);
    assert.equal(parseDuration("2h"), 7_200_000);
    assert.equal(parseDuration("1d"), 86_400_000);
    assert.equal(parseDuration("1j"), 86_400_000);
    assert.equal(parseDuration("1h30m"), 5_400_000);
    assert.equal(parseDuration("demain"), null);
    assert.equal(parseDuration("0m"), null);
  });

  it("formate avec deux unités au maximum", () => {
    assert.equal(formatDuration(5_400_000), "1 h 30 min");
    assert.equal(formatDuration(90_061_000), "1 j 1 h");
  });
});

describe("giveaways", () => {
  it("tire des gagnants distincts", () => {
    const winners = drawWinners(["a", "b", "c", "d"], 3);
    assert.equal(winners.length, 3);
    assert.equal(new Set(winners).size, 3);
    assert.deepEqual(drawWinners([], 2), []);
    assert.equal(drawWinners(["a"], 5).length, 1);
  });
});

describe("arbre d'actions", () => {
  it("reconstruit les branches THEN / ELSE / BODY dans l'ordre", () => {
    const rows = [
      { id: 1, parentId: null, branch: null, order: 1, type: "IF", config: '{"condition":"IS_ADMIN"}' },
      { id: 2, parentId: 1, branch: "THEN", order: 0, type: "SEND_MESSAGE", config: '{"content":"admin"}' },
      { id: 3, parentId: 1, branch: "ELSE", order: 0, type: "REPEAT", config: '{"count":2}' },
      { id: 4, parentId: 3, branch: "BODY", order: 0, type: "WAIT", config: '{"seconds":1}' },
      { id: 5, parentId: null, branch: null, order: 0, type: "ADD_REACTION", config: '{"emoji":"👍"}' },
    ];
    const tree = buildActionTree(rows);
    assert.deepEqual(
      tree.map((node) => node.type),
      ["ADD_REACTION", "IF"],
    );
    assert.equal(tree[1]?.then?.[0]?.type, "SEND_MESSAGE");
    assert.equal(tree[1]?.else?.[0]?.type, "REPEAT");
    assert.equal(tree[1]?.else?.[0]?.body?.[0]?.type, "WAIT");
  });
});

describe("flux RSS YouTube", () => {
  const feed = `<?xml version="1.0"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <author><name>missTsune</name></author>
  <entry>
    <yt:videoId>BBB</yt:videoId>
    <title>Deuxième vidéo &amp; bonus</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=BBB"/>
    <author><name>missTsune</name></author>
    <published>2026-10-02T18:00:00+00:00</published>
  </entry>
  <entry>
    <yt:videoId>AAA</yt:videoId>
    <title>Première vidéo</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=AAA"/>
    <author><name>missTsune</name></author>
    <published>2026-10-01T18:00:00+00:00</published>
  </entry>
</feed>`;

  it("analyse TOUTES les entrées, de la plus ancienne à la plus récente", () => {
    const videos = parseYoutubeFeed(feed);
    assert.deepEqual(
      videos.map((video) => video.id),
      ["AAA", "BBB"],
    );
    assert.equal(videos[1]?.title, "Deuxième vidéo & bonus");
    assert.equal(videos[0]?.channelName, "missTsune");
  });

  it("rejette un flux mal formé", () => {
    assert.throws(() => parseYoutubeFeed("<html>erreur</html>"));
  });
});
