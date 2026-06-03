"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import BetSelector from "@/components/BetSelector";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { playWin, playBigWin, playLose, playTick } from "@/lib/sounds";
import { UserProfile } from "@/types";

const HORSES = [
  { id: 0, name: "Ruby",   laneBg: "bg-red-900/40",    chipBg: "bg-red-700",     selBorder: "border-red-400"    },
  { id: 1, name: "Cobalt", laneBg: "bg-blue-900/40",   chipBg: "bg-blue-700",    selBorder: "border-blue-400"   },
  { id: 2, name: "Jade",   laneBg: "bg-green-900/40",  chipBg: "bg-green-700",   selBorder: "border-green-400"  },
  { id: 3, name: "Goldie", laneBg: "bg-yellow-900/40", chipBg: "bg-yellow-600",  selBorder: "border-yellow-400" },
  { id: 4, name: "Silver", laneBg: "bg-neutral-800/40",chipBg: "bg-neutral-500", selBorder: "border-neutral-300"},
] as const;

// ms to finish per rank — winner arrives first, field spreads over ~2.5 s
const RANK_TIMES = [5200, 5750, 6300, 6850, 7400];
const NOISE_LEN  = 120; // pre-computed noise frames

const WIN_PAYOUT    = 4;
const EXACTA_PAYOUT = 18;
const MIN_BET       = 1;

type BetType = "win" | "exacta";
type Phase   = "betting" | "racing" | "result";

interface RaceData {
  finishOrder: number[];   // finishOrder[rank] = horseId
  finishTimes: number[];   // finishTimes[horseId] = ms
  noise:       number[][];
}

// Smooth, wave-like jitter that dies off near the finish
function buildNoise(): number[][] {
  return Array.from({ length: 5 }, () => {
    const a1 = Math.random() * 0.5 + 0.3;
    const a2 = Math.random() * 0.3 + 0.1;
    const p1 = Math.random() * Math.PI * 2;
    const p2 = Math.random() * Math.PI * 2;
    return Array.from({ length: NOISE_LEN }, (_, f) => {
      const t = f / NOISE_LEN;
      return Math.sin(t * 9 + p1) * a1 + Math.sin(t * 17 + p2) * a2;
    });
  });
}

function buildRace(): RaceData {
  const order = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
  const finishTimes: number[] = Array(5).fill(0);
  order.forEach((id, rank) => {
    finishTimes[id] = RANK_TIMES[rank] + (Math.random() - 0.5) * 300;
  });
  return { finishOrder: order, finishTimes, noise: buildNoise() };
}

// Returns 0–100 display percentage. Cubic ease + dampened jitter.
function horsePos(elapsed: number, finishTime: number, noise: number[]): number {
  if (elapsed >= finishTime) return 100;
  const t      = elapsed / finishTime;
  const smooth = t * t * (3 - 2 * t);
  const frame  = Math.min(Math.floor(t * NOISE_LEN), NOISE_LEN - 1);
  const jitter = noise[frame] * Math.pow(1 - t, 1.5) * 7;
  return Math.max(0, Math.min(97, smooth * 100 + jitter));
}

