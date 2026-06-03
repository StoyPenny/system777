# System777

A tabletop arcade casino system built with Next.js. Designed to run as a kiosk on a touchscreen display with physical arcade buttons — like a real casino machine you'd find on a bar top.

## Features

- **PIN-based player profiles** — ATM-style 4-digit login, per-player credit balance persisted in SQLite
- **Fully offline** — no internet required, everything runs locally
- **Touch + keyboard** — all games work with touchscreen taps and physical arcade buttons via USB encoder
- **Sound effects** — procedurally generated via Web Audio API (no audio files)
- **Win animations** — unique particle effects per game on every win

---

## Games

### Slot Machines
Pick from a collection of themed machines. All share the same mechanics — three reels, match symbols to win.

| Machine | Theme |
|---|---|
| Classic Fruits | 🍒 The original one-armed bandit |
| Cyber Neon | ⚡ Hack the mainframe |
| Pharaohs Gold | 👑 Ancient riches await |
| Cocktail Hour | 🍹 Last round — bet it all |
| Wild Safari | 🦁 Hunt the big five |

Payouts: Two of a kind = **2×**, Jackpot (three matching) = **10×**

### Poker
| Variant | Description |
|---|---|
| Video Poker | Jacks or Better, 5-card draw. Hold cards, draw replacements. Pays up to 800× for Royal Flush. |
| 3-Card Poker | vs the dealer. Ante up, see 3 cards, fold or play. Dealer needs Q-high to qualify. Mini Royal pays 5× ante bonus. |

### Roulette
European single-zero roulette with a full bet layout. Tracks recent results with a color history board.

Bet types: Red/Black (2×), Odd/Even (2×), Low/High (2×), 1st/2nd/3rd Dozen (3×), Green 0 (35×)

### Blackjack
Standard rules vs the dealer. Hit, Stand, or Double Down. Dealer stands on soft 17. Blackjack pays 3:2.

---

## Arcade Button Mapping

Wire physical buttons to a USB encoder (I-PAC, Zero-Delay, etc.) and map them to these keys:

### Lobby / Pickers
| Button | Key | Action |
|---|---|---|
| Button 1–5 | `1`–`5` | Select game / machine |
| Back | `Esc` | Back to previous screen |

### During a game — Bet Selection
Chips are available between rounds (BetSelector is disabled during active play).

| Key | Chip |
|---|---|
| `1` | 1 credit |
| `2` | 5 credits |
| `3` | 10 credits |
| `4` | 25 credits |
| `5` | 50 credits |
| `6` | 100 credits |
| `7` | 500 credits |
| `0` | Clear bet |

### Per-Game Controls
| Key | Slots | Video Poker | 3-Card Poker | Roulette | Blackjack |
|---|---|---|---|---|---|
| `Space` | Spin | Deal / Draw | Deal | Spin | Deal |
| `1`–`5` | — | Hold card 1–5 | Fold / Play | — | Hit / Stand / Double |
| `Esc` | Slot picker | Poker menu | Poker menu | Lobby | Lobby |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Styling | Tailwind CSS v4 |
| Database | SQLite via Prisma 7 + `@prisma/adapter-libsql` |
| Auth | 4-digit PIN hashed with bcrypt |
| Sounds | Web Audio API (procedural, no files) |

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install and run

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create a player profile and start playing.

### Production build

```bash
npm run build
npm start
```

### Kiosk mode (arcade cabinet)

To launch the app full-screen on boot, configure your OS to auto-start a browser in kiosk mode pointing at `http://localhost:3000`.

**Linux (Chromium example):**
```bash
chromium-browser --kiosk --app=http://localhost:3000
```

**Windows (Chrome example):**
```
chrome.exe --kiosk http://localhost:3000
```

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Profile select / PIN login
│   ├── lobby/page.tsx              # Game picker
│   └── games/
│       ├── slots/
│       │   ├── page.tsx            # Slot machine picker
│       │   └── [id]/
│       │       ├── page.tsx        # Server wrapper (resolves machine ID)
│       │       └── SlotGame.tsx    # Client game component
│       ├── poker/
│       │   ├── page.tsx            # Poker variant picker
│       │   ├── video-poker/        # Jacks or Better
│       │   └── three-card/         # 3-Card Poker vs dealer
│       ├── roulette/               # European roulette
│       └── blackjack/              # Standard blackjack
├── components/
│   ├── BalanceBar.tsx              # Fixed top bar with credits + logout
│   ├── BetSelector.tsx             # Chip stack bet input
│   ├── PinPad.tsx                  # 4-digit PIN entry
│   └── WinEffect.tsx               # Per-game particle win animations
├── lib/
│   ├── slotMachines.ts             # All slot machine configs (add new machines here)
│   ├── pokerVariants.ts            # Poker variant registry (add new variants here)
│   ├── games.ts                    # Roulette wheel data
│   ├── sounds.ts                   # Web Audio API sound generation
│   ├── prisma.ts                   # Prisma client singleton
│   └── session.ts                  # sessionStorage profile helpers
└── api/
    ├── auth/                       # POST — verify PIN
    ├── users/                      # GET list / POST create profile
    └── game-session/               # POST — record result, update balance
```

---

## Adding Content

### New slot machine
Append one entry to `src/lib/slotMachines.ts`:

```ts
{
  id: "space-voyage",
  name: "Space Voyage",
  tagline: "To infinity and beyond",
  symbols: ["🚀", "🌙", "⭐", "🪐", "👽", "🛸", "💫"],
  previewEmoji: "🚀",
  bgColor: "bg-indigo-950",
  accentColor: "text-indigo-400",
  borderColor: "border-indigo-500",
}
```

The slot picker and static routes update automatically — nothing else to change.

### New poker variant
1. Append an entry to `src/lib/pokerVariants.ts`
2. Create `src/app/games/poker/<id>/page.tsx` with the game logic

```ts
// pokerVariants.ts
{
  id: "texas-holdem",
  path: "/games/poker/texas-holdem",
  name: "Texas Hold'em",
  tagline: "2 hole cards, 5 community cards",
  previewEmoji: "♠",
  bgColor: "bg-slate-950",
  accentColor: "text-slate-400",
  borderColor: "border-slate-600",
}
```

---

## Hardware Reference

Recommended build for a tabletop cabinet:

- **Brain:** N100 Mini PC (runs full desktop OS, handles modern browser rendering well)
- **Display:** 15–24" touchscreen (HDMI + USB touch)
- **Buttons:** Arcade microswitches wired to a USB encoder board (I-PAC or Zero-Delay)
- **OS setup:** Auto-login → launch browser in kiosk mode pointing at `http://localhost:3000`
