"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import { loadSession, clearSession, saveSession } from "@/lib/session";
import { UserProfile } from "@/types";

const GAMES = [
  {
    id: "slots",
    name: "Slot Machine",
    description: "Match symbols for big wins",
    emoji: "🎰",
    keys: "[1]",
    color: "from-red-900 to-red-950",
    border: "border-red-700 hover:border-red-400",
  },
  {
    id: "poker",
    name: "Video Poker",
    description: "Hold or draw for the best hand",
    emoji: "🃏",
    keys: "[2]",
    color: "from-green-900 to-green-950",
    border: "border-green-700 hover:border-green-400",
  },
  {
    id: "roulette",
    name: "Roulette",
    description: "Bet on red, black, or a number",
    emoji: "🎡",
    keys: "[3]",
    color: "from-blue-900 to-blue-950",
    border: "border-blue-700 hover:border-blue-400",
  },
  {
    id: "blackjack",
    name: "Blackjack",
    description: "Beat the dealer to 21",
    emoji: "🂡",
    keys: "[4]",
    color: "from-emerald-900 to-emerald-950",
    border: "border-emerald-700 hover:border-emerald-400",
  },
  {
    id: "keno",
    name: "Keno",
    description: "Pick your numbers, match the draw",
    emoji: "🎱",
    keys: "[5]",
    color: "from-purple-900 to-purple-950",
    border: "border-purple-700 hover:border-purple-400",
  },
  {
    id: "baccarat",
    name: "Baccarat",
    description: "Bet on Player, Banker, or Tie",
    emoji: "🎴",
    keys: "[6]",
    color: "from-indigo-900 to-indigo-950",
    border: "border-indigo-700 hover:border-indigo-400",
  },
  {
    id: "hilo",
    name: "Hi-Lo",
    description: "Higher, lower, or the same?",
    emoji: "🃏",
    keys: "[7]",
    color: "from-amber-900 to-amber-950",
    border: "border-amber-700 hover:border-amber-400",
  },
  {
    id: "highcard",
    name: "Draw Hi-Low",
    description: "Draw cards — bet who has the higher card",
    emoji: "⚔️",
    keys: "[8]",
    color: "from-orange-900 to-orange-950",
    border: "border-orange-700 hover:border-orange-400",
  },
  {
    id: "war",
    name: "Casino War",
    description: "Highest card wins — tie goes to War",
    emoji: "🎖️",
    keys: "[9]",
    color: "from-rose-900 to-rose-950",
    border: "border-rose-700 hover:border-rose-400",
  },
  {
    id: "reddog",
    name: "Red Dog",
    description: "Will the third card fall in between?",
    emoji: "🐕",
    keys: "[0]",
    color: "from-teal-900 to-teal-950",
    border: "border-teal-700 hover:border-teal-400",
  },
  {
    id: "bingo",
    name: "Video Bingo",
    description: "Buy up to 4 cards, hit lines to win",
    emoji: "🎯",
    keys: "[B]",
    color: "from-yellow-900 to-yellow-950",
    border: "border-yellow-700 hover:border-yellow-400",
  },
  {
    id: "yacht",
    name: "Yacht Dice",
    description: "Hold dice across 3 rolls, score big combos",
    emoji: "🎲",
    keys: "[Y]",
    color: "from-cyan-900 to-cyan-950",
    border: "border-cyan-700 hover:border-cyan-400",
  },
  {
    id: "mines",
    name: "Mines",
    description: "Reveal gems, avoid mines, cash out anytime",
    emoji: "💎",
    keys: "[M]",
    color: "from-lime-900 to-lime-950",
    border: "border-lime-700 hover:border-lime-400",
  },
  {
    id: "tower",
    name: "Tower Climb",
    description: "Pick safe tiles, climb higher, cash out or bust",
    emoji: "🏰",
    keys: "[T]",
    color: "from-violet-900 to-violet-950",
    border: "border-violet-700 hover:border-violet-400",
  },
  {
    id: "horses",
    name: "Sigma Derby",
    description: "Bet Win or Exacta — watch the race unfold",
    emoji: "🐎",
    keys: "[H]",
    color: "from-sky-900 to-sky-950",
    border: "border-sky-700 hover:border-sky-400",
  },
  {
    id: "crownanchor",
    name: "Crown & Anchor",
    description: "Bet symbols, roll 3 dice — each match pays",
    emoji: "⚓",
    keys: "[C]",
    color: "from-fuchsia-900 to-fuchsia-950",
    border: "border-fuchsia-700 hover:border-fuchsia-400",
  },
];

export default function Lobby() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const handleLogout = useCallback(() => {
    clearSession();
    router.replace("/");
  }, [router]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "1") router.push("/games/slots");
      if (e.key === "2") router.push("/games/poker");
      if (e.key === "3") router.push("/games/roulette");
      if (e.key === "4") router.push("/games/blackjack");
      if (e.key === "5") router.push("/games/keno");
      if (e.key === "6") router.push("/games/baccarat");
      if (e.key === "7") router.push("/games/hilo");
      if (e.key === "8") router.push("/games/highcard");
      if (e.key === "9") router.push("/games/war");
      if (e.key === "0") router.push("/games/reddog");
      if (e.key.toLowerCase() === "b") router.push("/games/bingo");
      if (e.key.toLowerCase() === "y") router.push("/games/yacht");
      if (e.key.toLowerCase() === "m") router.push("/games/mines");
      if (e.key.toLowerCase() === "t") router.push("/games/tower");
      if (e.key.toLowerCase() === "h") router.push("/games/horses");
      if (e.key.toLowerCase() === "c") router.push("/games/crownanchor");
      if (e.key === "Escape") handleLogout();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [router, handleLogout]);

  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen bg-neutral-950 text-white">
      <BalanceBar user={user} onLogout={handleLogout} />
      <div className="flex flex-col items-center justify-center flex-1 gap-10 p-6 pt-24">
        <div className="text-center">
          <h2 className="text-3xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            CASINO FLOOR
          </h2>
          <p className="text-neutral-500 text-sm mt-1">Choose your game</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-5xl">
          {GAMES.map((game) => (
            <button
              key={game.id}
              onClick={() => router.push(`/games/${game.id}`)}
              className={`bg-gradient-to-br ${game.color} border-2 ${game.border} rounded-2xl p-8 flex flex-col items-center gap-4 transition-all active:scale-95 shadow-2xl`}
            >
              <span className="text-6xl">{game.emoji}</span>
              <div className="text-center">
                <p className="font-black text-xl tracking-wide">{game.name}</p>
                <p className="text-neutral-400 text-sm mt-1">{game.description}</p>
              </div>
              <span className="text-xs font-mono text-neutral-500 border border-neutral-700 px-2 py-1 rounded">
                BUTTON {game.keys}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