export default function HorsesPage() {
  const router = useRouter();
  const [user,         setUser]        = useState<UserProfile | null>(null);
  const [bet,          setBet]         = useState(10);
  const [betType,      setBetType]     = useState<BetType>("win");
  const [winHorse,     setWinHorse]    = useState<number | null>(null);
  const [ex1,          setEx1]         = useState<number | null>(null); // exacta 1st
  const [ex2,          setEx2]         = useState<number | null>(null); // exacta 2nd
  const [phase,        setPhase]       = useState<Phase>("betting");
  const [positions,    setPositions]   = useState<number[]>([0, 0, 0, 0, 0]);
  const [raceResult,   setRaceResult]  = useState<number[] | null>(null);
  const [message,      setMessage]     = useState("PLACE YOUR BET AND PICK YOUR HORSE!");
  const [winEffect,    setWinEffect]   = useState({ show: false, big: false });

  // Refs so the animation effect never has stale closures
  const raceRef    = useRef<RaceData | null>(null);
  const captureRef = useRef<{
    userId: number; bet: number; betType: BetType;
    winHorse: number | null; ex1: number | null; ex2: number | null;
  } | null>(null);
  const settleRef  = useRef<((order: number[]) => void) | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const reset = useCallback(() => {
    setPositions([0, 0, 0, 0, 0]);
    setRaceResult(null);
    setWinHorse(null);
    setEx1(null);
    setEx2(null);
    setPhase("betting");
    setMessage("PLACE YOUR BET AND PICK YOUR HORSE!");
  }, []);

  // Keep settleRef current so the animation loop always sees up-to-date user/bet
  useEffect(() => {
    settleRef.current = async (finishOrder: number[]) => {
      const cap = captureRef.current;
      if (!cap) return;

      const first  = finishOrder[0];
      const second = finishOrder[1];
      const won    =
        cap.betType === "win"
          ? cap.winHorse === first
          : cap.ex1 === first && cap.ex2 === second;

      const payout = cap.betType === "win" ? WIN_PAYOUT : EXACTA_PAYOUT;
      const delta  = won ? cap.bet * payout : -cap.bet;

      setRaceResult(finishOrder);

      if (won) {
        const big = cap.betType === "exacta" || payout >= 10;
        if (big) { playBigWin(); setWinEffect({ show: true, big: true }); }
        else      { playWin();    setWinEffect({ show: true, big: false }); }
        setMessage(
          cap.betType === "win"
            ? `🏆 WINNER! +${(cap.bet * payout).toLocaleString()} CREDITS`
            : `🎯 EXACTA HIT! +${(cap.bet * payout).toLocaleString()} CREDITS`
        );
      } else {
        playLose();
        setMessage(`No luck — -${cap.bet.toLocaleString()} CREDITS`);
      }

      setPhase("result");

      const res = await fetch("/api/game-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: cap.userId,
          game: "horses",
          result: won ? "win" : "lose",
          amount: delta,
        }),
      });
      if (res.ok) {
        const { user: updated } = await res.json();
        saveSession(updated);
        setUser(updated);
      }
    };
  }, []); // runs once; settle reads from captureRef so no stale data

  // Race animation loop
  useEffect(() => {
    if (phase !== "racing" || !raceRef.current) return;

    const race      = raceRef.current;
    const startTime = Date.now();
    const maxTime   = Math.max(...race.finishTimes);
    let lastTick    = -999;
    let settled     = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const id = setInterval(() => {
      const elapsed = Date.now() - startTime;

      setPositions(
        race.finishTimes.map((ft, i) => horsePos(elapsed, ft, race.noise[i]))
      );

      if (elapsed - lastTick > 900) { playTick(); lastTick = elapsed; }

      if (!settled && elapsed >= maxTime + 700) {
        settled = true;
        clearInterval(id);
        setPositions(Array(5).fill(100));
        timeoutId = setTimeout(() => settleRef.current?.(race.finishOrder), 600);
      }
    }, 50);

    return () => { clearInterval(id); clearTimeout(timeoutId); };
  }, [phase]);

  const canRace =
    !!user && user.balance >= bet && bet >= MIN_BET &&
    (betType === "win"
      ? winHorse !== null
      : ex1 !== null && ex2 !== null && ex1 !== ex2);

  const startRace = useCallback(() => {
    if (!user || !canRace) return;

    captureRef.current = { userId: user.id, bet, betType, winHorse, ex1, ex2 };

    const race = buildRace();
    raceRef.current = race;

    setPositions([0, 0, 0, 0, 0]);
    setRaceResult(null);
    setPhase("racing");
    setMessage("AND THEY'RE OFF! 🏇");
  }, [user, canRace, bet, betType, winHorse, ex1, ex2]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { router.push("/lobby"); return; }
      if (phase === "betting" && e.code === "Space") { e.preventDefault(); startRace(); }
      if (phase === "result"  && e.code === "Space") { e.preventDefault(); reset(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [phase, startRace, reset, router]);

  if (!user) return null;

  // Horse display: positions 0→100 map to 0→88% of track (finish line at 88%)
  const FINISH_X = 88;
  const toTrackPct = (p: number) => Math.min(p, 100) * (FINISH_X / 100);

  const msgColor =
    message.includes("+") ? "text-green-400" :
    message.includes("-") ? "text-red-400"   :
    message.includes("OFF") ? "text-yellow-400" : "text-white";

  const medals = ["🥇", "🥈", "🥉", "4th", "5th"];

  return (
    <div className="flex flex-col min-h-screen bg-sky-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="horses"
        big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })}
      />

      <div className="flex flex-col items-center gap-4 p-4 pt-24 pb-8 w-full max-w-2xl mx-auto">
        <button
          onClick={() => router.push("/lobby")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
        >
          ← [ESC] LOBBY
        </button>

        {/* ── Track ── */}
        <div className="w-full bg-black rounded-3xl p-4 border-8 border-sky-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest mb-3 pb-3 border-b border-neutral-800 text-sky-400">
            SIGMA DERBY
            {phase !== "betting" && (
              <span className="ml-3 text-sm font-mono font-normal text-neutral-400">
                BET: <span className="text-yellow-400">{bet.toLocaleString()}</span>
                {" · "}
                {betType === "win"
                  ? <span className="text-sky-300">WIN #{(winHorse ?? 0) + 1} {HORSES[winHorse ?? 0].name}</span>
                  : <span className="text-sky-300">EXACTA #{(ex1 ?? 0) + 1}→#{(ex2 ?? 0) + 1}</span>}
              </span>
            )}
          </div>

          {/* Lanes */}
          <div className="flex flex-col gap-1.5">
            {HORSES.map((horse) => {
              const pct      = toTrackPct(positions[horse.id]);
              const finRank  = raceResult ? raceResult.indexOf(horse.id) : -1;
              const isMyPick =
                betType === "win" ? winHorse === horse.id
                : ex1 === horse.id || ex2 === horse.id;

              return (
                <div key={horse.id}
                  className={`flex items-center h-12 rounded-xl overflow-hidden border
                    ${phase === "betting" && isMyPick
                      ? "border-yellow-400 shadow-lg shadow-yellow-500/20"
                      : "border-neutral-800"}`}
                >
                  {/* Label chip */}
                  <div className={`w-20 shrink-0 h-full ${horse.chipBg} flex items-center justify-center gap-1`}>
                    <span className="font-black text-white text-sm">#{horse.id + 1}</span>
                    <span className="text-white/80 text-xs">{horse.name}</span>
                  </div>

                  {/* Track lane */}
                  <div className={`relative flex-1 h-full ${horse.laneBg} bg-green-950/60 overflow-hidden`}>
                    {/* Subtle grass stripes */}
                    <div className="absolute inset-0 opacity-10"
                      style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0, transparent 32px, white 32px, white 64px)" }}
                    />

                    {/* Finish line */}
                    <div className="absolute top-0 bottom-0 w-[3px]"
                      style={{ left: `${FINISH_X}%`, background: "repeating-linear-gradient(180deg, white 0, white 4px, transparent 4px, transparent 8px)" }}
                    />

                    {/* Horse emoji */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 text-2xl leading-none select-none pointer-events-none"
                      style={{ left: `${pct}%` }}
                    >
                      🐎
                    </div>

                    {/* Finish rank badge (after race) */}
                    {raceResult && finRank >= 0 && (
                      <div className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black z-10
                        ${finRank === 0 ? "bg-yellow-500 text-black" :
                          finRank === 1 ? "bg-neutral-200 text-black" :
                          finRank === 2 ? "bg-orange-700 text-white"  :
                                          "bg-neutral-700 text-white"}`}
                      >
                        {finRank + 1}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Message bar */}
          <div className="mt-3 bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 text-center min-h-10 flex items-center justify-center">
            <p className={`font-mono text-xs font-bold tracking-wide ${msgColor}`}>{message}</p>
          </div>
        </div>

        {/* Finish results board */}
        {raceResult && (
          <div className="w-full bg-black/40 rounded-xl border border-sky-900 p-3">
            <p className="text-center text-xs text-sky-400 font-mono mb-2 uppercase tracking-wider">
              Final Results
            </p>
            <div className="flex gap-1.5">
              {raceResult.map((horseId, rank) => {
                const h = HORSES[horseId];
                const highlighted =
                  (betType === "win"    && winHorse === horseId && rank === 0) ||
                  (betType === "exacta" && ((ex1 === horseId && rank === 0) || (ex2 === horseId && rank === 1)));
                return (
                  <div key={rank}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg ${h.chipBg}
                      ${highlighted ? "ring-2 ring-yellow-400 shadow-lg shadow-yellow-500/30" : ""}`}
                  >
                    <span className="text-base">{medals[rank]}</span>
                    <span className="text-xs font-black text-white">#{horseId + 1}</span>
                    <span className="text-[10px] text-white/70">{h.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Betting controls ── */}
        {phase === "betting" && (
          <>
            {/* Bet type */}
            <div className="w-full bg-black/40 rounded-xl border border-sky-900 p-3">
              <p className="text-center text-xs text-sky-400 font-mono mb-2 uppercase tracking-wider">Bet Type</p>
              <div className="flex gap-2">
                {(["win", "exacta"] as BetType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setBetType(t);
                      setWinHorse(null); setEx1(null); setEx2(null);
                    }}
                    className={`flex-1 py-3 rounded-xl font-black text-sm border-2 transition-all
                      ${betType === t
                        ? "bg-sky-600 border-sky-400 text-white"
                        : "bg-neutral-800 border-neutral-600 hover:border-neutral-400 text-neutral-400"}`}
                  >
                    {t === "win" ? `WIN  ·  pays ${WIN_PAYOUT}×` : `EXACTA  ·  pays ${EXACTA_PAYOUT}×`}
                  </button>
                ))}
              </div>
            </div>

            {/* Horse picker */}
            <div className="w-full bg-black/40 rounded-xl border border-sky-900 p-3">
              {betType === "win" ? (
                <>
                  <p className="text-center text-xs text-sky-400 font-mono mb-2 uppercase tracking-wider">
                    Pick 1st place
                  </p>
                  <div className="flex gap-1.5">
                    {HORSES.map((h) => (
                      <button key={h.id} onClick={() => setWinHorse(h.id)}
                        className={`flex-1 py-3 rounded-lg text-sm font-black border-2 transition-all
                          ${winHorse === h.id
                            ? `${h.chipBg} ${h.selBorder} text-white scale-105`
                            : "bg-neutral-800 border-neutral-700 hover:border-neutral-500 text-neutral-300"}`}
                      >
                        <div>#{h.id + 1}</div>
                        <div className={`text-[10px] mt-0.5 ${winHorse === h.id ? "text-white/80" : "text-neutral-500"}`}>{h.name}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-center text-xs text-sky-400 font-mono mb-2 uppercase tracking-wider">
                    Pick 1st place
                  </p>
                  <div className="flex gap-1.5 mb-3">
                    {HORSES.map((h) => (
                      <button key={h.id}
                        onClick={() => { setEx1(h.id); if (ex2 === h.id) setEx2(null); }}
                        className={`flex-1 py-2 rounded-lg text-sm font-black border-2 transition-all
                          ${ex1 === h.id
                            ? `${h.chipBg} ${h.selBorder} text-white scale-105`
                            : "bg-neutral-800 border-neutral-700 hover:border-neutral-500 text-neutral-300"}`}
                      >
                        <div>#{h.id + 1}</div>
                        <div className={`text-[10px] mt-0.5 ${ex1 === h.id ? "text-white/80" : "text-neutral-500"}`}>{h.name}</div>
                      </button>
                    ))}
                  </div>
                  <p className="text-center text-xs text-sky-400 font-mono mb-2 uppercase tracking-wider">
                    Pick 2nd place
                  </p>
                  <div className="flex gap-1.5">
                    {HORSES.map((h) => (
                      <button key={h.id}
                        onClick={() => { if (ex1 !== h.id) setEx2(h.id); }}
                        disabled={ex1 === h.id}
                        className={`flex-1 py-2 rounded-lg text-sm font-black border-2 transition-all
                          ${ex2 === h.id
                            ? `${h.chipBg} ${h.selBorder} text-white scale-105`
                            : ex1 === h.id
                              ? "bg-neutral-900 border-neutral-800 text-neutral-700 opacity-30 cursor-not-allowed"
                              : "bg-neutral-800 border-neutral-700 hover:border-neutral-500 text-neutral-300"}`}
                      >
                        <div>#{h.id + 1}</div>
                        <div className={`text-[10px] mt-0.5 ${ex2 === h.id ? "text-white/80" : "text-neutral-500"}`}>{h.name}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <BetSelector balance={user.balance} bet={bet} onChange={setBet} disabled={false} />
            <button
              onClick={startRace}
              disabled={!canRace}
              className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 border-b-8 border-sky-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
            >
              RACE! [SPACE]
            </button>
          </>
        )}

        {phase === "result" && (
          <button
            onClick={reset}
            className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 border-b-8 border-sky-900 active:border-b-2 transition-all active:scale-95 shadow-2xl"
          >
            BET AGAIN [SPACE]
          </button>
        )}
      </div>
    </div>
  );
}
