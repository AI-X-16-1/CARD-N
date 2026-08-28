import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, typography } from '@/shared/theme';
import { JOB_COLOR, PASSIVE_INFO, SYNERGY_INFO } from '@/features/game/constants';
import { CardArt } from '@/features/game/components/CardArt';
import { CardDetailPanel } from '@/features/game/components/CardDetailPanel';
import { StatRow } from '@/features/game/components/StatRow';
import { attack, calcEffStats, checkSynergies, endTurn, initBattle, playCard, useSkill } from '@/features/game/engine/battle';
import { createStarterDeck } from '@/features/game/engine/starterDeck';
import type { BattleCard, BattleEvent, BattleState, Synergy } from '@/features/game/engine/types';

type Rect = { x: number; y: number; w: number; h: number };

// Distance a card must travel (from center to center) before its edge meets
// the target's, plus a deliberate overlap so the collision is unambiguous —
// shared by the player's own attack bump and the mirrored AI one below.
function computeBumpPoint(from: Rect, to: Rect): { x: number; y: number } {
  const acx = from.x + from.w / 2;
  const acy = from.y + from.h / 2;
  const bcx = to.x + to.w / 2;
  const bcy = to.y + to.h / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const reach = (halfW: number, halfH: number) =>
    Math.min(Math.abs(ux) > 1e-6 ? halfW / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? halfH / Math.abs(uy) : Infinity);
  const halfA = reach(from.w / 2, from.h / 2);
  const halfB = reach(to.w / 2, to.h / 2);
  const overlap = Math.min(from.w, to.w) * 0.6;
  const travel = Math.max(0, dist - halfA - halfB + overlap);
  return { x: from.x + ux * travel, y: from.y + uy * travel };
}

type GhostMotion =
  | { kind: 'move'; to: Rect; duration: number; easing?: (v: number) => number }
  | { kind: 'bump'; to: { x: number; y: number }; outDuration: number; backDuration: number };

