import type { ReactNode, ButtonHTMLAttributes } from 'react';
import type { ActivityCategory, DataOrigin } from '@/types/domain';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[#E5EAE7] bg-white shadow-[0_1px_2px_rgba(22,28,25,0.03)] dark:border-morgen-border dark:bg-morgen-surface dark:shadow-none ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-[#E5EAE7] pb-5 dark:border-morgen-border sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#161C19] dark:font-sans dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-flomo-slate dark:text-morgen-body/80">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const ORIGIN_STYLES: Record<DataOrigin, string> = {
  RECORDED:
    'border-[#2CCC74]/40 bg-[#2CCC74]/10 text-[#176D3E] dark:border-morgen-red/35 dark:bg-morgen-wine/70 dark:text-morgen-red',
  CALCULATED:
    'border-[#E5EAE7] bg-[#F7F9F8] text-[#525C57] dark:border-morgen-border dark:bg-morgen-elevated dark:text-morgen-body',
  ESTIMATED:
    'border-[#CFBE9A] bg-[#F4DCA4]/45 text-[#6D5627] dark:border-morgen-yellow/35 dark:bg-morgen-yellow/15 dark:text-morgen-yellow',
  PLANNED:
    'border-slate-200 bg-slate-100/80 text-slate-700 dark:border-morgen-slate/40 dark:bg-morgen-slate/15 dark:text-[#C5D0DE]',
  SUGGESTED:
    'border-[#2CCC74]/45 bg-[#2CCC74]/15 text-[#176D3E] dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-300',
  MISSING:
    'border-[#E5EAE7] bg-[#F7F9F8] text-[#747C84] dark:border-morgen-border dark:bg-morgen-black/60 dark:text-morgen-muted',
};

export function ProvenanceBadge({ origin }: { origin: DataOrigin }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider ${ORIGIN_STYLES[origin]}`}
    >
      {origin}
    </span>
  );
}

const CATEGORY_STYLES: Record<ActivityCategory, { label: string; classes: string }> = {
  RUNNING: {
    label: 'Running',
    classes:
      'bg-[#2CCC74]/15 text-[#176D3E] border-[#2CCC74]/35 dark:bg-morgen-wine/75 dark:text-morgen-red dark:border-morgen-red/35',
  },
  KARATE: {
    label: 'Karate',
    classes:
      'bg-[#F4DCA4]/55 text-[#7A5416] border-[#CFBE9A] dark:bg-morgen-yellow/15 dark:text-morgen-yellow dark:border-morgen-yellow/35',
  },
  STRENGTH: {
    label: 'Home Workout',
    classes:
      'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-400/30',
  },
  RECOVERY: {
    label: 'Recovery',
    classes:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/30',
  },
  VOCAL: {
    label: 'Vocal Practice',
    classes:
      'bg-rose-50 text-rose-800 border-rose-200 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-400/30',
  },
  DRUMMING: {
    label: 'Drumming',
    classes:
      'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-400/30',
  },
  GUITAR: {
    label: 'Guitar',
    classes:
      'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-400/30',
  },
  KEYBOARD: {
    label: 'Keyboard',
    classes:
      'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-400/30',
  },
  UNIVERSITY: {
    label: 'University',
    classes:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-morgen-slate/20 dark:text-[#C5D0DE] dark:border-morgen-slate/35',
  },
  CUSTOM: {
    label: 'Commitment',
    classes:
      'bg-[#F7F9F8] text-[#525C57] border-[#E5EAE7] dark:bg-morgen-elevated dark:text-morgen-body dark:border-morgen-border',
  },
};

export function CategoryBadge({ category }: { category: ActivityCategory }) {
  const cfg = CATEGORY_STYLES[category];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.classes}`}
    >
      {cfg.label}
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
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-flomo-slate dark:text-morgen-muted">
          {label}
        </span>
        <ProvenanceBadge origin={origin} />
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold tracking-tight text-[#161C19] tabular-nums dark:text-white">
        {value}
      </div>
      {meta && <p className="mt-1.5 text-xs text-flomo-slate dark:text-morgen-body/75">{meta}</p>}
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
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-[#E5EAE7] bg-[#F7F9F8] text-[#176D3E] dark:border-morgen-border dark:bg-morgen-elevated dark:text-morgen-red">
        {icon}
      </div>
      <h2 className="text-base font-semibold text-[#161C19] dark:text-white">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-flomo-slate dark:text-morgen-body/80">
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
      'bg-[#176D3E] text-white border border-[#176D3E] hover:bg-[#135A33] disabled:bg-slate-200 disabled:border-slate-200 disabled:text-slate-400 dark:bg-morgen-rose dark:border-morgen-rose dark:text-white dark:hover:bg-[#B43F4E] dark:disabled:bg-morgen-elevated dark:disabled:border-morgen-border dark:disabled:text-morgen-muted',
    secondary:
      'bg-white text-[#161C19] border border-[#D8E0DC] hover:bg-[#F7F9F8] disabled:text-slate-400 dark:bg-morgen-surface dark:text-white dark:border-morgen-border dark:hover:bg-morgen-slateHover dark:disabled:text-morgen-muted',
    ghost:
      'bg-transparent text-[#525C57] border border-transparent hover:bg-[#F7F9F8] dark:text-morgen-body dark:hover:bg-morgen-elevated',
  };

  return (
    <button
      className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold tracking-[0.01em] transition-colors focus:outline-none focus:ring-2 focus:ring-[#2CCC74] focus:ring-offset-1 dark:focus:ring-morgen-red dark:focus:ring-offset-morgen-black ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
