import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServiceStatusReporter, describeTwitchStatus, SERVICE_HEARTBEAT_MS, SERVICE_STALE_MS, type ServiceState } from "../src/service-status.js";

const NOW = new Date("2026-10-18T12:00:00Z");
const BOT = { username: "ellie_bot", channelName: "misstsune" };
const status = (state: ServiceState, detail = "", heartbeatAgoMs = 1_000) => ({
  state,
  detail,
  since: new Date(NOW.getTime() - 60_000),
  heartbeatAt: new Date(NOW.getTime() - heartbeatAgoMs),
});

describe("état du bot Twitch dans le panel", () => {
  it("jamais démarré, arrêté ou sans signe de vie : hors ligne", () => {
    assert.equal(describeTwitchStatus(null, BOT, NOW).title, "Le service Twitch n'a jamais démarré");
    assert.equal(describeTwitchStatus(status("STOPPED"), BOT, NOW).label, "hors ligne");
    const silent = describeTwitchStatus(status("CONNECTED", "", SERVICE_STALE_MS + 1_000), BOT, NOW);
    assert.equal(silent.level, "error");
    assert.match(silent.detail, /systemctl restart ellie-twitch/);
  });

  it("connecté : rappelle qu'Ellie ignore son propre compte", () => {
    const view = describeTwitchStatus(status("CONNECTED"), BOT, NOW);
    assert.equal(view.level, "ok");
    assert.equal(view.title, "Connecté au chat de misstsune");
    assert.match(view.detail, /ellie_bot/);
  });

  it("connecté avec le compte de la chaîne : avertissement", () => {
    const view = describeTwitchStatus(status("CONNECTED"), { username: "MissTsune", channelName: "misstsune" }, NOW);
    assert.equal(view.level, "warning");
    assert.match(view.title, /compte de la chaîne/);
  });

  it("en attente et erreur : la raison écrite par le service est affichée", () => {
    const waiting = describeTwitchStatus(status("WAITING", "chaîne à rejoindre à renseigner"), BOT, NOW);
    assert.deepEqual([waiting.level, waiting.label, waiting.detail], ["warning", "en attente", "chaîne à rejoindre à renseigner"]);
    const error = describeTwitchStatus(status("ERROR", "Jeton Twitch refusé"), BOT, NOW);
    assert.deepEqual([error.level, error.label], ["error", "erreur"]);
  });
});

describe("rapporteur d'état", () => {
  it("écrit à chaque changement, sinon une fois toutes les 30 s (signe de vie)", async () => {
    const writes: Array<{ state: ServiceState; detail: string; changed: boolean }> = [];
    let clock = 0;
    const report = createServiceStatusReporter(
      "twitch",
      async (_id, state, detail, changed) => {
        writes.push({ state, detail, changed });
      },
      () => clock,
    );
    await report("WAITING", "bot désactivé");
    clock += 5_000;
    await report("WAITING", "bot désactivé");
    clock += SERVICE_HEARTBEAT_MS;
    await report("WAITING", "bot désactivé");
    await report("CONNECTED");
    assert.deepEqual(writes, [
      { state: "WAITING", detail: "bot désactivé", changed: true },
      { state: "WAITING", detail: "bot désactivé", changed: false },
      { state: "CONNECTED", detail: "", changed: true },
    ]);
  });

  it("une base indisponible ne fait pas planter le service, l'écriture est retentée", async () => {
    let fail = true;
    let written = 0;
    const report = createServiceStatusReporter("twitch", async () => {
      if (fail) throw new Error("base verrouillée");
      written++;
    });
    await report("CONNECTED");
    fail = false;
    await report("CONNECTED");
    assert.equal(written, 1);
  });
});
