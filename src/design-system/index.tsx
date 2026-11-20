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
      className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
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
    <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const ORIGIN_STYLES: Record<DataOrigin, string> = {
  RECORDED: 'border-blue-200 bg-blue-50 text-blue-800',
  CALCULATED: 'border-slate-200 bg-slate-100 text-slate-700',
  ESTIMATED: 'border-amber-200 bg-amber-50 text-amber-800',
  PLANNED: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  SUGGESTED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  MISSING: 'border-slate-200 bg-slate-50 text-slate-500',
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
  RUNNING: { label: 'Running', classes: 'bg-blue-50 text-blue-800 border-blue-200' },
  KARATE: { label: 'Karate', classes: 'bg-red-50 text-red-800 border-red-200' },
  RECOVERY: { label: 'Recovery', classes: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  VOCAL: { label: 'Vocal Practice', classes: 'bg-amber-50 text-amber-800 border-amber-200' },
  DRUMMING: { label: 'Drumming', classes: 'bg-violet-50 text-violet-800 border-violet-200' },
  UNIVERSITY: { label: 'University', classes: 'bg-slate-100 text-slate-700 border-slate-200' },
  CUSTOM: { label: 'Commitment', classes: 'bg-slate-100 text-slate-700 border-slate-200' },
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
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
        <ProvenanceBadge origin={origin} />
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </div>
      {meta && <p className="mt-1.5 text-xs text-slate-500">{meta}</p>}
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
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500">
        {icon}
      </div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-slate-600">{description}</p>
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
      'bg-brand-run text-white border border-brand-run hover:bg-blue-800 disabled:bg-slate-300 disabled:border-slate-300',
    secondary:
      'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    ghost: 'bg-transparent text-slate-700 border border-transparent hover:bg-slate-100',
  };

  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}