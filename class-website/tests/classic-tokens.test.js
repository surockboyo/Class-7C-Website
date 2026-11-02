import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../assets/css/styles.css", import.meta.url), "utf8");
const accents = ["red", "yellow", "blue", "green"];
const themes = ["light", "dark"];

function blockFor(selector) {
  const start = css.indexOf(selector);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  assert.ok(start >= 0 && open > start && close > open, `Missing token block: ${selector}`);
  return css.slice(open + 1, close);
}

function blockWithToken(selector, token) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rules = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "g"))];
  const block = rules.find(([, declarations]) => declarations.includes(`--${token}:`))?.[1];
  assert.ok(block, `Missing ${token} in ${selector}`);
  return block;
}

function variables(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{3,8});/gi)].map(([, name, value]) => [name, value]));
}

function colorMix(block, name, tokens) {
  const value = block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
  const match = value?.match(/^color-mix\(in srgb, var\(--([\w-]+)\) ([\d.]+)%, var\(--([\w-]+)\)\)$/);
  assert.ok(match, `${name} must be an sRGB mix of existing theme tokens`);
  const [, firstToken, percentage, secondToken] = match;
  const first = channels(tokens[firstToken]);
  const second = channels(tokens[secondToken]);
  const weight = Number(percentage) / 100;
  return first.map((channel, index) => channel * weight + second[index] * (1 - weight));
}

function channels(hex) {
  const normalized = hex.slice(1);
  const digits = normalized.length === 3 ? [...normalized].map((digit) => digit + digit).join("") : normalized;
  return [0, 2, 4].map((index) => Number.parseInt(digits.slice(index, index + 2), 16));
}

function luminance(rgb) {
  const [red, green, blue] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("classic ornament and stamp borders meet 3:1 against themed surfaces", () => {
  for (const theme of themes) {
    const baseSelector = theme === "light" ? ":root," : ':root[data-theme="dark"]';
    const base = variables(blockFor(baseSelector));
    const classicBlock = blockWithToken(`:root[data-theme="${theme}"]`, "classic-ornament");
    const stampBlock = blockWithToken(`:root[data-theme="${theme}"]`, "classic-stamp-border");

    for (const accent of accents) {
      const accentBlock = variables(blockFor(`:root[data-accent="${accent}"][data-theme="${theme}"]`));
      const tokens = { ...base, ...accentBlock };
      for (const [name, block] of [
        ["classic-ornament", classicBlock],
        ["classic-stamp-border", stampBlock],
      ]) {
        const foreground = colorMix(block, name, tokens);
        for (const surface of ["surface-1", "surface-2"]) {
          const ratio = contrast(foreground, channels(tokens[surface]));
          assert.ok(ratio >= 3, `${theme}/${accent} ${name}/${surface} is ${ratio.toFixed(2)}:1; expected >= 3:1`);
        }
      }
    }
  }
});

test("hero rings use subtle theme tokens and remain clipped behind hero content", () => {
  for (const [theme, minimum, maximum] of [["light", 6, 10], ["dark", 8, 12]]) {
    const block = blockWithToken(`:root[data-theme="${theme}"]`, "hero-rings");
    const value = block.match(/--hero-rings:\s*([^;]+);/)?.[1].trim();
    const match = value?.match(/^color-mix\(in srgb, var\(--text\) ([\d.]+)%, transparent\)$/);
    assert.ok(match, `${theme} hero rings must be mixed from the text token`);
    assert.ok(Number(match[1]) >= minimum && Number(match[1]) <= maximum, `${theme} hero ring opacity is outside the requested range`);
  }

  const hero = blockFor(".home-hero ");
  assert.match(hero, /position:\s*relative/);
  assert.match(hero, /overflow:\s*hidden/);
  const rings = blockFor(".home-hero::before ");
  assert.match(rings, /z-index:\s*0/);
  assert.match(rings, /pointer-events:\s*none/);
});
