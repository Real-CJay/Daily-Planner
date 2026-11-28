export type DuoIconName =
  | 'brand'
  | 'running'
  | 'strength'
  | 'karate'
  | 'music'
  | 'vocal'
  | 'drumming'
  | 'guitar'
  | 'keyboard'
  | 'sleep'
  | 'reading'
  | 'health'
  | 'recovery'
  | 'flame'
  | 'trophy'
  | 'water'
  | 'sugar'
  | 'meal'
  | 'leaf'
  | 'spark'
  | 'sun'
  | 'moon'
  | 'monk'
  | 'shield';

export function DuoIcon({
  name,
  className = 'w-7 h-7',
}: {
  name: DuoIconName;
  className?: string;
}) {
  switch (name) {
    case 'brand':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M18 3L7 17.5h8.2L13.5 29 25 14.5h-8.2L18 3z"
            fill="#93C5FD"
            fillOpacity="0.4"
            stroke="#FFFFFF"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'running':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <circle cx="21.5" cy="7.5" r="3" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeWidth="2.2" />
          <path d="M12 14.5l4.5-3 4.2 2.4 4-2" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16.5 12l-2.6 6.7 5.2 2.8-1.5 5.2" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.9 18.7l-5.6 2.9" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
          <path d="M4.5 10h4.5M3.5 14h3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
        </svg>
      );
    case 'strength':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="4" y="10" width="4.8" height="12" rx="2" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeWidth="2.2" />
          <rect x="23.2" y="10" width="4.8" height="12" rx="2" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeWidth="2.2" />
          <rect x="8.8" y="12.5" width="3" height="7" rx="1" fill="currentColor" />
          <rect x="20.2" y="12.5" width="3" height="7" rx="1" fill="currentColor" />
          <line x1="11.8" y1="16" x2="20.2" y2="16" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        </svg>
      );
    case 'karate':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M5.5 12.5h21v5h-21z" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <rect x="13" y="11" width="6" height="8" rx="2" fill="currentColor" fillOpacity="0.38" stroke="currentColor" strokeWidth="2.2" />
          <path d="M14 19l-4.2 7.5M18 19l4.2 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M16 4.5l1.3 2.7 2.7 1.3-2.7 1.3L16 12.5l-1.3-2.7L12 8.5l2.7-1.3L16 4.5z" fill="currentColor" opacity="0.55" />
        </svg>
      );
    case 'music':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M13 22V9l12.5-3v13" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 13l12.5-3" stroke="currentColor" strokeWidth="2" opacity="0.45" />
          <circle cx="9.5" cy="22.5" r="3.6" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="2.2" />
          <circle cx="22" cy="19.5" r="3.6" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      );
    case 'vocal':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="11.5" y="4.5" width="9" height="13.5" rx="4.5" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeWidth="2.2" />
          <path d="M7.5 15a8.5 8.5 0 0 0 17 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M16 23.5v4M12 27.5h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'drumming':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <ellipse cx="16" cy="13.5" rx="10" ry="4" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeWidth="2.2" />
          <path d="M6 13.5v8.5c0 2.2 4.5 4 10 4s10-1.8 10-4v-8.5" stroke="currentColor" strokeWidth="2.2" />
          <path d="M9.5 6l6.5 6.5M22.5 6L16 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'guitar':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M16 5c5.8 0 9.5 4.2 8.2 10.6-1 5.1-5.1 9.5-8.2 11.4-3.1-1.9-7.2-6.3-8.2-11.4C6.5 9.2 10.2 5 16 5z" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="2.2" />
          <circle cx="16" cy="14" r="3" fill="currentColor" />
        </svg>
      );
    case 'keyboard':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="4" y="8" width="24" height="16" rx="3" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="2.2" />
          <path d="M10 8v16M16 8v16M22 8v16" stroke="currentColor" strokeWidth="1.8" opacity="0.4" />
          <rect x="8.3" y="8" width="3.4" height="9" rx="1" fill="currentColor" />
          <rect x="14.3" y="8" width="3.4" height="9" rx="1" fill="currentColor" />
          <rect x="20.3" y="8" width="3.4" height="9" rx="1" fill="currentColor" />
        </svg>
      );
    case 'sleep':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M23.8 18.8A9.5 9.5 0 0 1 13.2 8.2a9.5 9.5 0 1 0 10.6 10.6z" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M22.5 5.5l.9 2.2 2.1.9-2.1.9-.9 2.2-.9-2.2-2.1-.9 2.1-.9.9-2.2z" fill="currentColor" />
        </svg>
      );
    case 'reading':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M5 8.5C5 7.4 5.9 6.5 7 6.5h6.5A2.5 2.5 0 0 1 16 9v16.5c-1.2-1-2.8-1.5-4.5-1.5H7a2 2 0 0 1-2-2V8.5z" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M27 8.5c0-1.1-.9-2-2-2h-6.5A2.5 2.5 0 0 0 16 9v16.5c1.2-1 2.8-1.5 4.5-1.5H25a2 2 0 0 0 2-2V8.5z" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M21 6.5v6.2l1.8-1.2 1.7 1.2V6.5" fill="currentColor" />
        </svg>
      );
    case 'health':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M16 26.5S6.5 20.4 6.5 13a5.5 5.5 0 0 1 9.5-3.8A5.5 5.5 0 0 1 25.5 13c0 7.4-9.5 13.5-9.5 13.5z" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M16 11v6M13 14h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'recovery':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <circle cx="16" cy="16" r="6" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeWidth="2.2" />
          <path d="M16 4v3.5M16 24.5V28M4 16h3.5M24.5 16H28M7.5 7.5l2.5 2.5M22 22l2.5 2.5M24.5 7.5L22 10M10 22l-2.5 2.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'flame':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M16.5 4.2c1.6 4.3 6.5 6.5 6.5 13.2a7.5 7.5 0 1 1-15 0c0-3.2 1.7-5.8 3.5-7.8.2 2 1.2 3.1 2.2 3.3-.6-3.2.6-6.3 2.8-8.7z" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M16 25a3.5 3.5 0 0 0 3.5-3.5c0-2-1.8-3.3-3.5-5-1.7 1.7-3.5 3-3.5 5A3.5 3.5 0 0 0 16 25z" fill="currentColor" />
        </svg>
      );
    case 'trophy':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M10 6h12v7a6 6 0 0 1-12 0V6z" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeWidth="2.2" />
          <path d="M10 8H6.5a2.5 2.5 0 0 0 0 5H10M22 8h3.5a2.5 2.5 0 0 1 0 5H22" stroke="currentColor" strokeWidth="2.2" />
          <path d="M16 19v6M11.5 25h9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case 'water':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M16 5C16 5 8 14 8 19.5a8 8 0 0 0 16 0C24 14 16 5 16 5z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
      );
    case 'sugar':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="8" y="8" width="16" height="16" rx="4" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2.2" />
          <line x1="6" y1="6" x2="26" y2="26" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case 'meal':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <circle cx="16" cy="16" r="10" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2.2" />
          <circle cx="16" cy="16" r="5" fill="currentColor" fillOpacity="0.28" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case 'leaf':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M24.5 7.5C14 7.5 7.5 13 7.5 24.5c11.5 0 17-6.5 17-17z" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M7.5 24.5L19 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'spark':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2l2.3 7.2L21.5 11.5l-7.2 2.3L12 21l-2.3-7.2L2.5 11.5l7.2-2.3L12 2z" />
        </svg>
      );
    case 'sun':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="currentColor" fillOpacity="0.22" />
          <path d="M12 2.5v2M12 19.5v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2.5 12h2M19.5 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      );
    case 'moon':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.5 14.5A8 8 0 0 1 9.5 3.5a8 8 0 1 0 11 11z" fill="currentColor" fillOpacity="0.22" />
        </svg>
      );
    case 'monk':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity="0.16" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      );
    case 'shield':
      return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M16 4.5L6.5 8.5v7.2c0 6.1 4.1 10.6 9.5 12.3 5.4-1.7 9.5-6.2 9.5-12.3V8.5L16 4.5z" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M12.2 16.2l2.6 2.6 5.2-5.4" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}
