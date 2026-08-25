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
}
