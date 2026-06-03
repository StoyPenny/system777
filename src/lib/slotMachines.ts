/**
 * SLOT MACHINE REGISTRY
 *
 * To add a new slot machine, append an entry to SLOT_MACHINES.
 * No other files need to change — the picker and game pages read this array.
 */

export interface SlotMachineConfig {
  id: string;
  name: string;
  tagline: string;
  symbols: string[];
  /** Representative emoji shown on the picker card */
  previewEmoji: string;
  bgColor: string;
  accentColor: string;
  borderColor: string;
}

export const SLOT_MACHINES: SlotMachineConfig[] = [
  {
    id: "classic-fruits",
    name: "Classic Fruits",
    tagline: "The original one-armed bandit",
    symbols: ["🍒", "🍋", "🍊", "🍇", "🔔", "💎", "7️⃣"],
    previewEmoji: "🍒",
    bgColor: "bg-red-950",
    accentColor: "text-amber-400",
    borderColor: "border-amber-500",
  },
  {
    id: "cyber-neon",
    name: "Cyber Neon",
    tagline: "Hack the mainframe",
    symbols: ["🤖", "💾", "🌐", "⚡", "🔋", "🚀", "👑"],
    previewEmoji: "⚡",
    bgColor: "bg-slate-950",
    accentColor: "text-cyan-400",
    borderColor: "border-cyan-500",
  },
  {
    id: "pharaohs-gold",
    name: "Pharaohs Gold",
    tagline: "Ancient riches await",
    symbols: ["🏺", "🦂", "🐈", "👁️", "🦅", "👑", "🔱"],
    previewEmoji: "👑",
    bgColor: "bg-amber-950",
    accentColor: "text-yellow-400",
    borderColor: "border-yellow-600",
  },
  {
    id: "cocktail-hour",
    name: "Cocktail Hour",
    tagline: "Last round — bet it all",
    symbols: ["🍺", "🍷", "🍸", "🍹", "🥂", "🍾", "🥃"],
    previewEmoji: "🍹",
    bgColor: "bg-purple-950",
    accentColor: "text-pink-400",
    borderColor: "border-pink-500",
  },
  {
    id: "wild-safari",
    name: "Wild Safari",
    tagline: "Hunt the big five",
    symbols: ["🦁", "🐯", "🦊", "🐘", "🦒", "🦓", "🦏"],
    previewEmoji: "🦁",
    bgColor: "bg-green-950",
    accentColor: "text-lime-400",
    borderColor: "border-lime-600",
  },
];
