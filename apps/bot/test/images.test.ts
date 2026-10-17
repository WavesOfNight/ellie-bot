import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderWelcomeImage } from "../src/lib/images.js";

/** Avatar refusé par la protection SSRF (adresse locale) : rond de couleur, sans accès réseau. */
const OFFLINE_AVATAR = "https://127.0.0.1/avatar.png";

/** Luminosité moyenne (0-255) d'un pixel du cadre, à l'écart du texte et de l'avatar. */
async function panelBrightness(png: Buffer): Promise<number> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const [red = 0, green = 0, blue = 0] = ctx.getImageData(60, 60, 1, 1).data;
  return (red + green + blue) / 3;
}

describe("image de bienvenue", () => {
  it("texte foncé par défaut sur un cadre clair", async () => {
    const png = await renderWelcomeImage({ avatarUrl: OFFLINE_AVATAR, title: "Bienvenue Pseudo !", subtitle: "Tu es le membre n°128" });
    assert.ok(png.subarray(1, 4).toString() === "PNG");
    assert.ok((await panelBrightness(png)) > 200);
  });

  it("texte clair choisi : le cadre devient sombre pour rester lisible", async () => {
    const png = await renderWelcomeImage({ avatarUrl: OFFLINE_AVATAR, title: "Bienvenue Pseudo !", subtitle: "Tu es le membre n°128", textColor: "#FFFFFF" });
    assert.ok((await panelBrightness(png)) < 120);
  });
});
