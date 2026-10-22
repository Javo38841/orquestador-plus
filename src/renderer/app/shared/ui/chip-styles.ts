/**
 * Color variants shared by every chip and badge (RNF-17). Class names are written out in
 * full so Tailwind can see them; `fg` and `bg` name the theme variables behind them so a
 * test can check the contrast of each pair.
 */
export const CHIP_VARIANTS = {
  project: {
    classes: 'border-project bg-project-soft text-project-ink',
    fg: '--color-project-ink',
    bg: '--color-project-soft',
  },
  repeat: {
    classes: 'border-repeat bg-repeat-soft text-repeat-ink',
    fg: '--color-repeat-ink',
    bg: '--color-repeat-soft',
  },
  warn: {
    classes: 'border-warn bg-warn-soft text-warn',
    fg: '--color-warn',
    bg: '--color-warn-soft',
  },
  danger: {
    classes: 'border-danger bg-danger-soft text-danger-ink',
    fg: '--color-danger-ink',
    bg: '--color-danger-soft',
  },
  success: {
    classes: 'border-accent bg-accent-soft text-accent',
    fg: '--color-accent',
    bg: '--color-accent-soft',
  },
  neutral: {
    classes: 'border-line bg-surface-raised text-muted',
    fg: '--color-muted',
    bg: '--color-surface-raised',
  },
} as const;

export type ChipVariant = keyof typeof CHIP_VARIANTS;

export const CHIP_BASE =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium';
