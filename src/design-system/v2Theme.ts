export type DomainId =
  | 'running'
  | 'strength'
  | 'karate'
  | 'music'
  | 'sleep'
  | 'reading'
  | 'health'
  | 'recovery';

interface DomainTone {
  bg: string;
  hover: string;
  soft: string;
  text: string;
  border: string;
}

interface DomainMetaEntry {
  id: DomainId;
  label: string;
  hex: string;
  darkHex: string;
  light: DomainTone;
  dark: DomainTone;
}

export const DOMAIN_META: Record<DomainId, DomainMetaEntry> = {
  running: {
    id: 'running',
    label: 'Running',
    hex: '#2563EB',
    darkHex: '#60A5FA',
    light: { bg: 'bg-[#2563EB]', hover: 'hover:bg-[#1D4ED8]', soft: 'bg-[#EFF6FF]', text: 'text-[#2563EB]', border: 'border-[#BFDBFE]' },
    dark: { bg: 'bg-[#2563EB]', hover: 'hover:bg-[#3B82F6]', soft: 'bg-[#2563EB]/15', text: 'text-[#60A5FA]', border: 'border-[#3B82F6]/30' },
  },
  strength: {
    id: 'strength',
    label: 'Strength',
    hex: '#7C3AED',
    darkHex: '#A78BFA',
    light: { bg: 'bg-[#7C3AED]', hover: 'hover:bg-[#6D28D9]', soft: 'bg-[#F5F3FF]', text: 'text-[#7C3AED]', border: 'border-[#DDD6FE]' },
    dark: { bg: 'bg-[#7C3AED]', hover: 'hover:bg-[#8B5CF6]', soft: 'bg-[#7C3AED]/15', text: 'text-[#A78BFA]', border: 'border-[#8B5CF6]/30' },
  },
  karate: {
    id: 'karate',
    label: 'Karate',
    hex: '#EA580C',
    darkHex: '#FB923C',
    light: { bg: 'bg-[#EA580C]', hover: 'hover:bg-[#C2410C]', soft: 'bg-[#FFF7ED]', text: 'text-[#EA580C]', border: 'border-[#FED7AA]' },
    dark: { bg: 'bg-[#EA580C]', hover: 'hover:bg-[#F97316]', soft: 'bg-[#EA580C]/15', text: 'text-[#FB923C]', border: 'border-[#FB923C]/30' },
  },
  music: {
    id: 'music',
    label: 'Music',
    hex: '#DB2777',
    darkHex: '#F472B6',
    light: { bg: 'bg-[#DB2777]', hover: 'hover:bg-[#BE185D]', soft: 'bg-[#FDF2F8]', text: 'text-[#DB2777]', border: 'border-[#FBCFE8]' },
    dark: { bg: 'bg-[#DB2777]', hover: 'hover:bg-[#EC4899]', soft: 'bg-[#DB2777]/15', text: 'text-[#F472B6]', border: 'border-[#F472B6]/30' },
  },
  sleep: {
    id: 'sleep',
    label: 'Sleep',
    hex: '#4F46E5',
    darkHex: '#818CF8',
    light: { bg: 'bg-[#4F46E5]', hover: 'hover:bg-[#4338CA]', soft: 'bg-[#EEF2FF]', text: 'text-[#4F46E5]', border: 'border-[#C7D2FE]' },
    dark: { bg: 'bg-[#4F46E5]', hover: 'hover:bg-[#6366F1]', soft: 'bg-[#4F46E5]/15', text: 'text-[#818CF8]', border: 'border-[#818CF8]/30' },
  },
  reading: {
    id: 'reading',
    label: 'Reading',
    hex: '#059669',
    darkHex: '#34D399',
    light: { bg: 'bg-[#059669]', hover: 'hover:bg-[#047857]', soft: 'bg-[#ECFDF5]', text: 'text-[#059669]', border: 'border-[#A7F3D0]' },
    dark: { bg: 'bg-[#059669]', hover: 'hover:bg-[#10B981]', soft: 'bg-[#10B981]/15', text: 'text-[#34D399]', border: 'border-[#34D399]/30' },
  },
  health: {
    id: 'health',
    label: 'Health',
    hex: '#0D9488',
    darkHex: '#2DD4BF',
    light: { bg: 'bg-[#0D9488]', hover: 'hover:bg-[#0F766E]', soft: 'bg-[#F0FDFA]', text: 'text-[#0D9488]', border: 'border-[#99F6E4]' },
    dark: { bg: 'bg-[#0D9488]', hover: 'hover:bg-[#14B8A6]', soft: 'bg-[#14B8A6]/15', text: 'text-[#2DD4BF]', border: 'border-[#2DD4BF]/30' },
  },
  recovery: {
    id: 'recovery',
    label: 'Recovery',
    hex: '#0891B2',
    darkHex: '#22D3EE',
    light: { bg: 'bg-[#0891B2]', hover: 'hover:bg-[#0E7490]', soft: 'bg-[#ECFEFF]', text: 'text-[#0891B2]', border: 'border-[#A5F3FC]' },
    dark: { bg: 'bg-[#0891B2]', hover: 'hover:bg-[#06B6D4]', soft: 'bg-[#06B6D4]/15', text: 'text-[#22D3EE]', border: 'border-[#22D3EE]/30' },
  },
};

