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
      className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-[#111827] dark:shadow-none ${className}`}
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
    <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const ORIGIN_STYLES: Record<DataOrigin, string> = {
  RECORDED:
    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/80 dark:bg-blue-950/60 dark:text-blue-300',
  CALCULATED:
    'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300',
  ESTIMATED:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/80 dark:bg-amber-950/60 dark:text-amber-300',
  PLANNED:
    'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/80 dark:bg-indigo-950/60 dark:text-indigo-300',
  SUGGESTED:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/80 dark:bg-emerald-950/60 dark:text-emerald-300',
  MISSING:
    'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
};

export function ProvenanceBadge({ origin }: { origin: DataOrigin }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide ${ORIGIN_STYLES[origin]}`}
    >
      {origin}
    </span>
  );
}

const CATEGORY_STYLES: Record<ActivityCategory, { label: string; classes: string }> = {
  RUNNING: {
    label: 'Running',
    classes:
      'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900/80',
  },
  KARATE: {
    label: 'Karate',
    classes:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900/80',
  },
  STRENGTH: {
    label: 'Home Workout',
    classes:
      'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-900/80',
  },
  RECOVERY: {
    label: 'Recovery',
    classes:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900/80',
  },
  VOCAL: {
    label: 'Vocal Practice',
    classes:
      'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900/80',
  },
  DRUMMING: {
    label: 'Drumming',
    classes:
      'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900/80',
  },
  UNIVERSITY: {
    label: 'University',
    classes:
      'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-900/80',
  },
  CUSTOM: {
    label: 'Commitment',
    classes:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
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
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <ProvenanceBadge origin={origin} />
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
        {value}
      </div>
      {meta && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{meta}</p>}
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
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        {icon}
      </div>
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-slate-600 dark:text-slate-400">{description}</p>
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
      'bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:border-slate-300 disabled:text-slate-500 dark:bg-blue-600 dark:border-blue-500 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:border-slate-800 dark:disabled:text-slate-500',
    secondary:
      'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800 dark:disabled:text-slate-600',
    ghost:
      'bg-transparent text-slate-700 border border-transparent hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  };

  return (
    <button
      className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-[#0B1120] ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}