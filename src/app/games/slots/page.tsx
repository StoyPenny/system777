"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import { loadSession } from "@/lib/session";
import { SLOT_MACHINES } from "@/lib/slotMachines";
import { useState } from "react";
import { UserProfile } from "@/types";

export default function SlotPickerPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/"); return; }
    setUser(s);
  }, [router]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < SLOT_MACHINES.length) {
        router.push(`/games/slots/${SLOT_MACHINES[idx].id}`);
      }
      if (e.key === "Escape") router.push("/lobby");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [router]);

  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen bg-neutral-950 text-white">
      <BalanceBar user={user} onLogout={() => router.replace("/")} />

      <div className="flex flex-col items-center gap-8 p-6 pt-24">
        <button
          onClick={() => router.push("/lobby")}
          className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
        >
          ← [ESC] LOBBY
        </button>

        <div className="text-center">
          <h2 className="text-3xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            SLOT MACHINES
          </h2>
          <p className="text-neutral-500 text-sm mt-1">Choose a machine</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full max-w-4xl">
          {SLOT_MACHINES.map((machine, i) => (
            <button
              key={machine.id}
              onClick={() => router.push(`/games/slots/${machine.id}`)}
              className={`${machine.bgColor} border-4 ${machine.borderColor} rounded-2xl p-6 flex flex-col gap-4 transition-all active:scale-95 hover:brightness-110 shadow-2xl text-left`}
            >
              <div className="flex items-start justify-between">
                <span className="text-5xl">{machine.previewEmoji}</span>
                <span className="text-xs font-mono text-neutral-500 border border-neutral-700 px-2 py-0.5 rounded">
                  [{i + 1}]
                </span>
              </div>
              <div>
                <p className={`font-black text-xl ${machine.accentColor}`}>{machine.name}</p>
                <p className="text-neutral-400 text-sm mt-0.5">{machine.tagline}</p>
              </div>
              <div className="flex gap-1 flex-wrap">
                {machine.symbols.map((s, j) => (
                  <span key={j} className="text-xl opacity-70">{s}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
