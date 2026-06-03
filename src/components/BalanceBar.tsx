"use client";
import { UserProfile } from "@/types";

interface BalanceBarProps {
  user: UserProfile;
  onLogout: () => void;
}

export default function BalanceBar({ user, onLogout }: BalanceBarProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-black/80 backdrop-blur border-b border-neutral-800">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center font-bold text-black text-sm">
          {user.username[0].toUpperCase()}
        </div>
        <span className="font-semibold text-white">{user.username}</span>
      </div>
      <div className="text-center">
        <span className="text-neutral-400 text-xs uppercase tracking-wider">Credits</span>
        <div className="text-yellow-400 font-mono font-bold text-xl leading-none">{user.balance.toLocaleString()}</div>
      </div>
      <button
        onClick={onLogout}
        className="text-sm text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 px-3 py-1.5 rounded-lg transition-all"
      >
        Log Out
      </button>
    </div>
  );
}
