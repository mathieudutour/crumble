import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface Timer {
  id: number;
  label: string;
  /** `Date.now()` when it rings, so throttled background tabs stay accurate. */
  endsAt: number;
  rung: boolean;
}

interface Timers {
  timers: readonly Timer[];
  now: number;
  start: (label: string, seconds: number) => void;
  dismiss: (id: number) => void;
}

const TimersContext = createContext<Timers | null>(null);

/** Three short beeps, with vibration where supported. */
function ring(audio: AudioContext | undefined) {
  navigator.vibrate?.([300, 150, 300, 150, 300]);
  try {
    if (!audio) return;
    for (let i = 0; i < 3; i++) {
      const beep = audio.createOscillator();
      const gain = audio.createGain();
      beep.frequency.value = 880;
      gain.gain.value = 0.2;
      beep.connect(gain).connect(audio.destination);
      beep.start(audio.currentTime + i * 0.35);
      beep.stop(audio.currentTime + i * 0.35 + 0.2);
    }
  } catch {
    // No audio: the vibration and the banner remain.
  }
}

export const formatCountdown = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

/** Kitchen timers that keep running across tabs and outside the cooking mode. */
export function TimersProvider({ children }: { children: ReactNode }) {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const nextId = useRef(1);
  // Created on the tap that starts a timer: browsers mute audio that no gesture unlocked.
  const audio = useRef<AudioContext>(undefined);

  const running = timers.some((t) => !t.rung);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, [running]);

  useEffect(() => {
    if (!timers.some((t) => !t.rung && t.endsAt <= now)) return;
    ring(audio.current);
    setTimers((all) => all.map((t) => (!t.rung && t.endsAt <= now ? { ...t, rung: true } : t)));
  }, [now, timers]);

  const start = useCallback((label: string, seconds: number) => {
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch {
      // No Web Audio: timers still vibrate and show.
    }
    setNow(Date.now());
    setTimers((all) => [...all, { id: nextId.current++, label, endsAt: Date.now() + seconds * 1000, rung: false }]);
  }, []);
  const dismiss = useCallback((id: number) => setTimers((all) => all.filter((t) => t.id !== id)), []);
  const value = useMemo(() => ({ timers, now, start, dismiss }), [timers, now, start, dismiss]);

  return (
    <TimersContext.Provider value={value}>
      {children}
      <TimerList floating />
    </TimersContext.Provider>
  );
}

export function useTimers(): Timers {
  const timers = useContext(TimersContext);
  if (!timers) throw new Error("useTimers must be used inside <TimersProvider>");
  return timers;
}

/** Running timers. Floating over the app, or inline (the cooking mode shows its own and hides the floating one). */
export function TimerList({ floating }: { floating?: boolean }) {
  const { timers, now, dismiss } = useTimers();
  const list = useRef<HTMLDivElement>(null);

  // Pages and sheets pad their bottom by this height (see styles.css) so the timers never cover a button.
  useEffect(() => {
    const element = list.current;
    if (!floating || !element) return;
    const observer = new ResizeObserver(() => document.body.style.setProperty("--timers-height", `${element.offsetHeight}px`));
    observer.observe(element);
    return () => observer.disconnect();
  }, [floating, timers.length]);

  if (!timers.length) return null;
  return (
    <div ref={list} className={`timers${floating ? " floating" : ""}`} role="status" aria-live="polite">
      {timers.map((t) => (
        <button key={t.id} className={`timer${t.rung ? " rung" : ""}`} onClick={() => dismiss(t.id)} aria-label={`${t.label}, arrêter`}>
          <span className="time">{t.rung ? "C’est prêt !" : formatCountdown(t.endsAt - now)}</span>
          <span className="what">{t.label}</span>
          <span aria-hidden="true">✕</span>
        </button>
      ))}
    </div>
  );
}
