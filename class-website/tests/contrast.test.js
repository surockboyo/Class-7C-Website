import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../assets/css/styles.css", import.meta.url), "utf8");

function variables(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{3,8});/gi)].map(([, name, value]) => [name, value]));
}

function blockFor(selector) {
  const start = css.indexOf(selector);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  assert.ok(start >= 0 && open > start && close > open, `Missing token block: ${selector}`);
  return css.slice(open + 1, close);
}

function channelToLinear(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const normalized = hex.slice(1);
  const digits = normalized.length === 3 ? [...normalized].map((digit) => digit + digit).join("") : normalized;
  const [red, green, blue] = [0, 2, 4].map((index) => channelToLinear(Number.parseInt(digits.slice(index, index + 2), 16)));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const accents = ["red", "yellow", "blue", "green"];
const themes = ["light", "dark"];

test("whiteboard and chalkboard text, status, accent, and border contrast meet WCAG thresholds", () => {
  const measured = [];
  for (const theme of themes) {
    const rootSelector = theme === "light" ? ":root," : ":root[data-theme=\"dark\"]";
    const base = variables(blockFor(rootSelector));
    for (const accentName of accents) {
      const accentBlock = variables(blockFor(`:root[data-accent="${accentName}"][data-theme="${theme}"]`));
      const tokens = { ...base, ...accentBlock };
      const label = `${theme}/${accentName}`;
      const normalText = [
        ["text/bg", tokens.text, tokens.bg, 4.5],
        ["text/surface-1", tokens.text, tokens["surface-1"], 4.5],
        ["text/surface-2", tokens.text, tokens["surface-2"], 4.5],
        ["text-muted/surface-1", tokens["text-muted"], tokens["surface-1"], 4.5],
        ["text-muted/surface-2", tokens["text-muted"], tokens["surface-2"], 4.5],
        ["on-accent/accent", tokens["on-accent"], tokens.accent, 4.5],
        ["success/surface-1", tokens.success, tokens["surface-1"], 4.5],
        ["warning/surface-1", tokens.warning, tokens["surface-1"], 4.5],
        ["danger/surface-1", tokens.danger, tokens["surface-1"], 4.5],
      ];
      const largeTextAndUI = [
        ["accent/surface-1", tokens.accent, tokens["surface-1"], 3],
        ["border/surface-1", tokens.border, tokens["surface-1"], 3],
        ["border/surface-2", tokens.border, tokens["surface-2"], 3],
      ];
      for (const [pair, foreground, background, minimum] of [...normalText, ...largeTextAndUI]) {
        const ratio = contrast(foreground, background);
        measured.push(`${label} ${pair}: ${ratio.toFixed(2)}:1`);
        assert.ok(ratio >= minimum, `${label} ${pair} is ${ratio.toFixed(2)}:1; expected >= ${minimum}:1`);
      }
    }
  }
  console.log(`Measured contrast ratios:\n${measured.join("\n")}`);
});