export function getDom(id: DomainId, isDark: boolean) {
  const m = DOMAIN_META[id] ?? DOMAIN_META.running;
  const tone = isDark ? m.dark : m.light;
  return {
    ...m,
    ...tone,
    accentHex: isDark ? m.darkHex : m.hex,
  };
}

export function mapCategoryToDomain(category: string): DomainId {
  switch (category.toUpperCase()) {
    case 'RUNNING':
      return 'running';
    case 'STRENGTH':
    case 'HOME_WORKOUT':
      return 'strength';
    case 'KARATE':
      return 'karate';
    case 'VOCAL':
    case 'DRUMMING':
    case 'GUITAR':
    case 'KEYBOARD':
    case 'MUSIC':
      return 'music';
    case 'SLEEP':
      return 'sleep';
    case 'READING':
    case 'UNIVERSITY':
    case 'STUDY':
      return 'reading';
    case 'HEALTH':
      return 'health';
    case 'RECOVERY':
    default:
      return 'recovery';
  }
}

export function getV2Theme(isDark: boolean) {
  return {
    isDark,
    pageBg: isDark ? 'bg-[#050505] text-[#F5F5F5]' : 'bg-[#F7F8FA] text-[#0F172A]',
    headerBg: isDark ? 'bg-[#050505]/92 border-[#1F1F1F]' : 'bg-white/95 border-[#E5E7EB]',
    card: isDark ? 'bg-[#101010] border-[#222222]' : 'bg-white border-[#E5E7EB]',
    cardSubtle: isDark ? 'bg-[#171717] border-[#262626]' : 'bg-[#F7F8FA] border-[#E5E7EB]',
    surface: isDark ? 'bg-[#161616]' : 'bg-[#F7F8FA]',
    surfaceHover: isDark ? 'hover:bg-[#1E1E1E]' : 'hover:bg-[#EEF2F6]',
    border: isDark ? 'border-[#222222]' : 'border-[#E5E7EB]',
    divider: isDark ? 'border-[#1E1E1E]' : 'border-[#F1F5F9]',
    text: isDark ? 'text-[#F5F5F5]' : 'text-[#0F172A]',
    muted: isDark ? 'text-[#8E8E8E]' : 'text-[#64748B]',
    input: isDark
      ? 'bg-[#0A0A0A] border-[#262626] text-[#F5F5F5] placeholder-[#666666] focus:border-[#3B82F6]'
      : 'bg-[#F7F8FA] border-[#E5E7EB] text-[#0F172A] placeholder-[#94A3B8] focus:border-[#2563EB]',
    btnNeutral: isDark
      ? 'bg-[#181818] hover:bg-[#232323] text-[#F5F5F5] border border-[#2A2A2A] active:scale-[0.98] transition-all'
      : 'bg-[#F7F8FA] hover:bg-[#EEF2F6] text-[#0F172A] border border-[#E5E7EB] active:scale-[0.98] transition-all',
    btnWhite: isDark
      ? 'bg-[#111111] hover:bg-[#1A1A1A] text-[#F5F5F5] border border-[#242424] active:scale-[0.98] transition-all'
      : 'bg-white hover:bg-[#F7F8FA] text-[#0F172A] border border-[#E5E7EB] active:scale-[0.98] transition-all',
    btnPrimary:
      'bg-[#2563EB] hover:bg-[#1D4ED8] text-white border border-transparent active:scale-[0.98] transition-all',
    btnSuccess:
      'bg-[#059669] hover:bg-[#047857] text-white border border-transparent active:scale-[0.98] transition-all',
    btnDangerSoft: isDark
      ? 'bg-[#E11D48]/15 hover:bg-[#E11D48]/25 text-[#FB7185] border border-[#FB7185]/30 active:scale-[0.98] transition-all'
      : 'bg-[#FFF1F2] hover:bg-[#FFE4E6] text-[#E11D48] border border-[#FECDD3] active:scale-[0.98] transition-all',
    btnViolet:
      'bg-[#7C3AED] hover:bg-[#6D28D9] text-white border border-transparent active:scale-[0.98] transition-all',
    btnInk: isDark
      ? 'bg-[#F5F5F5] hover:bg-white text-[#050505] border border-transparent active:scale-[0.98] transition-all'
      : 'bg-[#0F172A] hover:bg-[#1E293B] text-white border border-transparent active:scale-[0.98] transition-all',
    ringTrack: isDark ? '#1D1D1D' : '#ECFDF5',
    ringFill: isDark ? '#10B981' : '#059669',
    modalOverlay: isDark ? 'bg-black/75 backdrop-blur-[3px]' : 'bg-[#0F172A]/40 backdrop-blur-[2px]',
  };
}

export type V2Theme = ReturnType<typeof getV2Theme>;
