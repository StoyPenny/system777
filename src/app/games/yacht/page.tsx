"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import BetSelector from "@/components/BetSelector";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { playWin, playBigWin, playLose, playTick } from "@/lib/sounds";
import { UserProfile } from "@/types";

const MIN_BET = 1;
const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const PAYOUTS = [
  { name: "YACHT",          label: "Yacht (5-of-a-kind)",  pays: "50×", payout: 50 },
  { name: "LARGE STRAIGHT", label: "Large Straight",        pays: "8×",  payout: 8  },
  { name: "FOUR OF A KIND", label: "Four of a Kind",        pays: "5×",  payout: 5  },
  { name: "FULL HOUSE",     label: "Full House",            pays: "4×",  payout: 4  },
  { name: "SMALL STRAIGHT", label: "Small Straight",        pays: "3×",  payout: 3  },
  { name: "THREE OF A KIND",label: "Three of a Kind",       pays: "2×",  payout: 2  },
  { name: "TWO PAIR",       label: "Two Pair",              pays: "Push",payout: 0  },
  { name: "NO WIN",         label: "One Pair / Nothing",    pays: "Lose",payout: -1 },
] as const;

type HandName = typeof PAYOUTS[number]["name"];

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function evaluateHand(dice: number[]): HandName {
  const counts = new Map<number, number>();
  for (const d of dice) counts.set(d, (counts.get(d) ?? 0) + 1);
  const vals = [...counts.values()].sort((a, b) => b - a);
  const sorted = [...dice].sort((a, b) => a - b);

  if (vals[0] === 5) return "YACHT";

  const str = sorted.join("");
  if (str === "12345" || str === "23456") return "LARGE STRAIGHT";

  if (vals[0] === 4) return "FOUR OF A KIND";
  if (vals[0] === 3 && vals[1] === 2) return "FULL HOUSE";

  const unique = [...new Set(sorted)];
  const isSmall =
    (unique.includes(1) && unique.includes(2) && unique.includes(3) && unique.includes(4)) ||
    (unique.includes(2) && unique.includes(3) && unique.includes(4) && unique.includes(5)) ||
    (unique.includes(3) && unique.includes(4) && unique.includes(5) && unique.includes(6));
  if (isSmall) return "SMALL STRAIGHT";

  if (vals[0] === 3) return "THREE OF A KIND";
  if (vals[0] === 2 && vals[1] === 2) return "TWO PAIR";

  return "NO WIN";
}

type Phase = "betting" | "rolling" | "result";

