"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { ROULETTE_NUMBERS } from "@/lib/games";
import { playWin, playBigWin, playLose, playSpinClick, playChipClick } from "@/lib/sounds";
import { UserProfile } from "@/types";

type BetType =
  | "red" | "black" | "green"
  | "odd" | "even"
  | "low" | "high"
  | "1st12" | "2nd12" | "3rd12";

type BetsMap = Partial<Record<BetType, number>>;

const MIN_CHIP = 1;
const HISTORY_MAX = 22;

const PAYOUTS: Record<BetType, number> = {
  red: 2, black: 2, green: 35,
  odd: 2, even: 2,
  low: 2, high: 2,
  "1st12": 3, "2nd12": 3, "3rd12": 3,
};

const CHIPS = [
  { value: 1,   label: "1",   color: "bg-slate-600 border-slate-400",    key: "1" },
  { value: 5,   label: "5",   color: "bg-teal-700 border-teal-400",      key: "2" },
  { value: 10,  label: "10",  color: "bg-blue-700 border-blue-400",      key: "3" },
  { value: 25,  label: "25",  color: "bg-green-700 border-green-400",    key: "4" },
  { value: 50,  label: "50",  color: "bg-yellow-600 border-yellow-400",  key: "5" },
  { value: 100, label: "100", color: "bg-red-700 border-red-400",        key: "6" },
  { value: 500, label: "500", color: "bg-purple-700 border-purple-400",  key: "7" },
];

interface HistoryEntry {
  number: number;
  color: "red" | "black" | "green";
}

function checkWin(bet: BetType, n: number, color: string): boolean {
  if (bet === "red")   return color === "red";
  if (bet === "black") return color === "black";
  if (bet === "green") return color === "green";
  if (bet === "odd")   return n !== 0 && n % 2 !== 0;
  if (bet === "even")  return n !== 0 && n % 2 === 0;
  if (bet === "low")   return n >= 1 && n <= 18;
  if (bet === "high")  return n >= 19 && n <= 36;
  if (bet === "1st12") return n >= 1 && n <= 12;
  if (bet === "2nd12") return n >= 13 && n <= 24;
  if (bet === "3rd12") return n >= 25 && n <= 36;
  return false;
}

