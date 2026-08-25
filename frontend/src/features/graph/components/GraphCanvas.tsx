import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { colors, radius as radiusTokens } from '@/shared/theme';

import { layoutGraph } from '../lib/layoutGraph';
import type { GraphData, GraphNode, JobClass } from '../types';

type Point = { x: number; y: number };

const JOB_COLOR: Record<JobClass, string> = {
  dev: colors.jobDev,
  design: colors.jobDesign,
  hr: colors.jobHr,
  finance: colors.jobFinance,
  legal: colors.jobLegal,
  marketing: colors.jobMarketing,
  sales: colors.jobSales,
  pm: colors.jobPm,
};

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.5;
const ZOOM_STEP = 0.25;
const NODE_RADIUS = 15;
const SELECTED_NODE_RADIUS = 19;
const GLOW_INNER_RADIUS = SELECTED_NODE_RADIUS + 8;
const GLOW_OUTER_RADIUS = SELECTED_NODE_RADIUS + 20;
// Max px every other node (incl. "나") is pushed away from the selected node.
const MAX_PUSH_DISTANCE = 26;
// Nodes farther than this fraction of the canvas's short side from the
// selected node feel ~no push at all — the effect fades out with distance.
const INFLUENCE_RADIUS_RATIO = 0.55;
// The selected node must end up inside this "safe zone" — clear of the
// bottom sheet and away from the left/right edges — or the whole layout
// shifts (x and/or y) until it does.
const SAFE_ZONE_TOP_RATIO = 0.32;
const SAFE_ZONE_SIDE_MARGIN_RATIO = 0.22;

/**
 * Pushes `point` directly away from `selected`, like two magnets of the
 * same pole repelling — strongest right next to the selected node, fading
 * to nothing at `influenceRadius`.
 */
