# Frontend — CLAUDE.md

Instructions for the React Native (Android-first) frontend agent.

## Documents to Read First

1. `/docs/design-tokens.md` — color, typography, and spacing tokens
2. `/docs/ui-spec.md` — per-screen implementation spec
3. `/docs/conventions.md` — code style, file naming
4. `/docs/features.md` — feature folder structure, dependency rules

## Tech Stack

- React Native (0.76+), TypeScript strict
- React Navigation (Bottom Tabs + Stack)
- react-native-svg (relationship graph)
- react-native-reanimated (animations)
- react-native-camera / expo-camera (scan)
- zustand or React Context (state management)
- axios or fetch (API communication)

## Core Rules

### 1. Use Design Tokens Only

```typescript
// ✅ Correct
import { colors } from '@/shared/theme/colors';
<View style={{ backgroundColor: colors.surface1 }} />

// ❌ Forbidden
<View style={{ backgroundColor: '#14141F' }} />
```

### 2. Respect Feature Folder Boundaries

```
Do not directly import components from features/contacts/ inside features/scan/.
Create shared components in shared/components/ and import them from there.
```

### 3. Screen Component Structure

```typescript
// features/scan/screens/ScanCameraScreen.tsx
export default function ScanCameraScreen() {
  const { startScan, isScanning } = useOcrScan();  // Business logic goes in hooks
  return (
    <SafeAreaView style={styles.container}>
      {/* UI rendering */}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({ ... });  // Styles at the bottom
```

### 4. UI Language

All user-facing strings are in Korean. Code, comments, and variable names are in English.

```typescript
// ✅
<Text>명함을 프레임에 맞춰주세요</Text>

// ❌
<Text>Align the business card in the frame</Text>
```

### 5. Dark Mode Only

This app is dark mode only. Light mode is not supported.
Fix the StatusBar to `light-content`.

### 6. Game Engine Must Be Pure Functions

Write code in the `features/game/engine/` folder as pure functions with no UI dependencies.
Do not import React components or React Native APIs.
Design functions with a clear input → output shape so they're easy to test.

```typescript
// ✅ features/game/engine/battle.ts
export function attack(state: BattleState, ...): BattleState { ... }

// ❌ features/game/engine/battle.ts
import { Alert } from 'react-native';  // forbidden
```

## Navigation Structure

```typescript
// src/navigation/RootNavigator.tsx
const Tab = createBottomTabNavigator();
const HomeStack = createStackNavigator();
const ScanStack = createStackNavigator();
const GameStack = createStackNavigator();

// Tab Navigator
Tab.Screen name="홈" component={HomeStackNavigator}
Tab.Screen name="목록" component={ContactListScreen}
// FAB (center) → ScanStack (modal presentation)
Tab.Screen name="관계도" component={GraphScreen}
Tab.Screen name="게임" component={GameStackNavigator}

// Stack screens (pushed from various places)
PersonDetailScreen  ← pushed from Home, List, and Graph
ConversationRecordScreen ← pushed from PersonDetail
CardDetailOverlay ← modal from the Game Compendium
```

## Path Alias

Configure `@/` → `src/` in `tsconfig.json`.

```typescript
import { colors } from '@/shared/theme/colors';
import { Person } from '@/shared/types/person';
import { useOcrScan } from '@/features/scan/hooks/useOcrScan';
```
