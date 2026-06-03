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

### Cards
| Game | Description |
|---|---|
| **Blackjack** | Hit, Stand, or Double vs the dealer. Dealer stands on soft 17. Pays 3:2. |
| **Baccarat** | Bet Player, Banker, or Tie. Cards dealt to both sides — closest to 9 wins. |
| **Video Poker** | Jacks or Better, 5-card draw. Hold cards and redraw. Royal Flush pays 800×. |
| **3-Card Poker** | Ante + Play vs the dealer. Dealer needs Q-high to qualify. |
| **Red Dog** | Two cards dealt — bet whether the next card falls between them. |
| **War** | Your card vs the dealer's. High card wins; tie goes to War. |
| **High Card** | Your card is revealed face-up — bet whether you or the dealer draws higher on the next card. |
| **Hi-Lo** | Predict if the next card in the deck is higher, lower, or the same. Odds adjust per card. |

### Dice & Numbers
| Game | Description |
|---|---|
| **Crown & Anchor** | Bet on one of 6 symbols. Three dice roll — pays out for each matching face shown. |
| **Yacht** | Five dice, three rolls. Build Yahtzee-style hands. Yacht (5-of-a-kind) pays 50×. |
| **Keno** | Pick up to 10 spots, then 20 balls draw. Paid on the number of catches. |
| **Bingo** | Mark off a 5×5 card as balls are called. Lines and full Blackout pay out. |

### Arcade
| Game | Description |
|---|---|
| **Slots** (5 machines) | Three-reel spinners in themed packs. Two of a kind = 2×, Jackpot = 10×. |
| **Mines** | Uncover tiles on a grid while avoiding hidden mines. Cash out before you hit one. |
| **Tower** | Climb a tower floor by floor. Each row has two safe tiles and one trap. |
| **Horses** | Five horses race down the track. Pick the winner before they're off. |

### Roulette
European single-zero wheel. Place multiple bets per spin across Red/Black (2×), Odd/Even (2×), Low/High (2×), Dozens (3×), and Green 0 (35×). Tracks recent results with a color history board.

### Slot Machines
| Machine | Theme |
|---|---|
| Classic Fruits | 🍒 The original one-armed bandit |
| Cyber Neon | ⚡ Hack the mainframe |
| Pharaohs Gold | 👑 Ancient riches await |
| Cocktail Hour | 🍹 Last round — bet it all |
| Wild Safari | 🦁 Hunt the big five |

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
| Key | Slots | Video Poker | 3-Card Poker | Roulette | Blackjack | Most others |
|---|---|---|---|---|---|---|
| `Space` | Spin | Deal / Draw | Deal | Spin | Deal | Deal / Confirm |
| `1`–`5` | — | Hold card 1–5 | Fold / Play | — | Hit / Stand / Double | Game action |
| `1`–`7` | — | — | — | Select chip | — | — |
| `C` / `0` | — | — | — | Clear bets | — | — |
| `Esc` | Slot picker | Poker menu | Poker menu | Lobby | Lobby | Lobby |

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
│       ├── slots/[id]/             # Slot machines (5 themed machines)
│       ├── poker/
│       │   ├── video-poker/        # Jacks or Better
│       │   └── three-card/         # 3-Card Poker vs dealer
│       ├── blackjack/
│       ├── baccarat/
│       ├── roulette/
│       ├── reddog/
│       ├── war/
│       ├── highcard/
│       ├── hilo/
│       ├── crownanchor/
│       ├── yacht/
│       ├── keno/
│       ├── bingo/
│       ├── mines/
│       ├── tower/
│       └── horses/
├── components/
│   ├── BalanceBar.tsx              # Fixed top bar with credits + logout
│   ├── BetSelector.tsx             # Chip stack bet input
│   ├── PinPad.tsx                  # 4-digit PIN entry
│   └── WinEffect.tsx               # Per-game particle win animations
├── lib/
│   ├── slotMachines.ts             # Slot machine configs (add new machines here)
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
