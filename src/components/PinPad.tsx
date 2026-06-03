"use client";
import { useEffect, useState } from "react";

interface PinPadProps {
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  username: string;
  error?: string;
}

export default function PinPad({ onSubmit, onCancel, username, error }: PinPadProps) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9" && pin.length < 4) {
        setPin((p) => p + e.key);
      }
      if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [pin, onCancel]);

  useEffect(() => {
    if (pin.length === 4) {
      onSubmit(pin);
      setPin("");
    }
  }, [pin, onSubmit]);

  const press = (digit: string) => {
    if (pin.length < 4) setPin((p) => p + digit);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-neutral-400 text-sm uppercase tracking-widest mb-1">Enter PIN for</p>
        <p className="text-2xl font-bold text-white">{username}</p>
      </div>

      <div className="flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${
              pin.length > i
                ? "bg-yellow-400 border-yellow-400"
                : "bg-neutral-800 border-neutral-600"
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-sm font-mono">{error}</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {["1","2","3","4","5","6","7","8","9"].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="w-16 h-16 text-2xl font-bold bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 rounded-xl border border-neutral-700 transition-all active:scale-95"
          >
            {d}
          </button>
        ))}
        <button
          onClick={onCancel}
          className="w-16 h-16 text-sm font-bold bg-neutral-900 hover:bg-neutral-800 rounded-xl border border-neutral-700 text-neutral-400 transition-all active:scale-95"
        >
          ESC
        </button>
        <button
          onClick={() => press("0")}
          className="w-16 h-16 text-2xl font-bold bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 rounded-xl border border-neutral-700 transition-all active:scale-95"
        >
          0
        </button>
        <button
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="w-16 h-16 text-lg font-bold bg-neutral-900 hover:bg-neutral-800 rounded-xl border border-neutral-700 text-neutral-400 transition-all active:scale-95"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
