import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHIP_VARIANTS } from '../renderer/app/shared/ui/chip-styles';

const stylesCss = fs.readFileSync(path.resolve(__dirname, '../renderer/styles.css'), 'utf8');

const theme = new Map(
  [...stylesCss.matchAll(/(--color-[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
);

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme', () => {
  it('CP-N17-17: no hard-coded colors outside the theme variable definitions', () => {
    const outsideTheme = stylesCss.replace(/@theme\s*\{[^}]*\}/, '');
    const hardCoded = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
    expect(outsideTheme).not.toMatch(hardCoded);
    expect(JSON.stringify(CHIP_VARIANTS)).not.toMatch(hardCoded);
  });

  it('CP-N17-18: styles.css defines --color-danger and uses dark scrollbars', () => {
    expect(theme.has('--color-danger')).toBe(true);
    for (const variable of Object.values(CHIP_VARIANTS).flatMap((v) => [v.fg, v.bg])) {
      expect(theme.has(variable), variable).toBe(true);
    }
    expect(stylesCss).toMatch(/color-scheme:\s*dark/);
    expect(stylesCss).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*var\(--color-line\)/);
    expect(stylesCss).toMatch(/scrollbar-color:\s*var\(--color-line\)\s+var\(--color-canvas\)/);
  });

  it('CP-N17-19: every chip and badge text/background pair has at least 4.5:1 contrast', () => {
    for (const [name, { fg, bg }] of Object.entries(CHIP_VARIANTS)) {
      expect(contrast(theme.get(fg)!, theme.get(bg)!), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});
