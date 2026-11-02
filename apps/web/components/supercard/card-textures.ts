import * as THREE from "three";

const WIDTH = 1024;
const HEIGHT = 644;
const CORNER_PADDING = 32;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: boolean
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  else ctx.stroke();
}

function makeBaseBackground(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, "#0a0a14");
  grad.addColorStop(0.45, "#161628");
  grad.addColorStop(1, "#08080f");
  ctx.fillStyle = grad;
  roundRect(ctx, CORNER_PADDING, CORNER_PADDING, WIDTH - CORNER_PADDING * 2, HEIGHT - CORNER_PADDING * 2, 24, true);

  const holo = ctx.createConicGradient(0, WIDTH * 0.5, HEIGHT * 0.45);
  holo.addColorStop(0, "rgba(120, 140, 255, 0.18)");
  holo.addColorStop(0.2, "rgba(200, 90, 255, 0.10)");
  holo.addColorStop(0.45, "rgba(70, 220, 255, 0.14)");
  holo.addColorStop(0.7, "rgba(255, 180, 90, 0.08)");
  holo.addColorStop(1, "rgba(120, 140, 255, 0.18)");
  ctx.save();
  roundRect(ctx, CORNER_PADDING, CORNER_PADDING, WIDTH - CORNER_PADDING * 2, HEIGHT - CORNER_PADDING * 2, 24, false);
  ctx.clip();
  ctx.fillStyle = holo;
  ctx.fillRect(CORNER_PADDING, CORNER_PADDING, WIDTH - CORNER_PADDING * 2, HEIGHT - CORNER_PADDING * 2);

  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.005 + Math.random() * 0.012})`;
    ctx.fillRect(
      CORNER_PADDING + Math.random() * (WIDTH - CORNER_PADDING * 2),
      CORNER_PADDING + Math.random() * (HEIGHT - CORNER_PADDING * 2),
      1,
      1
    );
  }
  ctx.restore();
}

function drawChip(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const w = 110;
  const h = 84;
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#d8b15a");
  g.addColorStop(0.5, "#b48a36");
  g.addColorStop(1, "#7a5c1f");
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, 10, true);

  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  roundRect(ctx, x + 10, y + 14, w - 20, h - 28, 5, false);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 14);
  ctx.lineTo(x + w / 2, y + h - 14);
  ctx.moveTo(x + 10, y + h / 2);
  ctx.lineTo(x + w - 10, y + h / 2);
  ctx.stroke();
}

function drawWordmark(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "300 56px 'Helvetica Neue', Inter, Arial, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("SUPER", 100, 100);

  const superWidth = ctx.measureText("SUPER").width;
  ctx.font = "600 56px 'Helvetica Neue', Inter, Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.98)";
  ctx.fillText("CARD", 100 + superWidth + 6, 100);

  ctx.font = "500 14px 'JetBrains Mono', 'SF Mono', ui-monospace, monospace";
  ctx.fillStyle = "rgba(180,200,255,0.78)";
  ctx.fillText("AI SPEND WALLET", 102, 162);
}

function drawNumber(ctx: CanvasRenderingContext2D) {
  ctx.font = "500 40px 'JetBrains Mono', 'SF Mono', ui-monospace, monospace";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textBaseline = "top";
  const groups = ["4242", "7711", "8824", "1919"];
  let x = 100;
  for (let i = 0; i < groups.length; i++) {
    ctx.fillText(groups[i], x, HEIGHT - 230);
    x += ctx.measureText(groups[i]).width + 28;
    ctx.fillStyle = "rgba(255,255,255,0.34)";
    if (i < groups.length - 1) x += 6;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
  }

  ctx.font = "500 14px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillStyle = "rgba(180,200,255,0.55)";
  ctx.fillText("CARDHOLDER", 100, HEIGHT - 155);

  ctx.font = "500 22px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText("Y. DEWASTHALE", 100, HEIGHT - 135);

  ctx.fillStyle = "rgba(180,200,255,0.55)";
  ctx.fillText("VALID THRU", 430, HEIGHT - 155);
  ctx.font = "500 22px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText("10/31", 430, HEIGHT - 135);

  ctx.font = "500 22px 'Helvetica Neue', Inter, Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.textAlign = "right";
  ctx.fillText("supercode", WIDTH - 100, HEIGHT - 100);
  ctx.textAlign = "left";
}

function drawNfcGlyph(ctx: CanvasRenderingContext2D) {
  const cx = WIDTH - 130;
  const cy = 160;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    const startAngle = -Math.PI / 3;
    const endAngle = Math.PI / 3;
    const r = 16 + i * 6;
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillRect(cx - 1, cy - 26, 2, 12);
}

function drawBackStripes(ctx: CanvasRenderingContext2D) {
  ctx.save();
  roundRect(
    ctx,
    CORNER_PADDING,
    CORNER_PADDING,
    WIDTH - CORNER_PADDING * 2,
    HEIGHT - CORNER_PADDING * 2,
    24,
    false
  );
  ctx.clip();

  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 0.3;
  ctx.fillRect(0, 110, WIDTH, 44);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "500 26px 'JetBrains Mono', ui-monospace, monospace";
  ctx.textBaseline = "top";
  ctx.fillText("supercard.dev", 100, 220);

  ctx.font = "400 18px 'Helvetica Neue', Inter, Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(
    "One wallet. Eight categories. Every AI dollar, on one statement.",
    100,
    270
  );

  ctx.font = "500 13px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillStyle = "rgba(180,200,255,0.55)";
  ctx.fillText(
    "ISSUED BY SUPERCARD  •  MEMBER SINCE 2026  •  TIER: BETA",
    100,
    HEIGHT - 90
  );

  ctx.restore();
}

function applyRoundedMask(ctx: CanvasRenderingContext2D) {
  // Clip everything to a rounded rect, then erase the outside corners
  const r = 28;
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  roundRect(ctx, 0, 0, WIDTH, HEIGHT, r, true);
  ctx.restore();
}

export function createFrontTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  makeBaseBackground(ctx);
  drawWordmark(ctx);
  drawChip(ctx, 100, 230);
  drawNfcGlyph(ctx);
  drawNumber(ctx);
  applyRoundedMask(ctx);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createBackTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  makeBaseBackground(ctx);
  drawBackStripes(ctx);
  applyRoundedMask(ctx);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export interface CategoryChip {
  label: string;
  color: string;
}

export function createChipTexture(chip: CategoryChip): THREE.CanvasTexture {
  const c = 280;
  const canvas = document.createElement("canvas");
  canvas.width = c;
  canvas.height = c;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, c, c);

  ctx.fillStyle = "rgba(14, 14, 28, 0.94)";
  const r = 32;
  roundRect(ctx, 6, 6, c - 12, c - 12, r, true);

  ctx.save();
  roundRect(ctx, 6, 6, c - 12, c - 12, r, false);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, c, c);
  g.addColorStop(0, chip.color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.18;
  ctx.fillRect(0, 0, c, c);
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, 6.75, 6.75, c - 13.5, c - 13.5, r, false);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "600 36px 'Helvetica Neue', Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 6;
  ctx.fillText(chip.label, c / 2, c / 2);

  // Apply mask to round the texture
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  roundRect(ctx, 0, 0, c, c, r + 6, true);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