// One-shot animated card used to replay a single turnEvent (draw/play/attack)
// for whichever side didn't trigger it directly through the UI — in
// practice, the AI's turn. Each instance owns its animation and unmounts
// itself via onDone when finished, so several can play in sequence just by
// swapping which one is rendered. onImpact (optional) fires when the card's
// effect should actually land — immediately for a 'move' (nothing happens
// after arrival), but at the *outbound* half of a 'bump', before the return
// trip, so callers can apply real-time results (HP, etc.) right on impact.
function ActionGhost({
  card,
  faceDown,
  from,
  motion,
  onImpact,
  onDone,
}: {
  card: BattleCard | null;
  faceDown?: boolean;
  from: Rect;
  motion: GhostMotion;
  onImpact?: () => void;
  onDone: () => void;
}) {
  const x = useSharedValue(from.x);
  const y = useSharedValue(from.y);
  const w = useSharedValue(from.w);
  const h = useSharedValue(from.h);
  const opacity = useSharedValue(motion.kind === 'move' ? 0 : 1);
  // Dedicated 0->1 lifecycle driver. The ghost's onImpact/onDone must NOT be
  // gated on one of the geometry channels (x/y/w/h): a draw into the hand
  // keeps the card at hand-card size for the whole trip, so its w/h delta is
  // 0, and reanimated-web resolves a zero-delta withTiming on the same frame
  // — which unmounted the ghost (~5ms) before x/y ever moved. progress always
  // has a real 0->1 delta, so it runs the full duration.
  const progress = useSharedValue(0);

  useEffect(() => {
    if (motion.kind === 'move') {
      opacity.value = withTiming(1, { duration: 80 });
      const cfg = { duration: motion.duration, easing: motion.easing ?? Easing.out(Easing.cubic) };
      x.value = withTiming(motion.to.x, cfg);
      y.value = withTiming(motion.to.y, cfg);
      w.value = withTiming(motion.to.w, cfg);
      h.value = withTiming(motion.to.h, cfg);
      progress.value = withTiming(1, cfg, (finished) => {
        if (!finished) return;
        if (onImpact) runOnJS(onImpact)();
        runOnJS(onDone)();
      });
    } else {
      const outCfg = { duration: motion.outDuration, easing: Easing.out(Easing.quad) };
      const backCfg = { duration: motion.backDuration, easing: Easing.in(Easing.quad) };
      x.value = withSequence(withTiming(motion.to.x, outCfg), withTiming(from.x, backCfg));
      y.value = withSequence(
        withTiming(motion.to.y, outCfg, (finished) => {
          if (finished && onImpact) runOnJS(onImpact)();
        }),
        withTiming(from.y, backCfg, (finished) => {
          if (finished) runOnJS(onDone)();
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.flyingCard, { borderColor: !faceDown && card ? JOB_COLOR[card.jobClass] : colors.borderMedium }, style]}
    >
      {faceDown || !card ? (
        <Text style={styles.cardBackMark}>◆</Text>
      ) : (
        <>
          <CardArt uri={card.illustrationUrl} variant="tile" />
          <Text style={styles.cardName} numberOfLines={1}>
            ★{card.grade} {card.name}
          </Text>
        </>
      )}
    </Animated.View>
  );
}

type Props = {
  initialDeck?: BattleCard[];
  onExit?: () => void;
};

function isReady(card: BattleCard): boolean {
  return !card.hasActed && (!card.justPlayed || card.grade === 1);
}

const HAND_CARD_WIDTH = 84;
const HAND_FAN_SPAN = 340; // usable width budget so up to 7 cards fit in one row
const HAND_FAN_ANGLE = 6; // degrees of rotation per card away from center
const HAND_FAN_CURVE = 5; // px of vertical drop per (offset from center)^2
const HAND_FAN_LIFT = 28; // px the selected card rises above the rest of the fan

// Overlapping, arced "held in hand" layout — like Hearthstone/Slay the
// Spire — instead of wrapping to a second row once the hand grows past ~4
// cards. Overlap only kicks in once cards stop fitting side by side.
// The selected card is un-rotated, lifted, and brought to the front so its
// full info is readable above its overlapping neighbors.
function fanCardStyle(i: number, n: number, selected: boolean) {
  const step = n > 1 ? Math.min(HAND_CARD_WIDTH + 8, (HAND_FAN_SPAN - HAND_CARD_WIDTH) / (n - 1)) : 0;
  const offset = i - (n - 1) / 2;
  const baseY = offset * offset * HAND_FAN_CURVE;
  return {
    marginLeft: i === 0 ? 0 : step - HAND_CARD_WIDTH,
    zIndex: selected ? 100 : i,
    transform: [
      { translateY: selected ? baseY - HAND_FAN_LIFT : baseY },
      { rotate: selected ? '0deg' : `${offset * HAND_FAN_ANGLE}deg` },
    ],
  };
}

export default function BattleScreen({ initialDeck, onExit }: Props) {
  // Coming from the Deck Builder means a deck was already chosen, so start
  // immediately instead of making the player tap "새 배틀 시작" a second time.
  const [state, setState] = useState<BattleState | null>(() => (initialDeck ? initBattle(initialDeck) : null));
  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [selectedAttackerIdx, setSelectedAttackerIdx] = useState<number | null>(null);
  // A card tapped only to read its skill/passive in the action bar — an enemy
  // card, or one of mine that can't act yet ("출근 중"). Not an attacker.
  const [inspect, setInspect] = useState<{ side: 'me' | 'enemy'; idx: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewingCard, setViewingCard] = useState<{ card: BattleCard; mine: boolean } | null>(null);

  // Root of the animated overlays' positioning context. Coordinates from
  // measureInWindow() are window-absolute, but the overlays render inside
  // this View — so every measured position must be offset by this View's
  // own window position before being used as left/top (it isn't at (0,0)
  // once something like the web phone-frame wrapper offsets the screen).
  const rootRef = useRef<View | null>(null);

  // Hearthstone-style "flies from hand to the target slot" placement animation.
  const [flying, setFlying] = useState<{ card: BattleCard; handIdx: number } | null>(null);
  const handRefs = useRef<Record<number, View | null>>({});
  const fieldRefs = useRef<Record<number, View | null>>({});
  const flyX = useSharedValue(0);
  const flyY = useSharedValue(0);
  const flyW = useSharedValue(0);
  const flyH = useSharedValue(0);
  const flyOpacity = useSharedValue(0);
  const flyingStyle = useAnimatedStyle(() => ({
    left: flyX.value,
    top: flyY.value,
    width: flyW.value,
    height: flyH.value,
    opacity: flyOpacity.value,
  }));

  // Hearthstone-style "bumps into the target once, then returns" attack animation.
  const [attacking, setAttacking] = useState<{ card: BattleCard; myIdx: number } | null>(null);
  const enemyFieldRefs = useRef<Record<number, View | null>>({});
  const enemyHeroRef = useRef<View | null>(null);
  const atkX = useSharedValue(0);
  const atkY = useSharedValue(0);
  const atkW = useSharedValue(0);
  const atkH = useSharedValue(0);
  const atkOpacity = useSharedValue(0);
  const atkStyle = useAnimatedStyle(() => ({
    left: atkX.value,
    top: atkY.value,
    width: atkW.value,
    height: atkH.value,
    opacity: atkOpacity.value,
  }));

  // Replays the AI's turn (and my own skill/turn draws) one event at a time
  // using turnEvents from the engine, mirroring the placement/attack
  // animations above in the opposite direction. The board only updates once
  // the whole sequence finishes playing.
  const [ghost, setGhost] = useState<{
    id: number;
    card: BattleCard | null;
    faceDown?: boolean;
    from: Rect;
    motion: GhostMotion;
    onImpact?: () => void;
    onDone: () => void;
  } | null>(null);
  const ghostIdRef = useRef(0);
  // Guards against a stray callback from an already-unmounted ghost (the one
  // whose lethal impact just ended the game) resuming the event queue.
  const turnStoppedRef = useRef(false);
  const myHeroRef = useRef<View | null>(null);
  const handRowRef = useRef<View | null>(null);
  const enemyHandRowRef = useRef<View | null>(null);

  // Tap-to-reveal tooltip for an active synergy pill (either side). Positioned
  // absolutely in the root overlay layer so it never grows the board; a
  // full-screen backdrop dismisses it on any outside tap.
  const [synergyTip, setSynergyTip] = useState<{ synergy: Synergy; x: number; y: number } | null>(null);

  function showSynergyTip(s: Synergy, el: View | null) {
    const rootEl = rootRef.current;
    if (!el || !rootEl) return;
    rootEl.measureInWindow((rx, ry, rw) => {
      el.measureInWindow((x, y, _w, h) => {
        const tipW = 220;
        const left = Math.max(8, Math.min(x - rx, rw - tipW - 8));
        setSynergyTip((prev) =>
          prev && prev.synergy.name === s.name ? null : { synergy: s, x: left, y: y - ry + h + 6 },
        );
      });
    });
  }

  function startBattle() {
    setState(initBattle(initialDeck ?? createStarterDeck()));
    setSelectedHandIdx(null);
    setSelectedAttackerIdx(null);
    setInspect(null);
    setErrorMsg(null);
    setViewingCard(null);
    setFlying(null);
    setAttacking(null);
    setGhost(null);
    setSynergyTip(null);
    turnStoppedRef.current = false;
  }

  function openDetail(card: BattleCard, mine: boolean) {
    setViewingCard({ card, mine });
  }

  function run(fn: (s: BattleState) => BattleState) {
    if (!state) return;
    try {
      setState(fn(state));
      setSelectedHandIdx(null);
      setSelectedAttackerIdx(null);
      setInspect(null);
      setErrorMsg(null);
      setSynergyTip(null);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  function tapHand(idx: number) {
    setErrorMsg(null);
    setSelectedAttackerIdx(null);
    setInspect(null);
    setSelectedHandIdx((prev) => (prev === idx ? null : idx));
  }

  function tapMySlot(idx: number, card: BattleCard | null) {
    if (card) {
      setErrorMsg(null);
      setSelectedHandIdx(null);
      if (!isReady(card)) {
        // Can't act yet ("출근 중") or already acted — inspect its skill/passive only.
        setSelectedAttackerIdx(null);
        setInspect((prev) => (prev?.side === 'me' && prev.idx === idx ? null : { side: 'me', idx }));
        return;
      }
      setInspect(null);
      setSelectedAttackerIdx((prev) => (prev === idx ? null : idx));
      return;
    }
    if (selectedHandIdx !== null) playCardWithFlight(selectedHandIdx, idx);
  }

  function playCardWithFlight(handIdx: number, slotIdx: number) {
    if (!state) return;
    const card = state.hand[handIdx];
    const handEl = handRefs.current[handIdx];
    const slotEl = fieldRefs.current[slotIdx];
    const rootEl = rootRef.current;
    setSelectedHandIdx(null);

    if (!card || !handEl || !slotEl || !rootEl) {
      run((s) => playCard(s, handIdx, slotIdx));
      return;
    }

    rootEl.measureInWindow((rx, ry) => {
      handEl.measureInWindow((hx, hy, hw, hh) => {
        slotEl.measureInWindow((sx, sy, sw, sh) => {
          flyX.value = hx - rx;
          flyY.value = hy - ry;
          flyW.value = hw;
          flyH.value = hh;
          flyOpacity.value = 1;
          setFlying({ card, handIdx });

          const config = { duration: 320, easing: Easing.out(Easing.cubic) };
          flyX.value = withTiming(sx - rx, config);
          flyY.value = withTiming(sy - ry, config);
          flyW.value = withTiming(sw, config);
          flyH.value = withTiming(sh, config, (finished) => {
            if (finished) runOnJS(commitPlay)(handIdx, slotIdx);
          });
        });
      });
    });
  }

  function commitPlay(handIdx: number, slotIdx: number) {
    setFlying(null);
    run((s) => playCard(s, handIdx, slotIdx));
  }

  function tapEnemySlot(idx: number, card: BattleCard | null) {
    if (selectedAttackerIdx !== null) {
      attackWithBump(selectedAttackerIdx, idx);
      return;
    }
    // No attacker selected — tap an enemy card to read its skill/passive.
    if (card) {
      setInspect((prev) => (prev?.side === 'enemy' && prev.idx === idx ? null : { side: 'enemy', idx }));
    }
  }

  function tapEnemyHero() {
    if (selectedAttackerIdx !== null) attackWithBump(selectedAttackerIdx, 'hero');
  }

  function attackWithBump(myIdx: number, target: number | 'hero') {
    if (!state) return;
    const attacker = state.field[myIdx];
    const myEl = fieldRefs.current[myIdx];
    const targetEl = target === 'hero' ? enemyHeroRef.current : enemyFieldRefs.current[target];
    const rootEl = rootRef.current;

    if (!attacker || !myEl || !targetEl || !rootEl) {
      run((s) => attack(s, myIdx, target));
      return;
    }

    rootEl.measureInWindow((rx, ry) => {
      myEl.measureInWindow((ax0, ay0, aw, ah) => {
        targetEl.measureInWindow((bx0, by0, bw, bh) => {
          const from: Rect = { x: ax0 - rx, y: ay0 - ry, w: aw, h: ah };
          const to: Rect = { x: bx0 - rx, y: by0 - ry, w: bw, h: bh };
          const bump = computeBumpPoint(from, to);

          atkX.value = from.x;
          atkY.value = from.y;
          atkW.value = from.w;
          atkH.value = from.h;
          atkOpacity.value = 1;
          setAttacking({ card: attacker, myIdx });

          const outCfg = { duration: 150, easing: Easing.out(Easing.quad) };
          const backCfg = { duration: 150, easing: Easing.in(Easing.quad) };
          atkX.value = withSequence(withTiming(bump.x, outCfg), withTiming(from.x, backCfg));
          atkY.value = withSequence(
            withTiming(bump.y, outCfg),
            withTiming(from.y, backCfg, (finished) => {
              if (finished) runOnJS(commitAttack)(myIdx, target);
            }),
          );
        });
      });
    });
  }

  function commitAttack(myIdx: number, target: number | 'hero') {
    setAttacking(null);
    run((s) => attack(s, myIdx, target));
  }

  function useSkillOnSelected() {
    if (selectedAttackerIdx !== null) runWithEvents(() => useSkill(state!, selectedAttackerIdx));
  }

  // --- AI turn / event replay --------------------------------------------

  function measureRelative(el: View, cb: (r: Rect) => void) {
    const rootEl = rootRef.current;
    if (!rootEl) return;
    rootEl.measureInWindow((rx, ry) => {
      el.measureInWindow((x, y, w, h) => cb({ x: x - rx, y: y - ry, w, h }));
    });
  }

  function cardBoxAt(rect: Rect, w: number, h: number): Rect {
    return { x: rect.x, y: rect.y, w, h };
  }

  function runEndTurn() {
    if (!state) return;
    runWithEvents(() => endTurn(state));
  }

  function runWithEvents(computeNext: () => BattleState) {
    if (!state) return;
    let next: BattleState;
    try {
      next = computeNext();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      return;
    }
    setErrorMsg(null);
    setSelectedHandIdx(null);
    setSelectedAttackerIdx(null);
    setInspect(null);
    setSynergyTip(null);
    turnStoppedRef.current = false;
    playEventQueue(next.turnEvents ?? [], 0, next);
  }

  function playEventQueue(events: BattleEvent[], i: number, next: BattleState) {
    if (turnStoppedRef.current) return;
    if (i >= events.length) {
      setGhost(null);
      setState(next);
      return;
    }
    const done = () => playEventQueue(events, i + 1, next);
    if (!animateEvent(events[i], next, done)) done();
  }

  // Applies one attack's result (HP, the attacker's/target's currentHp, or
  // their removal) directly to the live board the instant it lands, instead
  // of waiting for the rest of the turn's animations. Returns true if this
  // was lethal, so the caller can end the game right there rather than
  // waiting for every remaining queued animation to finish first.
  function applyAttackImpact(ev: Extract<BattleEvent, { type: 'attack' }>): boolean {
    setState((prev) => {
      if (!prev) return prev;
      const patched: BattleState = { ...prev };

      const attackerField = ev.who === 'enemy' ? [...prev.eField] : [...prev.field];
      const attackerCard = attackerField[ev.attackerSlot];
      attackerField[ev.attackerSlot] =
        ev.attackerHp === null || !attackerCard ? null : { ...attackerCard, currentHp: ev.attackerHp, hasActed: true };
      if (ev.who === 'enemy') patched.eField = attackerField;
      else patched.field = attackerField;

      if (ev.target !== 'hero') {
        const targetField = ev.who === 'enemy' ? [...prev.field] : [...prev.eField];
        const targetCard = targetField[ev.target];
        targetField[ev.target] = ev.targetHp === null || !targetCard ? null : { ...targetCard, currentHp: ev.targetHp };
        if (ev.who === 'enemy') patched.field = targetField;
        else patched.eField = targetField;
      }

      patched.myHp = ev.myHp;
      patched.eHp = ev.eHp;
      if (ev.myHp <= 0) patched.over = 'defeat';
      else if (ev.eHp <= 0) patched.over = 'victory';

      return patched;
    });
    return ev.myHp <= 0 || ev.eHp <= 0;
  }

  // Places the card the instant its "play" ghost lands, so the field slot
  // doesn't sit visibly empty again for the rest of the turn's animations.
  function applyPlayImpact(ev: Extract<BattleEvent, { type: 'play' }>, next: BattleState) {
    setState((prev) => {
      if (!prev) return prev;
      if (ev.who === 'enemy') {
        const eField = [...prev.eField];
        eField[ev.slot] = next.eField[ev.slot];
        return { ...prev, eField, eHand: prev.eHand.filter((c) => c.id !== ev.cardId) };
      }
      const field = [...prev.field];
      field[ev.slot] = next.field[ev.slot];
      return { ...prev, field, hand: prev.hand.filter((c) => c.id !== ev.cardId) };
    });
  }

  // Returns false (and does nothing) when a required ref/position isn't
  // available, so the caller can just skip straight to the next event.
  function animateEvent(ev: BattleEvent, next: BattleState, onDone: () => void): boolean {
    if (ev.type === 'draw') {
      const destEl = ev.who === 'me' ? handRowRef.current : enemyHandRowRef.current;
      const rootEl = rootRef.current;
      if (!destEl || !rootEl) return false;

      if (ev.who === 'me') {
        // Enters from my own hero row (the deck label), mirroring the enemy
        // draw below — just face-up and at hand-card size. The travel is
        // mostly vertical: hero row -> down past the skill button -> hand.
        const sourceEl = myHeroRef.current;
        if (!sourceEl) return false;
        const size = { w: HAND_CARD_WIDTH, h: HAND_CARD_WIDTH / 0.65 };
        measureRelative(sourceEl, (src) => {
          measureRelative(destEl, (row) => {
            const from: Rect = {
              x: src.x + src.w / 2 - size.w / 2,
              y: src.y,
              w: size.w,
              h: size.h,
            };
            // The freshly drawn card is appended to the right end of the
            // fanned hand, so land the ghost there — not at the hand row's
            // left edge (row.x), which is where it visibly stopped before.
            const to: Rect = {
              x: row.x + Math.max(0, row.w - size.w),
              y: row.y,
              w: size.w,
              h: size.h,
            };
            const card = next.hand.find((c) => c.id === ev.cardId) ?? null;
            setGhost({
              id: ghostIdRef.current++,
              card,
              faceDown: false,
              from,
              motion: { kind: 'move', to, duration: 600 },
              onDone,
            });
          });
        });
        return true;
      }

      const sourceEl = enemyHeroRef.current;
      if (!sourceEl) return false;
      measureRelative(sourceEl, (from) => {
        measureRelative(destEl, (to) => {
          setGhost({
            id: ghostIdRef.current++,
            card: null,
            faceDown: true,
            from,
            motion: { kind: 'move', to: cardBoxAt(to, 28, 40), duration: 260 },
            onDone,
          });
        });
      });
      return true;
    }

    if (ev.type === 'play') {
      const sourceEl = ev.who === 'enemy' ? enemyHandRowRef.current : handRowRef.current;
      const destEl = ev.who === 'enemy' ? enemyFieldRefs.current[ev.slot] : fieldRefs.current[ev.slot];
      if (!sourceEl || !destEl) return false;
      const card = (ev.who === 'enemy' ? next.eField[ev.slot] : next.field[ev.slot]) ?? null;
      measureRelative(sourceEl, (from) => {
        measureRelative(destEl, (to) => {
          setGhost({
            id: ghostIdRef.current++,
            card,
            faceDown: false,
            from: ev.who === 'enemy' ? cardBoxAt(from, 28, 40) : from,
            motion: { kind: 'move', to, duration: 300 },
            onImpact: () => applyPlayImpact(ev, next),
            onDone,
          });
        });
      });
      return true;
    }

    // attack
    const attackerEl = ev.who === 'enemy' ? enemyFieldRefs.current[ev.attackerSlot] : fieldRefs.current[ev.attackerSlot];
    const targetEl =
      ev.target === 'hero'
        ? ev.who === 'enemy'
          ? myHeroRef.current
          : enemyHeroRef.current
        : ev.who === 'enemy'
          ? fieldRefs.current[ev.target]
          : enemyFieldRefs.current[ev.target];
    if (!attackerEl || !targetEl) return false;
    // Prefer the post-turn state, but fall back to the pre-turn snapshot in
    // case this attacker died to counter-damage later in the same turn.
    const card =
      (ev.who === 'enemy'
        ? (next.eField[ev.attackerSlot] ?? state?.eField[ev.attackerSlot])
        : (next.field[ev.attackerSlot] ?? state?.field[ev.attackerSlot])) ?? null;
    measureRelative(attackerEl, (from) => {
      measureRelative(targetEl, (to) => {
        const bump = computeBumpPoint(from, to);
        // The AI's attacks read as too fast at the player's own 150/150 —
        // slow them to half speed. Mine stays snappy since that wasn't the complaint.
        const speed = ev.who === 'enemy' ? { outDuration: 300, backDuration: 300 } : { outDuration: 150, backDuration: 150 };
        setGhost({
          id: ghostIdRef.current++,
          card,
          faceDown: false,
          from,
          motion: { kind: 'bump', to: bump, ...speed },
          onImpact: () => {
            const lethal = applyAttackImpact(ev);
            if (lethal) {
              turnStoppedRef.current = true;
              setGhost(null); // end right here — don't wait for the return trip or any queued events after it
            }
          },
          onDone,
        });
      });
    });
    return true;
  }

  if (!state) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.title}>명함 배틀</Text>
          <Pressable style={styles.primaryButton} onPress={startBattle}>
            <Text style={styles.buttonText}>새 배틀 시작</Text>
          </Pressable>
          {onExit && (
            <Pressable onPress={onExit}>
              <Text style={styles.resetLink}>덱 빌더로 돌아가기</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const mySynergies = checkSynergies(state.field.filter((c): c is BattleCard => c !== null));
  const eSynergies = checkSynergies(state.eField.filter((c): c is BattleCard => c !== null));
  // The action bar shows for a selected field OR hand card; the skill is only
  // actually usable from a card already on the field.
  const selectedFieldCard = selectedAttackerIdx !== null ? state.field[selectedAttackerIdx] : null;
  const selectedHandCard = selectedHandIdx !== null ? state.hand[selectedHandIdx] : null;
  const inspectedCard =
    inspect?.side === 'me'
      ? state.field[inspect.idx]
      : inspect?.side === 'enemy'
        ? state.eField[inspect.idx]
        : null;
  const selectedCard = selectedFieldCard ?? selectedHandCard ?? inspectedCard ?? null;
  const canUseSkill =
    !!selectedFieldCard && !selectedFieldCard.hasActed && state.cost >= selectedFieldCard.skill.cost;

  return (
    <View style={styles.root} ref={rootRef}>
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.metaText}>턴 {state.turnN}</Text>
          <View style={styles.topRowLinks}>
            {onExit && (
              <Pressable onPress={onExit}>
                <Text style={styles.resetLink}>덱 빌더로</Text>
              </Pressable>
            )}
            <Pressable onPress={startBattle}>
              <Text style={styles.resetLink}>다시 시작</Text>
            </Pressable>
          </View>
        </View>

        {errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <HeroRow
          label="상대"
          hp={state.eHp}
          deckCount={state.eDeck.length}
          handCount={state.eHand.length}
          maxCost={state.eMaxCost}
          onPress={tapEnemyHero}
          registerRef={(el) => {
            enemyHeroRef.current = el;
          }}
        />
        <EnemyHandBackRow
          count={state.eHand.length}
          registerRef={(el) => {
            enemyHandRowRef.current = el;
          }}
        />
        <SynergyRow synergies={eSynergies} onPressPill={showSynergyTip} />
        <FieldRow
          cards={state.eField}
          mine={false}
          synergies={eSynergies}
          canTarget={selectedAttackerIdx !== null}
          inspectedIdx={inspect?.side === 'enemy' ? inspect.idx : null}
          onPressSlot={tapEnemySlot}
          onInfoPress={(card) => openDetail(card, false)}
          registerSlotRef={(idx, el) => {
            enemyFieldRefs.current[idx] = el;
          }}
        />

        {/* End Turn lives here — between the two fields, right-aligned — so it
            stays on screen on a phone instead of being buried below the hand. */}
        <View style={styles.midBar}>
          <View style={styles.midHints}>
            <Text style={styles.hintText}>
              {selectedHandIdx !== null && '빈 자리를 탭해서 카드를 배치하세요'}
              {selectedAttackerIdx !== null && '상대 카드나 히어로를 탭해서 공격, 또는 스킬 사용'}
              {selectedHandIdx === null && selectedAttackerIdx === null && '핸드 카드나 내 필드 카드를 탭하세요'}
            </Text>
            <Text style={styles.hintText}>카드를 길게 누르면 상세정보를 볼 수 있어요</Text>
          </View>
          <Pressable style={styles.endTurnMini} onPress={runEndTurn}>
            <Text style={styles.endTurnMiniText}>턴 종료</Text>
          </Pressable>
        </View>

        <FieldRow
          cards={state.field}
          mine
          synergies={mySynergies}
          selectedIdx={selectedAttackerIdx}
          inspectedIdx={inspect?.side === 'me' ? inspect.idx : null}
          hiddenIdx={attacking?.myIdx ?? null}
          onPressSlot={tapMySlot}
          onInfoPress={(card) => openDetail(card, true)}
          registerSlotRef={(idx, el) => {
            fieldRefs.current[idx] = el;
          }}
        />
        <SynergyRow synergies={mySynergies} onPressPill={showSynergyTip} />
        <HeroRow
          label="나"
          hp={state.myHp}
          deckCount={state.deck.length}
          handCount={state.hand.length}
          maxCost={state.maxCost}
          cost={state.cost}
          registerRef={(el) => {
            myHeroRef.current = el;
          }}
        />

        {/* Fixed-height action area (opacity-hidden when nothing's selected) so
            the hand/end-turn button below never shifts. Skill button on top,
            passive effect underneath. */}
        <View style={[styles.actionBar, !selectedCard && styles.actionBarHidden]}>
          <Pressable
            style={[styles.skillButton, selectedCard && !canUseSkill && styles.disabledButton]}
            onPress={useSkillOnSelected}
            disabled={!canUseSkill}
          >
            <Text style={styles.buttonText}>
              {selectedCard
                ? `${selectedCard.skill.name}${canUseSkill ? ' 사용' : ''} (cost ${selectedCard.skill.cost})`
                : ' '}
            </Text>
            <Text style={styles.skillDesc} numberOfLines={1}>
              {selectedCard ? selectedCard.skill.description : ' '}
            </Text>
          </Pressable>
          <Text style={styles.passiveLine} numberOfLines={2}>
            {selectedCard
              ? `패시브 · ${PASSIVE_INFO[selectedCard.jobClass].name} — ${PASSIVE_INFO[selectedCard.jobClass].effect}`
              : ' '}
          </Text>
        </View>

        <View style={styles.handRow} ref={handRowRef}>
          {state.hand.map((card, i) => (
            <Pressable
              key={`${card.id}-${i}`}
              ref={(el) => {
                handRefs.current[i] = el;
              }}
              onPress={() => tapHand(i)}
              onLongPress={() => openDetail(card, true)}
              style={[
                styles.handCard,
                { borderTopColor: JOB_COLOR[card.jobClass] },
                card.cost > state.cost && styles.unaffordable,
                selectedHandIdx === i && styles.selectedSlot,
                flying?.handIdx === i && styles.hiddenCard,
                fanCardStyle(i, state.hand.length, selectedHandIdx === i),
              ]}
            >
              <CardArt uri={card.illustrationUrl} variant="tile" />
              <Text style={styles.costBadge}>{card.cost}</Text>
              <Text style={styles.cardName}>
                ★{card.grade} {card.name}
              </Text>
              <StatRow stats={card.finalStats} size="md" />
            </Pressable>
          ))}
        </View>

        <View style={styles.logBox}>
          {state.log.slice(-6).map((line, i) => (
            <Text key={i} style={styles.logText}>
              {line}
            </Text>
          ))}
        </View>
      </ScrollView>

      {state.over && (
        <View style={styles.overlay}>
          <Text style={[styles.overlayTitle, state.over === 'victory' ? styles.victoryText : styles.defeatText]}>
            {state.over === 'victory' ? 'VICTORY' : 'DEFEAT'}
          </Text>
          <Pressable style={styles.primaryButton} onPress={startBattle}>
            <Text style={styles.buttonText}>다시 대전</Text>
          </Pressable>
          {onExit && (
            <Pressable onPress={onExit}>
              <Text style={styles.resetLink}>덱 빌더로 돌아가기</Text>
            </Pressable>
          )}
        </View>
      )}

      {viewingCard && (
        <Pressable style={styles.detailBackdrop} onPress={() => setViewingCard(null)}>
          <Pressable
            style={[styles.detailCard, { borderColor: JOB_COLOR[viewingCard.card.jobClass] }]}
            onPress={() => {}}
          >
            <Pressable style={styles.detailCloseBadge} hitSlop={8} onPress={() => setViewingCard(null)}>
              <Text style={styles.detailCloseText}>✕</Text>
            </Pressable>
            <CardDetailPanel
              card={viewingCard.card}
              effStats={calcEffStats(viewingCard.card, viewingCard.mine ? mySynergies : eSynergies)}
            />
          </Pressable>
        </Pressable>
      )}
    </SafeAreaView>

    {flying && (
      <Animated.View
        pointerEvents="none"
        style={[styles.flyingCard, { borderColor: JOB_COLOR[flying.card.jobClass] }, flyingStyle]}
      >
        <CardArt uri={flying.card.illustrationUrl} variant="tile" />
        <Text style={styles.cardName} numberOfLines={1}>
          ★{flying.card.grade} {flying.card.name}
        </Text>
      </Animated.View>
    )}

    {attacking && (
      <Animated.View
        pointerEvents="none"
        style={[styles.flyingCard, { borderColor: JOB_COLOR[attacking.card.jobClass] }, atkStyle]}
      >
        <CardArt uri={attacking.card.illustrationUrl} variant="tile" />
        <Text style={styles.cardName} numberOfLines={1}>
          ★{attacking.card.grade} {attacking.card.name}
        </Text>
      </Animated.View>
    )}

    {ghost && (
      <ActionGhost
        key={ghost.id}
        card={ghost.card}
        faceDown={ghost.faceDown}
        from={ghost.from}
        motion={ghost.motion}
        onImpact={ghost.onImpact}
        onDone={ghost.onDone}
      />
    )}

    {synergyTip && (() => {
      const info = SYNERGY_INFO[synergyTip.synergy.name];
      return (
        <>
          <Pressable style={styles.synergyTipBackdrop} onPress={() => setSynergyTip(null)} />
          <View
            pointerEvents="none"
            style={[styles.synergyTip, { left: synergyTip.x, top: synergyTip.y }]}
          >
            <Text style={styles.synergyTipName}>{info?.name ?? synergyTip.synergy.name}</Text>
            {info?.condition && <Text style={styles.synergyTipMeta}>조건 · {info.condition}</Text>}
            <Text style={styles.synergyTipEffect}>
              효과 · {info?.effect ?? synergyTip.synergy.description}
            </Text>
          </View>
        </>
      );
    })()}
    </View>
  );
}

function HeroRow({
  label,
  hp,
  deckCount,
  handCount,
  maxCost,
  cost,
  onPress,
  registerRef,
}: {
  label: string;
  hp: number;
  deckCount: number;
  handCount: number;
  maxCost: number;
  cost?: number;
  onPress?: () => void;
  registerRef?: (el: View | null) => void;
}) {
  return (
    <Pressable style={styles.heroRow} onPress={onPress} ref={registerRef}>
      <Text style={styles.heroLabel}>{label}</Text>
      <Text style={styles.metaText}>❤️ {hp}</Text>
      <Text style={styles.metaText}>덱 {deckCount}장</Text>
      <Text style={styles.metaText}>핸드 {handCount}장</Text>
      <Text style={styles.metaText}>코스트 {cost !== undefined ? `${cost}/${maxCost}` : maxCost}</Text>
    </Pressable>
  );
}

function SynergyRow({
  synergies,
  onPressPill,
}: {
  synergies: Synergy[];
  onPressPill?: (s: Synergy, el: View | null) => void;
}) {
  const pillRefs = useRef<Record<number, View | null>>({});
  if (synergies.length === 0) return null;
  return (
    <View style={styles.synergyRow}>
      {synergies.map((s, i) => (
        <Pressable
          key={s.name}
          ref={(el) => {
            pillRefs.current[i] = el;
          }}
          style={styles.synergyPill}
          onPress={() => onPressPill?.(s, pillRefs.current[i])}
        >
          <Text style={styles.synergyText}>{SYNERGY_INFO[s.name]?.name ?? s.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function EnemyHandBackRow({ count, registerRef }: { count: number; registerRef?: (el: View | null) => void }) {
  return (
    <View style={styles.enemyHandRow} ref={registerRef}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.cardBack}>
          <Text style={styles.cardBackMark}>◆</Text>
        </View>
      ))}
    </View>
  );
}

function FieldRow({
  cards,
  mine,
  synergies,
  selectedIdx,
  inspectedIdx,
  canTarget,
  hiddenIdx,
  onPressSlot,
  onInfoPress,
  registerSlotRef,
}: {
  cards: (BattleCard | null)[];
  mine: boolean;
  synergies: Synergy[];
  selectedIdx?: number | null;
  inspectedIdx?: number | null;
  canTarget?: boolean;
  hiddenIdx?: number | null;
  onPressSlot: (idx: number, card: BattleCard | null) => void;
  onInfoPress: (card: BattleCard) => void;
  registerSlotRef?: (idx: number, el: View | null) => void;
}) {
  return (
    <View style={styles.fieldRow}>
      {cards.map((card, i) => {
        if (!card) {
          return (
            <Pressable
              key={i}
              ref={registerSlotRef ? (el) => registerSlotRef(i, el) : undefined}
              style={[styles.slot, styles.emptySlot]}
              onPress={() => onPressSlot(i, null)}
            >
              <Text style={styles.emptySlotText}>빈 자리</Text>
            </Pressable>
          );
        }

        const ready = isReady(card);
        const eff = calcEffStats(card, synergies);
        let caption = '';
        if (mine) {
          if (card.hasActed) caption = '행동 완료';
          else if (card.justPlayed && card.grade !== 1) caption = '출근 중…';
          else caption = '⚡ 탭하여 선택';
        } else if (canTarget) {
          caption = '대상 선택!';
        }

        return (
          <Pressable
            key={i}
            ref={registerSlotRef ? (el) => registerSlotRef(i, el) : undefined}
            onPress={() => onPressSlot(i, card)}
            onLongPress={() => onInfoPress(card)}
            style={[
              styles.slot,
              { borderColor: JOB_COLOR[card.jobClass] },
              selectedIdx === i && styles.selectedSlot,
              inspectedIdx === i && styles.inspectedSlot,
              mine && !ready && styles.notReadySlot,
              mine && hiddenIdx === i && styles.hiddenCard,
            ]}
          >
            <CardArt uri={card.illustrationUrl} variant="tile" />
            <Text style={styles.cardName}>
              ★{card.grade} {card.name}
            </Text>
            <StatRow stats={{ ...eff, hp: card.currentHp ?? eff.hp }} />
            {caption ? <Text style={styles.captionText}>{caption}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  hiddenCard: {
    opacity: 0,
  },
  flyingCard: {
    position: 'absolute',
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    zIndex: 50,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  content: {
    padding: 16,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topRowLinks: {
    flexDirection: 'row',
    gap: 14,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
  },
  resetLink: {
    color: colors.primaryLight,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.gameAccent,
    padding: 8,
  },
  errorText: {
    color: colors.gameAccent,
    fontSize: typography.meta.fontSize,
  },
  midBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  midHints: {
    flex: 1,
  },
  endTurnMini: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  endTurnMiniText: {
    color: colors.textPrimary,
    fontSize: typography.meta.fontSize,
    fontWeight: '800',
  },
  hintText: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
    textAlign: 'center',
  },
  heroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    padding: 12,
    alignItems: 'center',
  },
  heroLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    marginRight: 4,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
  },
  synergyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  synergyPill: {
    backgroundColor: colors.secondary,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  synergyText: {
    color: colors.canvas,
    fontSize: typography.micro.fontSize,
    fontWeight: '700',
  },
  synergyTipBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
  },
  synergyTip: {
    position: 'absolute',
    maxWidth: 220,
    backgroundColor: colors.surface3,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderMedium,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
    zIndex: 61,
  },
  synergyTipName: {
    color: colors.textPrimary,
    fontSize: typography.micro.fontSize,
    fontWeight: '800',
  },
  synergyTipMeta: {
    color: colors.textTertiary,
    fontSize: typography.micro.fontSize,
  },
  synergyTipEffect: {
    color: colors.textSecondary,
    fontSize: typography.micro.fontSize,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 6,
  },
  slot: {
    flex: 1,
    aspectRatio: 0.65,
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    borderWidth: 2,
    borderColor: colors.borderMedium,
    padding: 6,
    justifyContent: 'center',
    gap: 2,
    position: 'relative',
  },
  emptySlot: {
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotText: {
    color: colors.textMuted,
    fontSize: typography.micro.fontSize,
  },
  selectedSlot: {
    borderColor: colors.warning,
  },
  inspectedSlot: {
    borderColor: colors.primaryLight,
  },
  notReadySlot: {
    opacity: 0.5,
  },
  cardName: {
    color: colors.textPrimary,
    fontSize: typography.micro.fontSize,
    fontWeight: '700',
  },
  captionText: {
    color: colors.textQuaternary,
    fontSize: 9,
  },
  handRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingTop: 12,
  },
  handCard: {
    width: 84,
    aspectRatio: 0.65,
    backgroundColor: colors.surface1,
    borderRadius: radius.gameCard,
    borderTopWidth: 3,
    padding: 8,
    gap: 2,
    justifyContent: 'center',
    position: 'relative',
  },
  enemyHandRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cardBack: {
    width: 28,
    height: 40,
    backgroundColor: colors.surface2,
    borderRadius: radius.gameCard,
    borderWidth: 1,
    borderColor: colors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBackMark: {
    color: colors.textMuted,
    fontSize: 12,
  },
  unaffordable: {
    opacity: 0.38,
  },
  costBadge: {
    color: colors.warning,
    fontSize: typography.micro.fontSize,
    fontWeight: '800',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionBar: {
    gap: 4,
    minHeight: 78, // reserved so the hand row below never shifts on (de)select
  },
  actionBarHidden: {
    opacity: 0,
  },
  skillButton: {
    backgroundColor: colors.secondary,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  skillDesc: {
    color: colors.textPrimary,
    fontSize: typography.micro.fontSize,
    fontWeight: '500',
    textAlign: 'center',
  },
  passiveLine: {
    color: colors.textQuaternary,
    fontSize: typography.micro.fontSize,
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.4,
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  logBox: {
    gap: 2,
  },
  logText: {
    color: colors.textMuted,
    fontSize: typography.micro.fontSize,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,15,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  overlayTitle: {
    fontSize: typography.battleResult.fontSize,
    fontWeight: typography.battleResult.fontWeight,
  },
  victoryText: {
    color: colors.secondary,
  },
  defeatText: {
    color: colors.gameAccent,
  },
  detailBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,15,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  detailCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface3,
    borderRadius: radius.card,
    borderWidth: 2,
    padding: 20,
    gap: 10,
  },
  detailCloseBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCloseText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
});
