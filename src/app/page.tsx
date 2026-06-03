"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PinPad from "@/components/PinPad";
import { saveSession } from "@/lib/session";
import { UserProfile } from "@/types";

interface UserListItem {
  id: number;
  username: string;
  balance: number;
}

export default function Home() {
  const router = useRouter();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [selected, setSelected] = useState<UserListItem | null>(null);
  const [pinError, setPinError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPin, setNewPin] = useState("");
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then(setUsers);
  }, []);

  const handlePinSubmit = useCallback(
    async (pin: string) => {
      if (!selected) return;
      setPinError("");
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, pin }),
      });
      if (res.ok) {
        const user: UserProfile = await res.json();
        saveSession(user);
        router.push("/lobby");
      } else {
        setPinError("Incorrect PIN — try again");
      }
    },
    [selected, router]
  );

  const handleCreate = async () => {
    setCreateError("");
    if (!newUsername.trim()) return setCreateError("Username required");
    if (!/^\d{4}$/.test(newPin)) return setCreateError("PIN must be exactly 4 digits");

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername.trim(), pin: newPin }),
    });
    if (res.ok) {
      const user = await res.json();
      setUsers((prev) => [...prev, user].sort((a, b) => a.username.localeCompare(b.username)));
      setShowCreate(false);
      setNewUsername("");
      setNewPin("");
    } else {
      const data = await res.json();
      setCreateError(data.error || "Failed to create profile");
    }
  };

  if (selected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <PinPad
          username={selected.username}
          onSubmit={handlePinSubmit}
          onCancel={() => { setSelected(null); setPinError(""); }}
          error={pinError}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-neutral-950 text-white">
      <div className="flex flex-col items-center justify-center flex-1 p-6 gap-10">
        <div className="text-center">
          <h1 className="text-6xl md:text-8xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500">
            SYSTEM
          </h1>
          <h1 className="text-6xl md:text-8xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500">
            777
          </h1>
          <p className="text-neutral-500 text-sm tracking-widest mt-2 uppercase">Select Your Profile</p>
        </div>

        {users.length === 0 ? (
          <p className="text-neutral-600 text-lg">No profiles yet — create one below</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelected(user)}
                className="flex flex-col items-center gap-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-yellow-500 rounded-2xl p-6 transition-all active:scale-95"
              >
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-2xl font-black text-black">
                  {user.username[0].toUpperCase()}
                </div>
                <span className="font-bold text-lg">{user.username}</span>
                <span className="text-yellow-400 font-mono text-sm">{user.balance.toLocaleString()} credits</span>
              </button>
            ))}
          </div>
        )}

        {showCreate ? (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <h2 className="font-bold text-lg">New Profile</h2>
            <input
              autoFocus
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Username"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-500"
            />
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4-digit PIN"
              type="password"
              inputMode="numeric"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-500"
            />
            {createError && <p className="text-red-400 text-sm">{createError}</p>}
            <div className="flex gap-3 w-full">
              <button
                onClick={() => { setShowCreate(false); setCreateError(""); }}
                className="flex-1 py-3 rounded-xl border border-neutral-700 text-neutral-400 hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="flex-1 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold transition-all"
              >
                Create
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="px-8 py-4 rounded-2xl border-2 border-dashed border-neutral-700 hover:border-yellow-500 text-neutral-400 hover:text-yellow-400 transition-all text-lg font-semibold"
          >
            + New Profile
          </button>
        )}
      </div>
    </div>
  );
}