function repelFromSelected(point: Point, selected: Point, influenceRadius: number): Point {
  const dx = point.x - selected.x;
  const dy = point.y - selected.y;
  const dist = Math.hypot(dx, dy) || 1;
  const falloff = Math.max(0, 1 - dist / influenceRadius);
  const pushAmount = MAX_PUSH_DISTANCE * falloff;
  return {
    x: point.x + (dx / dist) * pushAmount,
    y: point.y + (dy / dist) * pushAmount,
  };
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

type PersonNodeMarkerProps = {
  node: GraphNode;
  basePosition: Point;
  focusPosition: Point;
  focusProgress: SharedValue<number>;
  ringColor: string;
  isSelected: boolean;
  onPress: () => void;
};

function PersonNodeMarker({
  node,
  basePosition,
  focusPosition,
  focusProgress,
  ringColor,
  isSelected,
  onPress,
}: PersonNodeMarkerProps) {
  const nodeRadius = useSharedValue(NODE_RADIUS);
  const glowInnerOpacity = useSharedValue(0);
  const glowOuterOpacity = useSharedValue(0);

  useEffect(() => {
    if (isSelected) {
      nodeRadius.value = withTiming(SELECTED_NODE_RADIUS, { duration: 200 });
      // A steady, non-pulsing halo — fades in once and holds.
      glowInnerOpacity.value = withTiming(0.35, { duration: 400 });
      glowOuterOpacity.value = withTiming(0.16, { duration: 500 });
    } else {
      nodeRadius.value = withTiming(NODE_RADIUS, { duration: 200 });
      glowInnerOpacity.value = withTiming(0, { duration: 200 });
      glowOuterOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isSelected, nodeRadius, glowInnerOpacity, glowOuterOpacity]);

  const glowOuterProps = useAnimatedProps(() => ({
    cx: basePosition.x + (focusPosition.x - basePosition.x) * focusProgress.value,
    cy: basePosition.y + (focusPosition.y - basePosition.y) * focusProgress.value,
    opacity: glowOuterOpacity.value,
  }));
  const glowInnerProps = useAnimatedProps(() => ({
    cx: basePosition.x + (focusPosition.x - basePosition.x) * focusProgress.value,
    cy: basePosition.y + (focusPosition.y - basePosition.y) * focusProgress.value,
    opacity: glowInnerOpacity.value,
  }));
  const nodeProps = useAnimatedProps(() => ({
    cx: basePosition.x + (focusPosition.x - basePosition.x) * focusProgress.value,
    cy: basePosition.y + (focusPosition.y - basePosition.y) * focusProgress.value,
    r: nodeRadius.value,
  }));
  const labelProps = useAnimatedProps(() => ({
    x: basePosition.x + (focusPosition.x - basePosition.x) * focusProgress.value,
    y: basePosition.y + (focusPosition.y - basePosition.y) * focusProgress.value + 4,
  }));

  return (
    <G onPress={onPress}>
      <AnimatedCircle r={GLOW_OUTER_RADIUS} fill={ringColor} animatedProps={glowOuterProps} />
      <AnimatedCircle r={GLOW_INNER_RADIUS} fill={ringColor} animatedProps={glowInnerProps} />
      <AnimatedCircle
        fill={colors.surface1}
        stroke={ringColor}
        strokeWidth={1.6}
        animatedProps={nodeProps}
      />
      <AnimatedSvgText
        fontSize={11}
        fontWeight="700"
        fill={colors.textPrimary}
        textAnchor="middle"
        animatedProps={labelProps}
      >
        {node.name.slice(0, 1)}
      </AnimatedSvgText>
    </G>
  );
}

type Props = {
  data: GraphData;
  width: number;
  height: number;
  selectedPersonId: number | null;
  onSelectPerson: (node: GraphNode) => void;
};

export function GraphCanvas({ data, width, height, selectedPersonId, onSelectPerson }: Props) {
  const centerX = width / 2;
  const centerY = height / 2;
  const center: Point = { x: centerX, y: centerY };

  const meNode = data.nodes.find((node) => node.type === 'me');
  const personNodes = data.nodes.filter((node) => node.type === 'person');

  const basePositionById = useMemo(() => {
    const map = new Map<number, Point>();
    if (meNode) map.set(meNode.id, center);
    const positions = layoutGraph(data.nodes, {
      centerX,
      centerY,
      innerRadius: Math.min(width, height) * 0.22,
      outerRadius: Math.min(width, height) * 0.4,
    });
    positions.forEach((position) => map.set(position.id, position));
    return map;
  }, [data.nodes, centerX, centerY, width, height, meNode]);

  // Lags behind `selectedPersonId` on deselect: keeps the last repelled
  // layout as the animation target until the "back to normal" transition
  // finishes, instead of the layout snapping flat the instant selection
  // clears (which made focusProgress animate toward a target that had
  // already collapsed to the base layout).
  const [focusTargetId, setFocusTargetId] = useState<number | null>(null);

  const focusPositionById = useMemo(() => {
    const map = new Map<number, Point>();
    const selectedBase = focusTargetId != null ? basePositionById.get(focusTargetId) : null;
    const influenceRadius = Math.min(width, height) * INFLUENCE_RADIUS_RATIO;

    basePositionById.forEach((position, id) => {
      if (id === focusTargetId) {
        // The selected node itself never moves — only grows/glows.
        map.set(id, position);
      } else if (selectedBase) {
        map.set(id, repelFromSelected(position, selectedBase, influenceRadius));
      } else {
        map.set(id, position);
      }
    });

    // Keep the selected node inside a safe zone — clear of the bottom
    // sheet, and off the left/right edges — by shifting the whole layout.
    if (selectedBase && focusTargetId != null) {
      const safeBottomY = height * SAFE_ZONE_TOP_RATIO;
      const safeLeftX = width * SAFE_ZONE_SIDE_MARGIN_RATIO;
      const safeRightX = width * (1 - SAFE_ZONE_SIDE_MARGIN_RATIO);

      const selectedFocus = map.get(focusTargetId) ?? selectedBase;

      let shiftY = 0;
      if (selectedFocus.y > safeBottomY) {
        shiftY = safeBottomY - selectedFocus.y;
      }

      let shiftX = 0;
      if (selectedFocus.x < safeLeftX) {
        shiftX = safeLeftX - selectedFocus.x;
      } else if (selectedFocus.x > safeRightX) {
        shiftX = safeRightX - selectedFocus.x;
      }

      if (shiftX !== 0 || shiftY !== 0) {
        map.forEach((position, id) => {
          map.set(id, { x: position.x + shiftX, y: position.y + shiftY });
        });
      }
    }

    return map;
  }, [basePositionById, focusTargetId, width, height]);

  const focusProgress = useSharedValue(0);
  useEffect(() => {
    if (selectedPersonId != null) {
      setFocusTargetId(selectedPersonId);
      focusProgress.value = withTiming(1, { duration: 350 });
    } else if (focusTargetId != null) {
      focusProgress.value = withTiming(0, { duration: 350 }, (finished) => {
        if (finished) runOnJS(setFocusTargetId)(null);
      });
    }
  }, [selectedPersonId, focusProgress, focusTargetId]);

  const meBasePosition = (meNode && basePositionById.get(meNode.id)) || center;
  const meFocusPosition = (meNode && focusPositionById.get(meNode.id)) || center;
  const meNodeProps = useAnimatedProps(() => ({
    cx: meBasePosition.x + (meFocusPosition.x - meBasePosition.x) * focusProgress.value,
    cy: meBasePosition.y + (meFocusPosition.y - meBasePosition.y) * focusProgress.value,
  }));
  const meLabelProps = useAnimatedProps(() => ({
    x: meBasePosition.x + (meFocusPosition.x - meBasePosition.x) * focusProgress.value,
    y: meBasePosition.y + (meFocusPosition.y - meBasePosition.y) * focusProgress.value + 5,
  }));

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const savedScale = useSharedValue(1);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const applyZoom = (delta: number) => {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value + delta));
    savedScale.value = next;
    scale.value = withTiming(next, { duration: 150 });
  };

  const resetView = () => {
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    scale.value = withTiming(1, { duration: 150 });
    translateX.value = withTiming(0, { duration: 150 });
    translateY.value = withTiming(0, { duration: 150 });
  };

  return (
    <View style={[styles.container, { width, height }]}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[{ width, height }, animatedStyle]}>
          <Svg width={width} height={height}>
            {data.edges.map((edge) => {
              const fromBase = basePositionById.get(edge.source);
              const toBase = basePositionById.get(edge.target);
              const fromFocus = focusPositionById.get(edge.source);
              const toFocus = focusPositionById.get(edge.target);
              if (!fromBase || !toBase || !fromFocus || !toFocus) return null;
              return (
                <GraphEdge
                  key={`${edge.source}-${edge.target}`}
                  fromBase={fromBase}
                  toBase={toBase}
                  fromFocus={fromFocus}
                  toFocus={toFocus}
                  focusProgress={focusProgress}
                  strokeWidth={0.6 + edge.weight * 0.35}
                />
              );
            })}

            {meNode && (
              <G>
                <AnimatedCircle r={24} fill={colors.primary} animatedProps={meNodeProps} />
                <AnimatedSvgText
                  fontSize={13}
                  fontWeight="700"
                  fill={colors.textPrimary}
                  textAnchor="middle"
                  animatedProps={meLabelProps}
                >
                  나
                </AnimatedSvgText>
              </G>
            )}

            {personNodes.map((node) => {
              const basePosition = basePositionById.get(node.id);
              const focusPosition = focusPositionById.get(node.id);
              if (!basePosition || !focusPosition) return null;
              const ringColor = node.jobClass ? JOB_COLOR[node.jobClass] : colors.borderMedium;
              return (
                <PersonNodeMarker
                  key={node.id}
                  node={node}
                  basePosition={basePosition}
                  focusPosition={focusPosition}
                  focusProgress={focusProgress}
                  ringColor={ringColor}
                  isSelected={node.id === selectedPersonId}
                  onPress={() => onSelectPerson(node)}
                />
              );
            })}
          </Svg>
        </Animated.View>
      </GestureDetector>

      <View style={styles.zoomControls}>
        <Pressable style={styles.zoomButton} onPress={() => applyZoom(ZOOM_STEP)}>
          <Text style={styles.zoomButtonLabel}>+</Text>
        </Pressable>
        <Pressable style={styles.zoomButton} onPress={() => applyZoom(-ZOOM_STEP)}>
          <Text style={styles.zoomButtonLabel}>−</Text>
        </Pressable>
        <Pressable style={styles.zoomButton} onPress={resetView}>
          <Text style={styles.zoomButtonLabel}>⤢</Text>
        </Pressable>
      </View>
    </View>
  );
}

type GraphEdgeProps = {
  fromBase: Point;
  toBase: Point;
  fromFocus: Point;
  toFocus: Point;
  focusProgress: SharedValue<number>;
  strokeWidth: number;
};

function GraphEdge({ fromBase, toBase, fromFocus, toFocus, focusProgress, strokeWidth }: GraphEdgeProps) {
  const lineProps = useAnimatedProps(() => ({
    x1: fromBase.x + (fromFocus.x - fromBase.x) * focusProgress.value,
    y1: fromBase.y + (fromFocus.y - fromBase.y) * focusProgress.value,
    x2: toBase.x + (toFocus.x - toBase.x) * focusProgress.value,
    y2: toBase.y + (toFocus.y - toBase.y) * focusProgress.value,
  }));

  return (
    <AnimatedLine
      animatedProps={lineProps}
      stroke={colors.secondary}
      strokeOpacity={0.35}
      strokeWidth={strokeWidth}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  zoomControls: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: colors.surface2,
    borderRadius: radiusTokens.card,
    overflow: 'hidden',
  },
  zoomButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  zoomButtonLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