export default function YachtPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState<Phase>("betting");
  const [dice, setDice] = useState<number[]>([1, 1, 1, 1, 1]);
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  const [rollsLeft, setRollsLeft] = useState(2);
  const [rolling, setRolling] = useState(false);
  const [handName, setHandName] = useState<HandName | null>(null);
  const [message, setMessage] = useState("PLACE YOUR BET");
  const [winEffect, setWinEffect] = useState({ show: false, big: false });

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const animateRoll = useCallback(async (finalDice: number[], heldMask: boolean[]) => {
    setRolling(true);
    for (let i = 0; i < 5; i++) {
      await new Promise<void>((r) => setTimeout(r, 70));
      setDice((prev) => prev.map((d, idx) => heldMask[idx] ? d : rollDie()));
      if (i % 2 === 0) playTick();
    }
    setDice(finalDice);
    setRolling(false);
  }, []);

  const scoreHand = useCallback(async (finalDice: number[], currentUser: UserProfile, currentBet: number) => {
    const name = evaluateHand(finalDice);
    const entry = PAYOUTS.find((p) => p.name === name)!;
    setHandName(name);

    const delta = entry.payout > 0 ? currentBet * entry.payout : entry.payout === 0 ? 0 : -currentBet;
    const apiResult = entry.payout > 0 ? "win" : entry.payout === 0 ? "push" : "lose";

    let msg = "";
    if (entry.payout > 0) {
      msg = `${entry.label}! +${(currentBet * entry.payout).toLocaleString()} CREDITS`;
      if (entry.payout >= 8) {
        playBigWin();
        setWinEffect({ show: true, big: true });
      } else {
        playWin();
        setWinEffect({ show: true, big: false });
      }
    } else if (entry.payout === 0) {
      msg = `${entry.label} — PUSH`;
    } else {
      msg = `${entry.label} — -${currentBet.toLocaleString()} CREDITS`;
      playLose();
    }

    setMessage(msg);
    setPhase("result");

    const res = await fetch("/api/game-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, game: "yacht", result: apiResult, amount: delta }),
    });
    if (res.ok) {
      const { user: updated } = await res.json();
      saveSession(updated);
      setUser(updated);
    }
  }, []);

  const startGame = useCallback(async () => {
    if (!user || user.balance < bet || bet < MIN_BET) {
      setMessage(bet < MIN_BET ? `MINIMUM BET IS ${MIN_BET}!` : "NOT ENOUGH CREDITS!");
      return;
    }
    const initialHeld: boolean[] = [false, false, false, false, false];
    const initialDice = [rollDie(), rollDie(), rollDie(), rollDie(), rollDie()];
    setHeld(initialHeld);
    setRollsLeft(2);
    setHandName(null);
    setPhase("rolling");
    setMessage("HOLD DICE TO KEEP — 2 ROLLS REMAINING");
    await animateRoll(initialDice, initialHeld);
  }, [user, bet, animateRoll]);

  const doRoll = useCallback(async () => {
    if (rolling || rollsLeft <= 0 || !user) return;
    const newDice = dice.map((d, i) => held[i] ? d : rollDie());
    const newRollsLeft = rollsLeft - 1;
    setRollsLeft(newRollsLeft);
    await animateRoll(newDice, held);
    if (newRollsLeft === 0) {
      await scoreHand(newDice, user, bet);
    } else {
      setMessage(`HOLD DICE — ${newRollsLeft} ROLL${newRollsLeft !== 1 ? "S" : ""} REMAINING`);
    }
  }, [rolling, rollsLeft, dice, held, user, bet, animateRoll, scoreHand]);

  const scoreNow = useCallback(async () => {
    if (rolling || phase !== "rolling" || !user) return;
    await scoreHand(dice, user, bet);
  }, [rolling, phase, dice, user, bet, scoreHand]);

  const toggleHold = useCallback((idx: number) => {
    if (phase !== "rolling" || rolling) return;
    setHeld((prev) => prev.map((h, i) => i === idx ? !h : h));
  }, [phase, rolling]);

  const reset = useCallback(() => {
    setDice([1, 1, 1, 1, 1]);
    setHeld([false, false, false, false, false]);
    setRollsLeft(2);
    setHandName(null);
    setPhase("betting");
    setMessage("PLACE YOUR BET");
  }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { router.push("/lobby"); return; }
      if (phase === "betting" && e.code === "Space") { e.preventDefault(); startGame(); }
      if (phase === "rolling") {
        if (e.key === "1") toggleHold(0);
        if (e.key === "2") toggleHold(1);
        if (e.key === "3") toggleHold(2);
        if (e.key === "4") toggleHold(3);
        if (e.key === "5") toggleHold(4);
        if (e.code === "Space") { e.preventDefault(); doRoll(); }
        if (e.key.toLowerCase() === "s") scoreNow();
      }
      if (phase === "result" && e.code === "Space") { e.preventDefault(); reset(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, startGame, toggleHold, doRoll, scoreNow, reset, router]);

  if (!user) return null;

  const msgColor =
    message.includes("+") ? "text-green-400" :
    message.includes("PUSH") ? "text-neutral-400" :
    message.includes("CREDITS") && message.includes("-") ? "text-red-400" :
    message.includes("YACHT") ? "text-yellow-400" :
    "text-white";

  return (
    <div className="flex flex-col min-h-screen bg-cyan-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="yacht"
        big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })}
      />

      <div className="flex flex-col items-center gap-5 p-4 pt-24 pb-8 w-full max-w-2xl mx-auto">
        <button
          onClick={() => router.push("/lobby")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
        >
          ← [ESC] LOBBY
        </button>

        <div className="w-full bg-black rounded-3xl p-6 border-8 border-cyan-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest mb-4 pb-4 border-b border-neutral-800 text-cyan-400">
            YACHT DICE
            {phase !== "betting" && (
              <span className="ml-4 text-sm font-mono font-normal text-neutral-400">
                BET: <span className="text-yellow-400">{bet.toLocaleString()}</span>
                {phase === "rolling" && (
                  <span className="ml-2 text-cyan-300">
                    {rollsLeft} ROLL{rollsLeft !== 1 ? "S" : ""} LEFT
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Dice row */}
          <div className="flex justify-center gap-3 py-4">
            {dice.map((d, i) => (
              <button
                key={i}
                onClick={() => toggleHold(i)}
                disabled={phase !== "rolling" || rolling}
                className={`relative w-16 h-16 md:w-20 md:h-20 rounded-xl text-4xl md:text-5xl flex items-center justify-center transition-all select-none
                  ${phase === "rolling" && !rolling ? "cursor-pointer hover:scale-105 active:scale-90" : "cursor-default"}
                  ${held[i]
                    ? "bg-yellow-400/20 border-4 border-yellow-400 shadow-lg shadow-yellow-400/40 scale-105"
                    : "bg-neutral-800 border-4 border-neutral-600"}
                `}
              >
                {DICE_FACES[d - 1]}
                {held[i] && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[10px] font-black text-yellow-400 bg-black px-1.5 rounded whitespace-nowrap">
                    HOLD
                  </span>
                )}
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-neutral-600">
                  [{i + 1}]
                </span>
              </button>
            ))}
          </div>

          {/* Message */}
          <div className="mt-7 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex items-center justify-center">
            <p className={`font-mono text-sm font-bold tracking-wide ${msgColor}`}>
              {message}
            </p>
          </div>
        </div>

        {/* Payout table */}
        <div className="w-full bg-black/40 rounded-xl border border-cyan-900 p-3">
          <p className="text-center text-xs text-cyan-400 font-mono mb-2 uppercase tracking-wider">
            Payout Table
          </p>
          <div className="grid grid-cols-2 gap-1">
            {PAYOUTS.map((row) => {
              const isMatch = phase === "result" && handName === row.name;
              return (
                <div
                  key={row.name}
                  className={`flex justify-between px-2 py-1 rounded text-xs font-mono transition-colors
                    ${isMatch ? "bg-yellow-400/20 border border-yellow-500" : "bg-neutral-900"}`}
                >
                  <span className={isMatch ? "text-yellow-300" : "text-neutral-400"}>{row.label}</span>
                  <span className={`font-black ${
                    row.pays === "Lose" ? "text-red-400" :
                    row.pays === "Push" ? "text-neutral-400" :
                    "text-yellow-400"
                  }`}>
                    {row.pays}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Phase controls */}
        {phase === "betting" && (
          <>
            <BetSelector balance={user.balance} bet={bet} onChange={setBet} disabled={false} />
            <button
              onClick={startGame}
              disabled={user.balance < bet || bet < MIN_BET}
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 border-b-8 border-cyan-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
            >
              ROLL DICE [SPACE]
            </button>
          </>
        )}

        {phase === "rolling" && (
          <div className="flex gap-4 flex-wrap justify-center">
            <button
              onClick={doRoll}
              disabled={rolling || rollsLeft <= 0}
              className="px-10 py-6 rounded-2xl text-2xl font-black bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 border-b-8 border-cyan-900 active:border-b-2 transition-all active:scale-95 shadow-xl disabled:opacity-50"
            >
              {rolling ? "ROLLING..." : `ROLL [SPACE]`}
            </button>
            {!rolling && (
              <button
                onClick={scoreNow}
                className="px-8 py-6 rounded-2xl text-xl font-black bg-neutral-700 hover:bg-neutral-600 border-b-8 border-neutral-900 active:border-b-2 transition-all active:scale-95 shadow-xl"
              >
                SCORE NOW [S]
              </button>
            )}
          </div>
        )}

        {phase === "result" && (
          <button
            onClick={reset}
            className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 border-b-8 border-cyan-900 active:border-b-2 transition-all active:scale-95 shadow-2xl"
          >
            PLAY AGAIN [SPACE]
          </button>
        )}
      </div>
    </div>
  );
}
