export interface UserProfile {
  id: number;
  username: string;
  balance: number;
}

export interface GameTheme {
  id: string;
  name: string;
  symbols: string[];
  bgColor: string;
  accentColor: string;
  borderColor: string;
}

export type GameType = "slots" | "poker" | "roulette";

export interface PokerCard {
  suit: "♠" | "♥" | "♦" | "♣";
  value: string;
  numericValue: number;
}

export type RouletteColor = "red" | "black" | "green";

export interface RouletteNumber {
  number: number;
  color: RouletteColor;
}
