import type { ReactNode, ButtonHTMLAttributes, CSSProperties } from 'react';
import type { ActivityCategory, DataOrigin, StrengthFocus } from '@/types/domain';

export const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  RUNNING: '#2F6F68',
  KARATE: '#D47D5C',
  STRENGTH: '#9363D3',
  RECOVERY: '#2D9D87',
  VOCAL: '#BF6094',
  DRUMMING: '#D58D38',
  GUITAR: '#B99A3C',
  KEYBOARD: '#318FA9',
  UNIVERSITY: '#567FC2',
  CUSTOM: '#7D8593',
};

export const CATEGORY_SHORT_LABELS: Record<ActivityCategory, string> = {
  RUNNING: 'Running',
  KARATE: 'Karate',
  STRENGTH: 'Strength',
  RECOVERY: 'Recovery',
  VOCAL: 'Vocal',
  DRUMMING: 'Drumming',
  GUITAR: 'Guitar',
  KEYBOARD: 'Keyboard',
  UNIVERSITY: 'University',
  CUSTOM: 'Custom',
};

export const SPLIT_COLORS: Record<StrengthFocus, string> = {
  UPPER: '#2F6F68',
  CORE: '#7C5878',
  LOWER: '#9B644E',
  FULL_BODY: '#9A7F5A',
  MOBILITY: '#4F846E',
  APP_REST: '#767C85',
};

export function StrideBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <span
        aria-hidden="true"
        className={`flex items-end gap-[3px] -rotate-[15deg] ${compact ? 'h-6 w-6' : 'h-7 w-7'}`}
      >
        <i className="block w-[6px] h-[13px] rounded-t-[3px] rounded-b-[1px] bg-[var(--ink)]" />
        <i className="block w-[6px] h-[22px] rounded-t-[3px] rounded-b-[1px] bg-[var(--blue)]" />
        <i className="block w-[6px] h-[17px] rounded-t-[3px] rounded-b-[1px] bg-[var(--ink)]" />
      </span>
      <span className="text-[22px] font-extrabold tracking-[-0.07em] text-[var(--ink)]">
        stride<span className="text-[var(--blue)]">.</span>
      </span>
    </div>
  );
}

function CategoryGlyph({ category, size = 16 }: { category: ActivityCategory; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (category) {
    case 'RUNNING':
      return (
        <svg {...common}>
          <path d="m13 4 2 3 4 1M13 4l-3 3-2 3m2-3 4 4-2 4m2-4 4 1 3 5m-9-2-3 5-5 1" />
          <circle cx="16" cy="3" r="1.5" />
        </svg>
      );
    case 'KARATE':
      return (
        <svg {...common}>
          <circle cx="12" cy="4" r="2" />
          <path d="m11 7-3.5 5-4.5 1m5-1 6 1 5-4m-6 4 2 7m-7-7-3 6m5-12 5 3" />
        </svg>
      );
    case 'STRENGTH':
      return (
        <svg {...common}>
          <path d="M4 9v6m3-9v12m10-12v12m3-9v6M7 12h10" />
        </svg>
      );
    case 'RECOVERY':
      return (
        <svg {...common}>
          <path d="M20 4c-8 0-14 3-14 11a5 5 0 0 0 10 0c0-4 2-7 4-11ZM6 20c1-6 5-9 10-12" />
        </svg>
      );
    case 'VOCAL':
      return (
        <svg {...common}>
          <path d="M9 18V6l10-2v12M9 9l10-2" />
          <ellipse cx="6" cy="18" rx="3" ry="2" />
          <ellipse cx="16" cy="16" rx="3" ry="2" />
        </svg>
      );
    case 'DRUMMING':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="8" rx="7" ry="3" />
          <path d="M5 8v9c0 1.7 3 3 7 3s7-1.3 7-3V8M8 11v7m8-7v7M4 4l4 3M20 4l-4 3" />
        </svg>
      );
    case 'GUITAR':
      return (
        <svg {...common}>
          <path d="m15 3 6 6m-3-7-7 8a5 5 0 1 0 3 3l8-7M5 15l4 4" />
          <circle cx="10" cy="15" r="1.5" />
        </svg>
      );
    case 'KEYBOARD':
      return (
        <svg {...common}>
          <rect x="2.5" y="5" width="19" height="14" rx="2" />
          <path d="M7 5v10m5-10v10m5-10v10M5 15h14" />
        </svg>
      );
    case 'UNIVERSITY':
      return (
        <svg {...common}>
          <path d="m2 10 10-6 10 6-10 6-10-6Zm4 3v5c4 3 8 3 12 0v-5m4-3v7" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="4" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
  }
}

export function CategoryMark({
  category,
  size = 'md',
}: {
  category: ActivityCategory;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'h-6 w-6 rounded-[7px]' : 'h-[30px] w-[30px] rounded-[10px]';
  return (
    <span
      title={CATEGORY_SHORT_LABELS[category]}
      aria-label={CATEGORY_SHORT_LABELS[category]}
      style={{ '--cat-color': CATEGORY_COLORS[category] } as CSSProperties}
      className={`stride-cat-mark inline-flex shrink-0 items-center justify-center ${dim}`}
    >
      <CategoryGlyph category={category} size={size === 'sm' ? 14 : 16} />
    </span>
  );
}

export function CategoryDot({ category }: { category: ActivityCategory }) {
  return (
    <i
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: CATEGORY_COLORS[category] }}
    />
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl font-bold tracking-[-0.045em] text-[var(--ink)] sm:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const ORIGIN_STYLES: Record<DataOrigin, string> = {
  RECORDED:
    'border-transparent bg-[var(--blue-lite)] text-[var(--blue-ink)]',
  CALCULATED:
    'border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]',
  ESTIMATED:
    'border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  PLANNED:
    'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]',
  SUGGESTED:
    'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  MISSING:
    'border-[var(--line)] bg-[var(--surface-2)] text-[var(--faint)]',
};

export function ProvenanceBadge({ origin }: { origin: DataOrigin }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider ${ORIGIN_STYLES[origin]}`}
    >
      {origin}
    </span>
  );
}

export function CategoryBadge({ category }: { category: ActivityCategory }) {
  return (
    <span
      style={{ '--cat-color': CATEGORY_COLORS[category] } as CSSProperties}
      className="stride-cat-mark inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold"
    >
      <CategoryDot category={category} />
      <span>{CATEGORY_SHORT_LABELS[category]}</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  meta,
  origin,
}: {
  label: string;
  value: string;
  meta?: string;
  origin: DataOrigin;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.11em] text-[var(--muted)]">
          {label}
        </span>
        <ProvenanceBadge origin={origin} />
      </div>
      <div className="mt-3 font-mono text-2xl font-bold tracking-tight text-[var(--ink)] tabular-nums">
        {value}
      </div>
      {meta && <p className="mt-1.5 text-xs text-[var(--muted)]">{meta}</p>}
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--blue)]">
        {icon}
      </div>
      <h2 className="text-lg font-bold tracking-[-0.03em] text-[var(--ink)]">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[var(--muted)]">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      'bg-[var(--primary-button)] text-[var(--button-text)] border border-transparent hover:opacity-85 disabled:opacity-45',
    secondary:
      'bg-[var(--surface)] text-[var(--ink)] border border-[var(--line-strong)] hover:bg-[var(--surface-2)] disabled:opacity-45',
    ghost:
      'bg-transparent text-[var(--muted)] border border-transparent hover:bg-[var(--surface-2)] hover:text-[var(--ink)]',
  };

  return (
    <button
      className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] px-4 py-2 text-[13px] font-semibold tracking-[-0.005em] transition active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]/50 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
