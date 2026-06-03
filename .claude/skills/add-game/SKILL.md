---
description: Add a new game to the system777 arcade casino app (lobby, page, WinEffect, session API)
---

# Add Game — system777

Use this skill whenever the user asks to add a new casino game. Follow these steps in order. Do not skip any step.

---

## Step 0 — Gather requirements

Before writing code, confirm:
- **Game name** (used as the URL slug, e.g. `craps`)
- **Game mechanics** (betting phases, win conditions, any card/dice/number logic)
- **Theme color** (pick a Tailwind color not already used — see lobby GAMES array for what's taken)

Existing color assignments (do not reuse):
- Slots → red
- Video Poker → green
- Roulette → blue
- Blackjack → emerald
- Keno → purple
- Baccarat → indigo

---

## Step 1 — Read the reference implementations

Before writing anything, read these two files fully. They show the exact patterns the codebase uses:

```
src/app/games/blackjack/page.tsx   ← card game with async deal animation
src/app/games/keno/page.tsx        ← non-card game with phase state machine
```

All games follow the same skeleton:
1. `"use client"` directive
2. Session guard in `useEffect` → redirect to `/` if no session
3. `BalanceBar` at the top
4. `WinEffect` overlay (always present, toggled via state)
5. `BetSelector` for setting wager (only rendered in betting/bet phase)
6. Phase state machine: betting → playing → result (names vary per game)
7. `useCallback` for all actions, `useEffect` for keyboard bindings
8. `fetch("/api/game-session", ...)` to persist result and update balance
9. `saveSession(updated)` + `setUser(updated)` after successful API response

---

## Step 2 — Create the game page

Create `src/app/games/<slug>/page.tsx`.

### Required imports (copy this block, remove unused)
```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import BalanceBar from "@/components/BalanceBar";
import BetSelector from "@/components/BetSelector";
import WinEffect from "@/components/WinEffect";
import { loadSession, saveSession } from "@/lib/session";
import { playWin, playBigWin, playLose, playCardFlip, playTick } from "@/lib/sounds";
import { UserProfile } from "@/types";
// For card games also import: import { PokerCard } from "@/types";
```

### Card deck helpers (for card games only)
Copy `makeDeck()`, `SUITS`, and `VALUES` from `blackjack/page.tsx`. For baccarat-style value rules, see `baccarat/page.tsx`'s `baccaratValue()`.

### Phase type
Define a `Phase` type for the state machine. Common patterns:
- Simple game: `type Phase = "betting" | "playing" | "result"`
- Card game with dealer animation: `type Phase = "betting" | "player" | "dealer" | "result"`
- Keno-style draw: `type Phase = "bet" | "pick" | "drawing" | "result"`

### Session API call
All games report results the same way. The API accepts any `game` string and any `result` string:
```tsx
const res = await fetch("/api/game-session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    userId: user.id,
    game: "<slug>",           // matches the URL slug
    result: "win" | "lose" | "push" | ...,  // any string is fine
    amount: delta,            // positive = player gains, negative = player loses
  }),
});
if (res.ok) {
  const { user: updated } = await res.json();
  saveSession(updated);
  setUser(updated);
}
```

`amount` is the **net delta** — not the gross payout. A win of 1:1 on a 50-credit bet sends `amount: 50`. A loss sends `amount: -50`. A push/tie sends `amount: 0`.

### Keyboard bindings
- Always: `Escape` → `router.push("/lobby")`
- Betting phase: `Space` → deal/spin/play action, number keys only if BetSelector is NOT rendered on this phase
- In-play phase: number keys for actions (1=hit, 2=stand, etc.)
- Result phase: `Space` → reset and return to betting

**Important:** `BetSelector` binds keys 1–7 (chip values) and 0/C (clear) while it is mounted. Do not assign those same keys to game actions while BetSelector is visible — only bind game-action keys when BetSelector is unmounted (i.e. a different phase).

### Board/state reset
When transitioning from `result` back to `betting`, clear ALL game state immediately (not lazily on the next deal). Failing to do this leaves stale highlighted state visible and un-interactive during the bet phase. Pattern:

```tsx
const reset = useCallback(() => {
  // clear ALL game-specific state here
  setPhase("betting");
  setMessage("PLACE YOUR BET");
}, []);
```

### WinEffect wiring
```tsx
const [winEffect, setWinEffect] = useState({ show: false, big: false });

// On a regular win:
playWin();
setWinEffect({ show: true, big: false });

// On a big win (jackpot, natural, royal flush, etc.):
playBigWin();
setWinEffect({ show: true, big: true });

// In JSX:
<WinEffect
  show={winEffect.show}
  game="<slug>"          // must match a key in CONFIGS — see Step 3
  big={winEffect.big}
  onDone={() => setWinEffect({ show: false, big: false })}
/>
```

### Background color
Each game has its own full-screen bg color:
```tsx
<div className="flex flex-col min-h-screen bg-<color>-950 text-white">
```
Use the theme color chosen in Step 0.

### Back button (always include)
```tsx
<button
  onClick={() => router.push("/lobby")}
  className="self-start px-4 py-2 bg-black/40 hover:bg-black/60 border border-neutral-700 rounded-lg text-sm font-mono"
>
  ← [ESC] LOBBY
</button>
```

### Game board border color
```tsx
<div className="... border-8 border-<color>-600 ...">
```

### Action buttons
Match the existing button style:
```tsx
<button className="px-16 py-8 rounded-2xl text-3xl font-black tracking-wider
  bg-gradient-to-r from-<color>-500 to-<color>-600
  hover:from-<color>-400 hover:to-<color>-500
  border-b-8 border-<color>-900 active:border-b-2
  transition-all active:scale-95 shadow-2xl disabled:opacity-50">
  ACTION [KEY]
</button>
```

---

## Step 3 — Register the game in WinEffect

Open `src/components/WinEffect.tsx`.

Add the slug to the `GameId` union type:
```tsx
type GameId = "slots" | "poker" | "roulette" | "blackjack" | "keno" | "baccarat" | "<slug>";
```

Add an entry to the `CONFIGS` object. Choose a `style` that fits the game:
- `"fall"` — particles drop from the top (coins, cards)
- `"rise"` — particles float up from the bottom (suits, chips)
- `"burst"` — particles radiate from the center (balls, dots)

```tsx
<slug>: {
  style: "fall" | "rise" | "burst",
  winEmoji: ["emoji1", "emoji2", ...],   // 6–7 items
  bigEmoji: ["emoji1", "emoji2", ...],   // 8–10 items, more variety
  flashColor: "rgba(R,G,B,0.28)",        // screen tint on win
},
```

---

## Step 4 — Add to the lobby

Open `src/app/lobby/page.tsx`.

Add an entry to the `GAMES` array. Pick the next available key number:
```tsx
{
  id: "<slug>",
  name: "<Display Name>",
  description: "<one-line description>",
  emoji: "<emoji>",
  keys: "[N]",           // next sequential number
  color: "from-<color>-900 to-<color>-950",
  border: "border-<color>-700 hover:border-<color>-400",
},
```

Add the keyboard shortcut to the `useEffect` keydown handler:
```tsx
if (e.key === "N") router.push("/games/<slug>");
```

Check the grid `className`. The lobby uses `grid-cols-2` on mobile. On medium+ screens the column count should equal `Math.ceil(GAMES.length / 2)` to keep two even rows:
- 4 games → `md:grid-cols-4` (one row)... actually just use the row that fills nicely
- 5–6 games → `md:grid-cols-3`
- 7–8 games → `md:grid-cols-4`

Update the `className` if the game count crossed a threshold.

---

## Step 5 — Type-check

```bash
npx tsc --noEmit
```

Fix any errors before proceeding.

---

## Step 6 — Verify in the browser

Ask the user to test:
1. Lobby shows the new game card with correct name, emoji, and key label
2. Pressing the assigned key navigates to the game
3. BetSelector works; balance deducts on loss, increments on win
4. Win animation fires (WinEffect overlay appears)
5. "Play again" / reset clears the board completely — no stale state from previous round
6. ESC returns to lobby

---

## Checklist before marking done

- [ ] `src/app/games/<slug>/page.tsx` created
- [ ] Session guard present (`loadSession` → redirect if null)
- [ ] `BalanceBar` included
- [ ] `WinEffect` included and wired with correct `game="<slug>"`
- [ ] `BetSelector` used for wager input
- [ ] `/api/game-session` called with correct `amount` delta after each round
- [ ] `saveSession` + `setUser` called after API response
- [ ] Reset clears all game state immediately when returning to bet phase
- [ ] `WinEffect.tsx` updated with new `GameId` and `CONFIGS` entry
- [ ] `lobby/page.tsx` `GAMES` array updated
- [ ] `lobby/page.tsx` keyboard handler updated
- [ ] `lobby/page.tsx` grid `className` updated if needed
- [ ] `npx tsc --noEmit` passes with no errors