function slotArc(cx: number, cy: number, innerR: number, outerR: number, startDeg: number, endDeg: number): string {
  const r = (d: number) => (d * Math.PI) / 180;
  const c1 = Math.cos(r(startDeg)), s1 = Math.sin(r(startDeg));
  const c2 = Math.cos(r(endDeg)),   s2 = Math.sin(r(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const ox1 = cx + outerR * c1, oy1 = cy + outerR * s1;
  const ox2 = cx + outerR * c2, oy2 = cy + outerR * s2;
  const ix1 = cx + innerR * c1, iy1 = cy + innerR * s1;
  const ix2 = cx + innerR * c2, iy2 = cy + innerR * s2;
  return `M ${ix1} ${iy1} L ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${large} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${large} 0 ${ix1} ${iy1} Z`;
}

function fmtChip(n: number): string {
  if (n >= 1000) return `${n % 1000 === 0 ? n / 1000 : (n / 1000).toFixed(1)}k`;
  return String(n);
}

function NumberBubble({ entry, size = "md" }: { entry: HistoryEntry; size?: "sm" | "md" }) {
  const bg = entry.color === "red" ? "bg-red-600" : entry.color === "black" ? "bg-neutral-700" : "bg-green-600";
  const dim = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div className={`${dim} ${bg} rounded-full flex items-center justify-center font-black text-white shrink-0 shadow`}>
      {entry.number}
    </div>
  );
}

export default function RoulettePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [bets, setBets] = useState<BetsMap>({});
  const [chip, setChip] = useState(10);
  const [spinning, setSpinning] = useState(false);
  const [message, setMessage] = useState("SELECT A CHIP, PLACE YOUR BETS, AND SPIN!");
  const [ballAngle, setBallAngle] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [winEffect, setWinEffect] = useState<{ show: boolean; big: boolean }>({ show: false, big: false });
  const animRef = useRef<number | null>(null);

  const totalBetAmount = Object.values(bets).reduce((s, v) => s + (v ?? 0), 0);
  const betCount = Object.values(bets).filter((v) => (v ?? 0) > 0).length;

  useEffect(() => {
    const session = loadSession();
    if (!session) { router.replace("/"); return; }
    setUser(session);
  }, [router]);

  const handleBetClick = useCallback((type: BetType, e: React.MouseEvent) => {
    e.preventDefault();
    if (spinning || !user) return;

    if (e.type === "contextmenu") {
      setBets((prev) => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
      playChipClick();
      return;
    }

    if (chip < MIN_CHIP) { setMessage("SELECT A CHIP FIRST!"); return; }
    if (totalBetAmount + chip > user.balance) { setMessage("NOT ENOUGH CREDITS!"); return; }
    setBets((prev) => ({ ...prev, [type]: (prev[type] ?? 0) + chip }));
    playChipClick();
  }, [spinning, user, chip, totalBetAmount]);

  const clearBets = useCallback(() => {
    if (spinning) return;
    setBets({});
    playChipClick();
  }, [spinning]);

  const spin = useCallback(async () => {
    if (!user || spinning || totalBetAmount < MIN_CHIP || user.balance < totalBetAmount) {
      if (totalBetAmount < MIN_CHIP) setMessage("PLACE YOUR BETS FIRST!");
      return;
    }

    setSpinning(true);
    setMessage("WHEEL IS SPINNING...");
    playSpinClick();

    const finalIndex = Math.floor(Math.random() * ROULETTE_NUMBERS.length);
    const final = ROULETTE_NUMBERS[finalIndex];
    const slotCenter = ((finalIndex + 0.5) / ROULETTE_NUMBERS.length) * 360;
    const diff = ((slotCenter - ballAngle) % 360 + 360) % 360;
    const totalRotation = diff + 360 * 8;
    const duration = 6000;
    const start = performance.now();
    const startAngle = ballAngle;
    const activeBets = { ...bets };

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      setBallAngle((startAngle + totalRotation * ease) % 360);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setBallAngle(slotCenter);
        setSpinning(false);

        const entry: HistoryEntry = { number: final.number, color: final.color };
        setHistory((prev) => [entry, ...prev].slice(0, HISTORY_MAX));

        let totalDelta = 0;
        let anyWin = false;
        let bigWin = false;
        let winsCount = 0;

        for (const [type, amount] of Object.entries(activeBets) as [BetType, number][]) {
          if (!amount) continue;
          const won = checkWin(type, final.number, final.color);
          const multiplier = PAYOUTS[type];
          if (won) {
            totalDelta += amount * (multiplier - 1);
            anyWin = true;
            winsCount++;
            if (multiplier >= 35) bigWin = true;
          } else {
            totalDelta -= amount;
          }
        }

        const activeBetCount = Object.keys(activeBets).length;
        const netStr = totalDelta >= 0
          ? `+${totalDelta.toLocaleString()}`
          : `${totalDelta.toLocaleString()}`;
        const winLabel = anyWin
          ? (winsCount === activeBetCount ? "All bets win!" : `Won ${winsCount}/${activeBetCount}!`)
          : "No wins.";
        setMessage(`${final.number} ${final.color.toUpperCase()} — ${winLabel} Net: ${netStr} CREDITS`);

        if (anyWin) {
          if (bigWin) playBigWin(); else playWin();
          setWinEffect({ show: true, big: bigWin });
        } else {
          playLose();
        }

        fetch("/api/game-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id, game: "roulette",
            result: `${final.number} ${final.color}`, amount: totalDelta,
          }),
        }).then((r) => r.json()).then(({ user: updated }) => {
          saveSession(updated);
          setUser(updated);
        });
      }
    };
    animRef.current = requestAnimationFrame(animate);
  }, [user, spinning, totalBetAmount, ballAngle, bets]);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (spinning) return;
      if (e.code === "Space") { e.preventDefault(); spin(); return; }
      if (e.key === "Escape") { router.push("/lobby"); return; }
      if (e.key === "0" || e.key === "c" || e.key === "C") { clearBets(); return; }
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < CHIPS.length) {
        setChip(CHIPS[idx].value);
        playChipClick();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [spin, router, clearBets, spinning]);

  if (!user) return null;

  const wheelRadius = 120;
  const innerR = wheelRadius - 26;
  const textR  = (innerR + wheelRadius) / 2; // midpoint of ring
  const ballR  = textR;
  const ballX  = 150 + ballR * Math.cos((ballAngle * Math.PI) / 180);
  const ballY  = 150 + ballR * Math.sin((ballAngle * Math.PI) / 180);

  // Tally history counts
  const redCount   = history.filter((h) => h.color === "red").length;
  const blackCount = history.filter((h) => h.color === "black").length;
  const greenCount = history.filter((h) => h.color === "green").length;

  const Btn = ({ type, label, sub, className }: { type: BetType; label: string; sub?: string; className: string }) => {
    const staked = bets[type] ?? 0;
    return (
      <button
        onClick={(e) => handleBetClick(type, e)}
        onContextMenu={(e) => handleBetClick(type, e)}
        disabled={spinning}
        className={`relative py-3 px-3 rounded-xl font-bold text-sm leading-tight transition-all active:scale-95 border-4 text-center select-none ${className} ${
          staked > 0
            ? "ring-2 ring-white/40 border-white/50 brightness-110"
            : "border-transparent opacity-70 hover:opacity-100"
        } disabled:cursor-not-allowed`}
      >
        {label}
        {sub && <span className="block text-xs opacity-60 font-normal mt-0.5">{sub}</span>}
        {staked > 0 && (
          <span className="absolute -top-2.5 -right-2.5 bg-yellow-400 text-black text-[10px] font-black rounded-full min-w-[1.4rem] h-5 flex items-center justify-center px-1 shadow-lg border border-yellow-500 leading-none z-10">
            {fmtChip(staked)}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-blue-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />
      <WinEffect
        show={winEffect.show}
        game="roulette"
        big={winEffect.big}
        onDone={() => setWinEffect({ show: false, big: false })}
      />

      <div className="flex flex-col items-center gap-4 p-4 pt-20 pb-6 w-full max-w-3xl mx-auto">
        <button
          onClick={() => router.push("/lobby")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
        >
          ← [ESC] LOBBY
        </button>

        {/* History board */}
        <div className="w-full bg-black/60 rounded-2xl border border-neutral-800 p-3">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-neutral-500 uppercase tracking-wider font-mono">Recent Results</span>
            <div className="flex items-center gap-2 ml-auto text-xs font-mono">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-600 inline-block" /><span className="text-red-400">{redCount}</span></span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-neutral-600 inline-block" /><span className="text-neutral-300">{blackCount}</span></span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-600 inline-block" /><span className="text-green-400">{greenCount}</span></span>
            </div>
          </div>
          {history.length === 0 ? (
            <p className="text-neutral-700 text-xs font-mono text-center py-2">No results yet</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {history.map((entry, i) => (
                <div key={i} className="relative">
                  <NumberBubble entry={entry} size="sm" />
                  {i === 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full border border-black" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main panel */}
        <div className="w-full bg-black rounded-3xl p-5 border-8 border-blue-600 shadow-2xl">
          <div className="text-center text-lg font-black tracking-widest mb-4 pb-3 border-b border-neutral-800 text-blue-400">
            ROULETTE
          </div>

          <div className="flex flex-col lg:flex-row gap-5 items-center">

            {/* Wheel */}
            <div className="flex-shrink-0">
              <svg width="260" height="260" viewBox="0 0 300 300">
                {ROULETTE_NUMBERS.map((n, i) => {
                  const startDeg = (i / ROULETTE_NUMBERS.length) * 360;
                  const endDeg   = ((i + 1) / ROULETTE_NUMBERS.length) * 360;
                  const midDeg   = (startDeg + endDeg) / 2;
                  const fill     = n.color === "red" ? "#dc2626" : n.color === "black" ? "#171717" : "#16a34a";
                  const tx = 150 + textR * Math.cos((midDeg * Math.PI) / 180);
                  const ty = 150 + textR * Math.sin((midDeg * Math.PI) / 180);
                  return (
                    <g key={i}>
                      <path
                        d={slotArc(150, 150, innerR, wheelRadius, startDeg, endDeg)}
                        fill={fill}
                        stroke="#000"
                        strokeWidth="0.8"
                      />
                      <text
                        x={tx}
                        y={ty}
                        textAnchor="middle"
                        dominantBaseline="central"
                        transform={`rotate(${midDeg + 90}, ${tx}, ${ty})`}
                        fontSize="8"
                        fontWeight="900"
                        fill="white"
                        opacity="0.9"
                        style={{ userSelect: "none", pointerEvents: "none" }}
                      >
                        {n.number}
                      </text>
                    </g>
                  );
                })}
                <circle cx="150" cy="150" r={wheelRadius} fill="none" stroke="#6b7280" strokeWidth="3" />
                <circle cx="150" cy="150" r={innerR}      fill="none" stroke="#6b7280" strokeWidth="2" />
                <circle cx="150" cy="150" r="22" fill="#111827" stroke="#6b7280" strokeWidth="2" />
                <circle
                  cx={ballX} cy={ballY} r="8"
                  fill="white"
                  filter="drop-shadow(0 0 4px rgba(255,255,255,0.8))"
                />
              </svg>
            </div>

            {/* Bet grid */}
            <div className="flex-1 flex flex-col gap-2 w-full">

              {/* Red / Black / Green */}
              <div className="grid grid-cols-3 gap-2">
                <Btn type="red"   label="RED"      className="bg-red-600 hover:bg-red-500" />
                <Btn type="black" label="BLACK"    className="bg-neutral-700 hover:bg-neutral-600" />
                <Btn type="green" label="0 GREEN"  sub="35 to 1" className="bg-green-700 hover:bg-green-600" />
              </div>

              {/* Odd / Even */}
              <div className="grid grid-cols-2 gap-2">
                <Btn type="odd"  label="ODD"  className="bg-blue-800 hover:bg-blue-700" />
                <Btn type="even" label="EVEN" className="bg-blue-800 hover:bg-blue-700" />
              </div>

              {/* Low / High */}
              <div className="grid grid-cols-2 gap-2">
                <Btn type="low"  label="LOW"  sub="1 – 18"  className="bg-indigo-800 hover:bg-indigo-700" />
                <Btn type="high" label="HIGH" sub="19 – 36" className="bg-indigo-800 hover:bg-indigo-700" />
              </div>

              {/* Dozens */}
              <div className="border-t border-neutral-800 pt-2">
                <p className="text-xs text-neutral-500 font-mono mb-1.5 text-center tracking-wider">DOZENS — 2 to 1</p>
                <div className="grid grid-cols-3 gap-2">
                  <Btn type="1st12" label="1st 12" sub="1 – 12"  className="bg-amber-800 hover:bg-amber-700" />
                  <Btn type="2nd12" label="2nd 12" sub="13 – 24" className="bg-amber-800 hover:bg-amber-700" />
                  <Btn type="3rd12" label="3rd 12" sub="25 – 36" className="bg-amber-800 hover:bg-amber-700" />
                </div>
              </div>

              {/* Bet summary */}
              <div className="flex items-center justify-between pt-2 border-t border-neutral-800 mt-1">
                <span className="text-xs font-mono text-neutral-400">
                  {betCount > 0
                    ? `${betCount} bet${betCount !== 1 ? "s" : ""} · Total: ${totalBetAmount.toLocaleString()} cr`
                    : <span className="text-neutral-600">No bets placed</span>}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-neutral-600 text-[10px] font-mono hidden sm:inline">right-click to remove</span>
                  {betCount > 0 && (
                    <button
                      onClick={clearBets}
                      disabled={spinning}
                      className="text-xs font-mono text-red-400 hover:text-red-300 disabled:opacity-50 px-2 py-1 rounded hover:bg-red-950 transition-colors"
                    >
                      CLEAR [C]
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Status message */}
          <div className="mt-4 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-center min-h-12 flex items-center justify-center">
            <p className={`font-mono text-sm font-bold tracking-wide ${
              message.includes("Net: +") ? "text-green-400"
              : message.includes("Net: -") ? "text-red-400"
              : "text-white"
            }`}>
              {message}
            </p>
          </div>
        </div>

        {/* Chip selector */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {CHIPS.map((c) => (
              <button
                key={c.value}
                onClick={() => { setChip(c.value); playChipClick(); }}
                disabled={spinning}
                className={`relative w-12 h-12 rounded-full border-4 font-black text-xs text-white transition-all active:scale-90 shadow-lg ${c.color} disabled:opacity-30 ${
                  chip === c.value
                    ? "ring-4 ring-white/50 scale-110"
                    : "opacity-60 hover:opacity-90"
                }`}
              >
                {c.label}
                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-mono text-neutral-500">
                  [{c.key}]
                </span>
              </button>
            ))}
          </div>
          <p className="text-neutral-500 text-xs font-mono mt-5">
            CHIP: <span className="text-yellow-400 font-bold">{chip.toLocaleString()}</span>
            {" · "}click bet to place · right-click to remove
          </p>
        </div>

        <button
          onClick={spin}
          disabled={spinning || totalBetAmount < MIN_CHIP || !user || user.balance < totalBetAmount}
          className="w-full max-w-xs px-8 py-7 rounded-2xl text-3xl font-black tracking-wider bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 border-b-8 border-blue-900 active:border-b-2 transition-all active:scale-95 shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {spinning ? "SPINNING..." : totalBetAmount > 0 ? "SPIN [SPACE]" : "PLACE YOUR BETS"}
        </button>
      </div>
    </div>
  );
}
