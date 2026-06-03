"use client";
import { useEffect, useCallback } from "react";
import { playChipClick } from "@/lib/sounds";

const CHIPS = [
  { value: 1,   label: "1",   color: "bg-slate-600 hover:bg-slate-500 border-slate-400",      key: "1" },
  { value: 5,   label: "5",   color: "bg-teal-700 hover:bg-teal-600 border-teal-400",          key: "2" },
  { value: 10,  label: "10",  color: "bg-blue-700 hover:bg-blue-600 border-blue-400",          key: "3" },
  { value: 25,  label: "25",  color: "bg-green-700 hover:bg-green-600 border-green-400",       key: "4" },
  { value: 50,  label: "50",  color: "bg-yellow-600 hover:bg-yellow-500 border-yellow-400",    key: "5" },
  { value: 100, label: "100", color: "bg-red-700 hover:bg-red-600 border-red-400",             key: "6" },
  { value: 500, label: "500", color: "bg-purple-700 hover:bg-purple-600 border-purple-400",    key: "7" },
];

interface BetSelectorProps {
  balance: number;
  bet: number;
  onChange: (bet: number) => void;
  disabled?: boolean;
}

export default function BetSelector({ balance, bet, onChange, disabled = false }: BetSelectorProps) {
  const addChip = useCallback(
    (value: number) => {
      if (disabled) return;
      const next = bet + value;
      if (next <= balance) { onChange(next); playChipClick(); }
    },
    [disabled, bet, balance, onChange]
  );

  const clear = useCallback(() => {
    if (!disabled && bet > 0) { onChange(0); playChipClick(); }
  }, [disabled, bet, onChange]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.key === "1") addChip(1);
      if (e.key === "2") addChip(5);
      if (e.key === "3") addChip(10);
      if (e.key === "4") addChip(25);
      if (e.key === "5") addChip(50);
      if (e.key === "6") addChip(100);
      if (e.key === "7") addChip(500);
      if (e.key === "0" || e.key === "c" || e.key === "C") clear();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [addChip, clear, disabled]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => addChip(chip.value)}
            disabled={disabled || bet + chip.value > balance}
            className={`relative w-12 h-12 rounded-full border-4 font-black text-xs text-white transition-all active:scale-90 shadow-lg ${chip.color} disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {chip.label}
            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-mono text-neutral-500">
              [{chip.key}]
            </span>
          </button>
        ))}
        <button
          onClick={clear}
          disabled={disabled || bet === 0}
          className="w-12 h-12 rounded-full border-4 border-neutral-600 bg-neutral-800 hover:bg-neutral-700 font-bold text-[10px] text-neutral-300 transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          [0]
          <br />
          CLR
        </button>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <span className="text-neutral-400 text-sm uppercase tracking-wider">Bet:</span>
        <span className={`font-mono font-black text-2xl ${bet > 0 ? "text-yellow-400" : "text-neutral-600"}`}>
          {bet > 0 ? bet.toLocaleString() : "—"}
        </span>
      </div>
    </div>
  );
}
