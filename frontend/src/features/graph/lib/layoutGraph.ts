import type { GraphNode } from '../types';

export type LayoutPosition = {
  id: number;
  x: number;
  y: number;
};

export type LayoutOptions = {
  centerX: number;
  centerY: number;
  innerRadius: number;
  outerRadius: number;
};

/**
 * Places 1st-degree person nodes around the center.
 * Nodes sharing a jobClass are grouped into the same angular sector so
 * common-group people visually cluster together, rather than being spread
 * evenly around the full circle. Within a sector, radius decreases with
 * conversation count so closer relationships sit nearer the center.
 */
export function layoutGraph(nodes: GraphNode[], options: LayoutOptions): LayoutPosition[] {
  const { centerX, centerY, innerRadius, outerRadius } = options;
  const people = nodes.filter((node) => node.type === 'person');
  if (people.length === 0) return [];

  const groups = new Map<string, GraphNode[]>();
  for (const person of people) {
    const key = person.jobClass ?? 'other';
    const group = groups.get(key) ?? [];
    group.push(person);
    groups.set(key, group);
  }

  const groupKeys = [...groups.keys()].sort();
  const totalCount = people.length;
  const maxConversationCount = Math.max(1, ...people.map((p) => p.conversationCount ?? 0));

  const positions: LayoutPosition[] = [];
  let angleCursor = 0;

  for (const key of groupKeys) {
    const group = groups.get(key) ?? [];
    const sectorAngle = (group.length / totalCount) * Math.PI * 2;
    const angleStep = sectorAngle / (group.length + 1);

    group.forEach((person, index) => {
      const angle = angleCursor + angleStep * (index + 1);
      const strength = (person.conversationCount ?? 0) / maxConversationCount;
      const radius = outerRadius - strength * (outerRadius - innerRadius);

      positions.push({
        id: person.id,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });

    angleCursor += sectorAngle;
  }

  return positions;
}
