"use client";
import { useEffect, useMemo } from "react";

type GameId = "slots" | "poker" | "roulette" | "blackjack" | "keno" | "baccarat" | "hilo" | "highcard" | "war" | "reddog" | "bingo" | "yacht" | "mines" | "tower" | "horses" | "crownanchor";

interface WinEffectProps {
  show: boolean;
  game: GameId;
  big: boolean;
  onDone: () => void;
}

interface Particle {
  id: number;
  emoji: string;
  left: number;
  top: number;
  delay: number;
  duration: number;
  size: number;
  dx?: number;
  dy?: number;
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

// Slots → coins fall from top
// Poker → suits rise from bottom
// Roulette → colored dots burst from center
// Blackjack → cards fall from top
const CONFIGS: Record<GameId, {
  style: "fall" | "rise" | "burst";
  winEmoji: string[];
  bigEmoji: string[];
  flashColor: string;
}> = {
  slots: {
    style: "fall",
    winEmoji: ["🪙", "🪙", "💰", "🪙", "🪙", "🪙", "💰"],
    bigEmoji: ["🪙", "💰", "⭐", "🌟", "💎", "🪙", "🪙", "💰", "⭐", "💎"],
    flashColor: "rgba(250,204,21,0.35)",  // gold
  },
  poker: {
    style: "rise",
    winEmoji: ["♠", "♥", "♦", "♣", "♥", "♠"],
    bigEmoji: ["🃏", "♠", "♥", "♦", "♣", "⭐", "🃏", "♥", "♠", "⭐"],
    flashColor: "rgba(34,197,94,0.25)",   // green
  },
  roulette: {
    style: "burst",
    winEmoji: ["🔴", "⚫", "🔴", "⚫", "🟡", "🔴", "⚫"],
    bigEmoji: ["🔴", "⚫", "🟡", "⭐", "✨", "🔴", "⚫", "🟡", "⭐", "✨"],
    flashColor: "rgba(59,130,246,0.25)",  // blue
  },
  blackjack: {
    style: "fall",
    winEmoji: ["🃏", "♠", "♥", "🃏", "💰", "♠"],
    bigEmoji: ["🃏", "🃏", "⭐", "💰", "👑", "💎", "🃏", "⭐", "💰", "♠"],
    flashColor: "rgba(16,185,129,0.28)",  // emerald
  },
  keno: {
    style: "burst",
    winEmoji: ["🎱", "⭐", "💰", "🎱", "⭐", "💰"],
    bigEmoji: ["🎱", "💰", "⭐", "🌟", "💎", "🎱", "🎱", "💰", "⭐", "💎"],
    flashColor: "rgba(147,51,234,0.30)",  // purple
  },
  baccarat: {
    style: "rise",
    winEmoji: ["♠", "♥", "♦", "♣", "💰", "♠"],
    bigEmoji: ["🃏", "♠", "♥", "♦", "♣", "💰", "⭐", "♠", "♥", "⭐"],
    flashColor: "rgba(79,70,229,0.28)",   // indigo
  },
  hilo: {
    style: "fall",
    winEmoji: ["▲", "♠", "♥", "♦", "♣", "▼", "="],
    bigEmoji: ["▲", "▲", "♠", "♥", "💰", "⭐", "▲", "♦", "♣", "💎"],
    flashColor: "rgba(245,158,11,0.28)",  // amber
  },
  highcard: {
    style: "burst",
    winEmoji: ["🏆", "♠", "♥", "♦", "♣", "🃏", "⭐"],
    bigEmoji: ["🏆", "🏆", "⭐", "💰", "♠", "♥", "🏆", "♦", "♣", "💎"],
    flashColor: "rgba(249,115,22,0.28)",  // orange
  },
  war: {
    style: "burst",
    winEmoji: ["⚔️", "🎖️", "🃏", "⭐", "⚔️", "💰", "🎖️"],
    bigEmoji: ["⚔️", "🎖️", "⭐", "💰", "⚔️", "💎", "🏆", "⭐", "⚔️", "🎖️"],
    flashColor: "rgba(225,29,72,0.28)",   // rose
  },
  reddog: {
    style: "rise",
    winEmoji: ["🐕", "♠", "♥", "♦", "♣", "⭐", "🐕"],
    bigEmoji: ["🐕", "🐕", "⭐", "💰", "♠", "♥", "🐕", "♦", "♣", "💎"],
    flashColor: "rgba(13,148,136,0.28)",  // teal
  },
  bingo: {
    style: "burst",
    winEmoji: ["🟡", "🔵", "🟠", "⭐", "🟢", "🔴", "🟡"],
    bigEmoji: ["🟡", "🔵", "🟠", "🟢", "🔴", "⭐", "💰", "🟡", "🔵", "💎"],
    flashColor: "rgba(234,179,8,0.30)",   // yellow
  },
  yacht: {
    style: "burst",
    winEmoji: ["🎲", "⚄", "⚅", "💰", "🎲", "⭐", "⚃"],
    bigEmoji: ["🎲", "🎲", "⚅", "⚄", "💰", "⭐", "🌟", "💎", "🎲", "⚅"],
    flashColor: "rgba(6,182,212,0.28)",   // cyan
  },
  mines: {
    style: "burst",
    winEmoji: ["💎", "💎", "⭐", "💎", "💰", "💎", "⭐"],
    bigEmoji: ["💎", "💎", "💎", "⭐", "💰", "🌟", "💎", "💎", "⭐", "💰"],
    flashColor: "rgba(132,204,22,0.28)",  // lime
  },
  tower: {
    style: "rise",
    winEmoji: ["⭐", "🏆", "💰", "⭐", "✨", "🏆", "⭐"],
    bigEmoji: ["🏆", "👑", "⭐", "💰", "🌟", "✨", "🏆", "👑", "💎", "⭐"],
    flashColor: "rgba(139,92,246,0.28)",  // violet
  },
  horses: {
    style: "fall",
    winEmoji: ["🐎", "🏆", "💰", "🐎", "⭐", "🏆", "🐎"],
    bigEmoji: ["🐎", "🏆", "👑", "💰", "🐎", "⭐", "🌟", "🏆", "🐎", "💎"],
    flashColor: "rgba(14,165,233,0.28)",  // sky
  },
  crownanchor: {
    style: "rise",
    winEmoji: ["👑", "⚓", "♥", "♠", "👑", "♦", "⚓"],
    bigEmoji: ["👑", "👑", "⚓", "♥", "💰", "⭐", "👑", "⚓", "🌟", "💎"],
    flashColor: "rgba(217,70,239,0.28)",  // fuchsia
  },
};

function buildParticles(game: GameId, big: boolean): Particle[] {
  const cfg = CONFIGS[game];
  const pool = big ? cfg.bigEmoji : cfg.winEmoji;
  const count = big ? 40 : 20;
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    const emoji = pool[i % pool.length];
    const base: Particle = {
      id: i,
      emoji,
      left: rand(2, 98),
      top: cfg.style === "rise" ? rand(50, 85) : rand(-5, 5),
      delay: rand(0, big ? 0.7 : 0.4),
      duration: rand(big ? 1.4 : 1.1, big ? 2.4 : 1.8),
      size: rand(1.2, big ? 2.4 : 1.9),
    };

    if (cfg.style === "burst") {
      const angle = rand(0, Math.PI * 2);
      const dist = rand(80, big ? 380 : 260);
      base.left = 50;
      base.top = 50;
      base.dx = Math.cos(angle) * dist;
      base.dy = Math.sin(angle) * dist;
    }

    particles.push(base);
  }
  return particles;
}

