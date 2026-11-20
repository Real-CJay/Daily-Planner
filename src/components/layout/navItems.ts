import {
  Activity,
  Award,
  BarChart3,
  Bot,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  Route,
  Settings,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof Activity;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/runs', label: 'Running Log', icon: Route },
  { to: '/plan', label: 'Training Plan', icon: ClipboardCheck, badge: 'S6' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, badge: 'S4' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, badge: 'S5' },
  { to: '/coach', label: 'Coach', icon: Bot, badge: 'S7' },
  { to: '/personal-bests', label: 'Personal Bests', icon: Award, badge: 'S5' },
  { to: '/weekly-review', label: 'Weekly Review', icon: Activity, badge: 'S7' },
  { to: '/settings', label: 'Settings', icon: Settings },
];