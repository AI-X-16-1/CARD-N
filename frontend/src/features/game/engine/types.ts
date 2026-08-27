export type JobClass = 'dev' | 'design' | 'hr' | 'finance' | 'legal' | 'marketing' | 'sales' | 'pm';

export interface Stats {
  atk: number;
  def: number;
  int: number;
  hp: number;
}

export interface Skill {
  name: string;
  cost: number;
  description: string;
}

export interface BattleCard {
  id: number;
  personId: number;
  name: string;
  company: string;
  jobClass: JobClass;
  jobLabel: string;
  grade: number; // star rating, 1-6
  cost: number;
  baseStats: Stats;
  finalStats: Stats; // floor(baseStats * grade multiplier)
  skill: Skill;
  passive: string;
  flavorText: string;
  illustrationUrl?: string | null; // generated card art (ComfyUI/Krea2); null until produced

  // Runtime-only fields, set once the card is placed on a battle field.
  // Absent while the card is only in a deck or hand.
  currentHp?: number;
  buffs?: Partial<Stats>; // permanent buffs from skills (e.g. Austerity Budget, Campaign)
  hasActed?: boolean; // has attacked or used its skill this turn
  justPlayed?: boolean; // played this turn, cannot attack yet ("commute time")
}

export type EffectiveStats = Stats;

export interface Synergy {
  name: string;
  description: string;
}

// Structured record of what happened during a single state transition, for
// UIs that want to animate individual actions (in particular the AI's, since
// endTurn() resolves its whole turn atomically and returns only the final
// state — this is how the caller finds out what the AI actually did).
export type BattleEvent =
  | { type: 'draw'; who: 'me' | 'enemy'; cardId: number }
  | { type: 'play'; who: 'me' | 'enemy'; cardId: number; slot: number }
  | {
      type: 'attack';
      who: 'me' | 'enemy';
      attackerSlot: number;
      target: number | 'hero';
      // Resulting values right after this specific attack resolves, so a UI
      // can apply them the instant its animation lands instead of waiting
      // for the rest of the (possibly multi-attack) turn to finish.
      myHp: number;
      eHp: number;
      attackerHp: number | null; // null = the attacker died to counter-damage
      targetHp: number | null; // null = the target died (or target === 'hero')
    };

export interface BattleState {
  deck: BattleCard[];
  hand: BattleCard[];
  field: (BattleCard | null)[]; // length 5
  cost: number;
  maxCost: number;
  myHp: number;

  eDeck: BattleCard[];
  eHand: BattleCard[];
  eField: (BattleCard | null)[]; // length 5
  eMaxCost: number;
  eHp: number;

  turnN: number;
  log: string[];
  over: 'victory' | 'defeat' | null;
  selectedFieldIdx: number | null;

  // Events produced by the call that returned this state (empty/absent for
  // states that weren't just returned from an action, e.g. test fixtures).
  turnEvents?: BattleEvent[];
}