export default function WinEffect({ show, game, big, onDone }: WinEffectProps) {
  const particles = useMemo(
    () => (show ? buildParticles(game, big) : []),
    // Regenerate whenever a new win fires (show flipping true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show, game, big]
  );

  useEffect(() => {
    if (!show) return;
    const ms = big ? 2800 : 1900;
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [show, big, onDone]);

  if (!show) return null;

  const cfg = CONFIGS[game];
  const animClass =
    cfg.style === "fall" ? "s777-fall" :
    cfg.style === "rise" ? "s777-rise" :
    "s777-burst";
  const flashDuration = big ? "1.2s" : "0.8s";

  return (
    <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
      {/* Screen flash */}
      <div
        className="s777-flash absolute inset-0"
        style={{
          background: cfg.flashColor,
          animationDuration: flashDuration,
        }}
      />

      {/* Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className={`${animClass} absolute select-none`}
          style={{
            left: `${p.left}%`,
            top: cfg.style === "rise" ? `${p.top}%` : `${p.top}%`,
            fontSize: `${p.size}rem`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ...(p.dx !== undefined
              ? ({ "--dx": `${p.dx}px`, "--dy": `${p.dy}px` } as React.CSSProperties)
              : {}),
          }}
        >
          {p.emoji}
        </div>
      ))}
    </div>
  );
}
