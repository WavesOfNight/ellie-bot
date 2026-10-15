import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { levelProgress, MAX_LEVEL, randomXpGain, xpToNextLevel } from "../src/levels.js";
import { validateActionTree } from "../src/custom-command-actions.js";
import { assertSafeUrlShape, isPrivateAddress, UnsafeUrlError } from "../src/safe-fetch.js";

describe("niveaux", () => {
  it("coût du niveau n → n+1 = 5n² + 50n + 100", () => {
    assert.equal(xpToNextLevel(0), 100);
    assert.equal(xpToNextLevel(1), 155);
    assert.equal(xpToNextLevel(10), 1100);
  });

  it("convertit l'XP totale en niveau et progression", () => {
    assert.deepEqual(levelProgress(0), { level: 0, current: 0, required: 100 });
    assert.deepEqual(levelProgress(120), { level: 1, current: 20, required: 155 });
  });

  it("plafonne au niveau 50", () => {
    const progress = levelProgress(10_000_000);
    assert.equal(progress.level, MAX_LEVEL);
    assert.equal(progress.required, null);
  });

  it("gain entre 15 et 25 XP", () => {
    assert.equal(randomXpGain(() => 0), 15);
    assert.equal(randomXpGain(() => 0.9999), 25);
  });
});

describe("validation de l'arbre d'actions", () => {
  it("accepte un arbre IF/ELSE + REPEAT + SET_VARIABLE", () => {
    const result = validateActionTree([
      {
        type: "IF",
        config: { condition: "RANDOM_CHANCE", value: "50" },
        then: [{ type: "SEND_MESSAGE", config: { content: "Pile !" } }],
        else: [
          {
            type: "REPEAT",
            config: { count: 3 },
            body: [{ type: "SET_VARIABLE", config: { name: "compteur", operation: "ADD", value: "1" } }],
          },
        ],
      },
    ]);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.count, 4);
  });

  it("refuse les valeurs hors limites et les types inconnus", () => {
    assert.equal(validateActionTree([{ type: "REPEAT", config: { count: 500 }, body: [] }]).ok, false);
    assert.equal(validateActionTree([{ type: "WAIT", config: { seconds: 999 } }]).ok, false);
    assert.equal(validateActionTree([{ type: "FORMAT_DISK", config: {} }]).ok, false);
    assert.equal(validateActionTree([{ type: "HTTP_REQUEST", config: { url: "ftp://x" } }]).ok, false);
  });

  it("refuse une imbrication trop profonde", () => {
    let node: Record<string, unknown> = { type: "SEND_MESSAGE", config: { content: "fin" } };
    for (let i = 0; i < 10; i++) node = { type: "REPEAT", config: { count: 1 }, body: [node] };
    assert.equal(validateActionTree([node]).ok, false);
  });
});

describe("protection SSRF", () => {
  it("refuse localhost et les adresses privées", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://localhost:3000/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.20.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://intranet/",
      "file:///etc/passwd",
    ]) {
      assert.throws(() => assertSafeUrlShape(url), UnsafeUrlError, url);
    }
  });

  it("accepte une URL publique", () => {
    assert.equal(assertSafeUrlShape("https://example.com/api").hostname, "example.com");
  });

  it("classe correctement les adresses IP", () => {
    assert.ok(isPrivateAddress("127.0.0.1"));
    assert.ok(isPrivateAddress("fd00::1"));
    assert.ok(isPrivateAddress("::ffff:192.168.0.1"));
    assert.equal(isPrivateAddress("93.184.216.34"), false);
    assert.equal(isPrivateAddress("2606:4700::1111"), false);
  });
});
