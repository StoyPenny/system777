/**
 * POKER VARIANT REGISTRY
 *
 * To add a new poker variant:
 *   1. Add an entry here.
 *   2. Create src/app/games/poker/<id>/page.tsx with the game logic.
 * The picker page reads this array — nothing else needs to change.
 */

export interface PokerVariantConfig {
  id: string;
  /** App-router path for the game */
  path: string;
  name: string;
  tagline: string;
  previewEmoji: string;
  bgColor: string;
  accentColor: string;
  borderColor: string;
}

export const POKER_VARIANTS: PokerVariantConfig[] = [
  {
    id: "video-poker",
    path: "/games/poker/video-poker",
    name: "Video Poker",
    tagline: "Jacks or Better — 5-card draw",
    previewEmoji: "🃏",
    bgColor: "bg-green-950",
    accentColor: "text-green-400",
    borderColor: "border-green-600",
  },
  {
    id: "three-card",
    path: "/games/poker/three-card",
    name: "3-Card Poker",
    tagline: "Beat the dealer — Mini Royal pays 5×",
    previewEmoji: "♣",
    bgColor: "bg-teal-950",
    accentColor: "text-teal-400",
    borderColor: "border-teal-600",
  },
];
