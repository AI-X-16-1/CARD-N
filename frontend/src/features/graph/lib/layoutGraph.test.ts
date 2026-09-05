import { layoutGraph, type LayoutOptions } from './layoutGraph';
import type { GraphNode, JobClass } from '../types';

const OPTIONS: LayoutOptions = {
  centerX: 0,
  centerY: 0,
  innerRadius: 50,
  outerRadius: 150,
};

let nextId = 1;

function person(jobClass: JobClass | null, conversationCount = 0): GraphNode {
  return {
    id: nextId++,
    type: 'person',
    name: `person-${nextId}`,
    jobClass,
    conversationCount,
  };
}

function me(): GraphNode {
  return { id: 0, type: 'me', name: '나', jobClass: null };
}

const radiusOf = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

/** atan2 normalized to [0, 2π) so sector order can be compared numerically. */
const angleOf = (p: { x: number; y: number }) => {
  const angle = Math.atan2(p.y, p.x);
  return angle < 0 ? angle + Math.PI * 2 : angle;
};

beforeEach(() => {
  nextId = 1;
});

describe('layoutGraph', () => {
  it('returns no positions when there are no person nodes', () => {
    expect(layoutGraph([], OPTIONS)).toEqual([]);
    expect(layoutGraph([me()], OPTIONS)).toEqual([]);
  });

  it('lays out only person nodes, leaving the center node to the caller', () => {
    const dev = person('dev');
    const positions = layoutGraph([me(), dev], OPTIONS);

    expect(positions.map((p) => p.id)).toEqual([dev.id]);
  });

  it('keeps every node between the inner and outer radius', () => {
    const nodes = [me(), person('dev', 0), person('design', 3), person('pm', 12)];

    for (const position of layoutGraph(nodes, OPTIONS)) {
      expect(radiusOf(position)).toBeGreaterThanOrEqual(OPTIONS.innerRadius);
      expect(radiusOf(position)).toBeLessThanOrEqual(OPTIONS.outerRadius);
    }
  });

  it('pulls the most-talked-to person to the inner radius and pushes a silent one out', () => {
    const quiet = person('dev', 0);
    const frequent = person('dev', 8);
    const positions = layoutGraph([quiet, frequent], OPTIONS);

    const byId = new Map(positions.map((p) => [p.id, p]));
    expect(radiusOf(byId.get(frequent.id)!)).toBeCloseTo(OPTIONS.innerRadius);
    expect(radiusOf(byId.get(quiet.id)!)).toBeCloseTo(OPTIONS.outerRadius);
  });

  it('parks everyone at the outer radius when nobody has been talked to yet', () => {
    const positions = layoutGraph([person('dev'), person('design')], OPTIONS);

    for (const position of positions) {
      expect(radiusOf(position)).toBeCloseTo(OPTIONS.outerRadius);
    }
  });

  it('groups a jobClass into one angular sector instead of interleaving groups', () => {
    const designers = [person('design'), person('design')];
    const developers = [person('dev'), person('dev')];
    const positions = layoutGraph([me(), ...designers, ...developers], OPTIONS);

    const angles = new Map(positions.map((p) => [p.id, angleOf(p)]));
    const designAngles = designers.map((n) => angles.get(n.id)!);
    const devAngles = developers.map((n) => angles.get(n.id)!);

    // 'design' sorts before 'dev', so its whole sector precedes the dev sector.
    expect(Math.max(...designAngles)).toBeLessThan(Math.min(...devAngles));
  });

  it('gives a bigger group a proportionally wider sector', () => {
    const big = [person('dev'), person('dev'), person('dev')];
    const small = [person('hr')];
    const positions = layoutGraph([...big, ...small], OPTIONS);

    const angles = new Map(positions.map((p) => [p.id, angleOf(p)]));
    const devAngles = big.map((n) => angles.get(n.id)!).sort((a, b) => a - b);
    const devSpread = devAngles[devAngles.length - 1] - devAngles[0];

    // 3 of 4 people → a 3/4 * 2π sector, sampled at 3 of its 4 interior steps.
    expect(devSpread).toBeCloseTo(((Math.PI * 2 * 3) / 4 / 4) * 2);
  });

  it('buckets people with no jobClass together rather than dropping them', () => {
    const unknown = [person(null), person(null)];
    const positions = layoutGraph([...unknown, person('dev')], OPTIONS);

    expect(positions.map((p) => p.id).sort()).toEqual([1, 2, 3]);
  });

  it('is deterministic for the same input', () => {
    const nodes = [me(), person('dev', 2), person('design', 5), person(null, 1)];

    expect(layoutGraph(nodes, OPTIONS)).toEqual(layoutGraph(nodes, OPTIONS));
  });
});
