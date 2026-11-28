import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  shape: number;
  rot: number;
  vRot: number;
  life: number;
}

interface ToastItem {
  id: number;
  text: string;
  tone: string;
}

interface FeedbackContextValue {
  triggerConfetti: (clientX?: number, clientY?: number) => void;
  pushToast: (text: string, tone?: string) => void;
  openMonkFocus: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue>({
  triggerConfetti: () => {},
  pushToast: () => {},
  openMonkFocus: () => {},
});

export function useFeedback() {
  return useContext(FeedbackContext);
}

export function FeedbackProvider({
  isDark,
  onOpenMonkFocus,
  children,
}: {
  isDark: boolean;
  onOpenMonkFocus: () => void;
  children: ReactNode;
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const resize = () => {
      if (!canvasRef.current) return;
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const triggerConfetti = useCallback((clientX?: number, clientY?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ox = clientX ?? window.innerWidth / 2;
    const oy = clientY ?? window.innerHeight / 3;
    const colors = ['#2563EB', '#10B981', '#7C3AED', '#EA580C', '#DB2777', '#06B6D4'];

    for (let i = 0; i < 34; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const spd = 4.5 + Math.random() * 6.5;
      particlesRef.current.push({
        x: ox,
        y: oy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 2,
        size: 5 + Math.random() * 5,
        color: colors[i % colors.length],
        shape: i % 3,
        rot: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.24,
        life: 1,
      });
    }

    if (rafRef.current === null) {
      const tick = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          rafRef.current = null;
          return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particlesRef.current = particlesRef.current.filter((p) => p.life > 0);
        for (const p of particlesRef.current) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.24;
          p.vx *= 0.985;
          p.rot += p.vRot;
          p.life -= 0.022;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          if (p.shape === 0) {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.shape === 1) {
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          } else {
            ctx.beginPath();
            ctx.moveTo(0, -p.size * 0.65);
            ctx.lineTo(p.size * 0.65, 0);
            ctx.lineTo(0, p.size * 0.65);
            ctx.lineTo(-p.size * 0.65, 0);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
        if (particlesRef.current.length > 0) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const pushToast = useCallback((text: string, tone = '#2563EB') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  return (
    <FeedbackContext.Provider
      value={{ triggerConfetti, pushToast, openMonkFocus: onOpenMonkFocus }}
    >
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50" />
      {children}
      <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-pop flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 font-display text-xs font-bold shadow-xl sm:text-sm ${
              isDark
                ? 'border-[#2C2C2C] bg-[#181818] text-[#F5F5F5]'
                : 'border-transparent bg-[#0F172A] text-white'
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.tone }} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}
