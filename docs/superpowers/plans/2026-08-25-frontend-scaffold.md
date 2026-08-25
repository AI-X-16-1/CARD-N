# Frontend Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a running Expo (TypeScript) app with dark-mode config, design tokens, navigation (bottom tabs + stacks + FAB), and one placeholder screen per feature folder, so every team member can `npm install && npx expo start` and start building inside their own `src/features/<name>/` folder immediately.

**Architecture:** A single Expo app rooted at `frontend/`. `App.tsx` renders `RootNavigator`, which nests a bottom `Tab.Navigator` (홈/목록/관계도/게임 + a center FAB) inside an outer `Stack.Navigator` (so the scan camera can be presented as a full-screen modal from the FAB). All screens are placeholders built from one shared `PlaceholderScreen` component. All color/font/radius/motion values come from `src/shared/theme/`, itself a direct transcription of `docs/design-tokens.md`.

**Tech Stack:** React Native via Expo (TypeScript, blank-typescript template), React Navigation (bottom-tabs + native-stack), react-native-svg, react-native-reanimated, expo-camera, expo-av, zustand, axios.

**Spec:** `docs/superpowers/specs/2026-08-25-initial-scaffold-design.md`

## Global Constraints

- React Native via Expo (TypeScript, `blank-typescript` template) — no bare RN CLI
- Dark mode only: `app.json` → `"userInterfaceStyle": "dark"`; `StatusBar` style `"light"`
- All user-facing strings in Korean; code, comments, and identifiers in English
- No hardcoded colors/sizes — import everything from `@/shared/theme`
- Path alias `@/` → `src/` (configured in both `tsconfig.json` and `babel.config.js`)
- `src/features/game/engine/` must stay pure functions — no React/React Native imports there
- Feature folders (`home`, `scan`, `contacts`, `graph`, `conversation`, `game`) don't import from each other directly — only from `src/shared/`
- Commit messages follow Conventional Commits (`docs/conventions.md`)

---

### Task 1: Create the Expo app + dark mode config

**Files:**
- Create: `frontend/` (entire Expo `blank-typescript` template output)
- Modify: `frontend/app.json`

**Interfaces:**
- Produces: a bootable Expo project at `frontend/` with `App.tsx`,
  `app.json`, `tsconfig.json`, `package.json` — every later task adds files
  inside this tree.

`frontend/CLAUDE.md` already exists and must survive this task untouched.

- [ ] **Step 1: Move `frontend/CLAUDE.md` out of the way**

Run (from repo root):
```bash
mv frontend/CLAUDE.md /tmp/frontend-claude-md-backup.md
rmdir frontend
```
Expected: `frontend/` no longer exists (it was empty except for the file
just moved).

- [ ] **Step 2: Generate the Expo app**

Run (from repo root):
```bash
npx create-expo-app@latest frontend --template blank-typescript
```
Expected: creates `frontend/` with `App.tsx`, `app.json`, `package.json`,
`tsconfig.json`, `node_modules/` (already covered by the root
`.gitignore`). Confirm no nested `.git` was created:
`ls -la frontend/.git 2>/dev/null` should print nothing (git repos on the
`$PATH` that see a parent `.git` normally skip `git init`, but verify
anyway — `rm -rf frontend/.git` if one exists).

- [ ] **Step 3: Restore `frontend/CLAUDE.md`**

Run: `mv /tmp/frontend-claude-md-backup.md frontend/CLAUDE.md`

- [ ] **Step 4: Turn on dark mode in `app.json`**

Open `frontend/app.json` and add `"userInterfaceStyle": "dark"` inside the
top-level `"expo"` object (alongside the existing `"name"`, `"slug"`, etc.
keys the template generated).

- [ ] **Step 5: Verify it type-checks**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: exits 0 (the unmodified template is already type-clean).

- [ ] **Step 6: Commit**

```bash
cd frontend
git add -A
git commit -m "chore(frontend): scaffold Expo TypeScript app with dark mode"
```

---

### Task 2: Install navigation/media libs + path alias

**Files:**
- Modify: `frontend/package.json` (via installs)
- Create: `frontend/babel.config.js` (overwrite template default)
- Modify: `frontend/tsconfig.json`

**Interfaces:**
- Produces: `@/` resolvable as `src/` from both TypeScript (editor/tsc) and
  Babel (Metro bundler) — every subsequent task's imports rely on this.

- [ ] **Step 1: Install Expo-vetted native packages**

Run (from `frontend/`):
```bash
npx expo install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack react-native-screens react-native-safe-area-context react-native-svg react-native-reanimated expo-camera expo-av
```
Expected: exits 0, versions pinned in `package.json` match the installed
Expo SDK.

- [ ] **Step 2: Install JS-only packages**

Run (from `frontend/`):
```bash
npx expo install zustand axios
npm install -D babel-plugin-module-resolver
```

- [ ] **Step 3: Configure the path alias in `babel.config.js`**

Replace the full contents of `frontend/babel.config.js` with:

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', { alias: { '@': './src' } }],
      'react-native-reanimated/plugin',
    ],
  };
};
```

`react-native-reanimated/plugin` must stay the last entry in the plugins
array — Reanimated requires this.

- [ ] **Step 4: Configure the path alias in `tsconfig.json`**

Replace the full contents of `frontend/tsconfig.json` with:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

- [ ] **Step 5: Verify it still type-checks**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add package.json package-lock.json babel.config.js tsconfig.json
git commit -m "chore(frontend): add navigation/media deps and @/ path alias"
```

---

### Task 3: Shared theme tokens + PlaceholderScreen + Person type

**Files:**
- Create: `frontend/src/shared/theme/colors.ts`
- Create: `frontend/src/shared/theme/typography.ts`
- Create: `frontend/src/shared/theme/shape.ts`
- Create: `frontend/src/shared/theme/motion.ts`
- Create: `frontend/src/shared/theme/index.ts`
- Create: `frontend/src/shared/components/PlaceholderScreen.tsx`
- Create: `frontend/src/shared/types/person.ts`

**Interfaces:**
- Produces: `import { colors, typography, radius, motion } from '@/shared/theme'`
  and `import { PlaceholderScreen } from '@/shared/components/PlaceholderScreen'`
  — every feature screen in Task 4 uses both.

- [ ] **Step 1: Write `src/shared/theme/colors.ts`**

Values transcribed from `docs/design-tokens.md` § Colors:

```typescript
export const colors = {
  canvas: '#0A0A0F',
  surface1: '#14141F',
  surface2: '#1E1E2E',
  surface3: '#2A2A3C',

  primary: '#6C5CE7',
  primaryLight: '#A29BFE',
  secondary: '#00D2D3',
  gameAccent: '#FD7272',
  warning: '#FECA57',

  textPrimary: 'rgba(255,255,255,1.0)',
  textSecondary: 'rgba(255,255,255,0.75)',
  textTertiary: 'rgba(255,255,255,0.50)',
  textQuaternary: 'rgba(255,255,255,0.45)',
  textMuted: 'rgba(255,255,255,0.35)',
  textSubtle: 'rgba(255,255,255,0.30)',

  borderLight: 'rgba(255,255,255,0.06)',
  borderMedium: 'rgba(255,255,255,0.12)',

  jobDev: '#6C5CE7',
  jobDesign: '#FDA7DF',
  jobHr: '#55E6C1',
  jobFinance: '#F8B739',
  jobLegal: '#778BEB',
  jobMarketing: '#FD7272',
  jobSales: '#FF6348',
  jobPm: '#7ED6DF',
} as const;
```

- [ ] **Step 2: Write `src/shared/theme/typography.ts`**

Values from `docs/design-tokens.md` § Typography (letter-spacing converted
from em to px: `0.08em` of a 12px font = `0.96`px):

```typescript
export const typography = {
  screenTitle: { fontSize: 20, fontWeight: '700' as const },
  greeting: { fontSize: 22, fontWeight: '700' as const },
  personName: { fontSize: 19, fontWeight: '800' as const },
  cardName: { fontSize: 21, fontWeight: '800' as const },
  sectionLabel: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.96 },
  body: { fontSize: 14, fontWeight: '400' as const },
  meta: { fontSize: 12, fontWeight: '400' as const },
  micro: { fontSize: 10, fontWeight: '600' as const },
  tabLabel: { fontSize: 9.5, fontWeight: '600' as const },
  timer: { fontSize: 44, fontWeight: '500' as const },
  battleResult: { fontSize: 34, fontWeight: '700' as const },
} as const;
```

- [ ] **Step 3: Write `src/shared/theme/shape.ts`**

Values from `docs/design-tokens.md` § Shape:

```typescript
export const radius = {
  card: 12,
  gameCard: 8,
  pill: 99,
  myCard: 14,
  bottomSheet: 18,
  fab: 18,
} as const;
```

- [ ] **Step 4: Write `src/shared/theme/motion.ts`**

Values from `docs/design-tokens.md` § Motion (duration in ms):

```typescript
export const motion = {
  screenTransition: { duration: 250 },
  tabResponse: { duration: 200 },
  listAppear: { duration: 250 },
  cardRiseIn: { duration: 300 },
  cardRevealFlip: { duration: 475 },
  hitFlash: { duration: 400 },
  turnBanner: { duration: 1100 },
  hpBar: { duration: 400 },
} as const;
```

- [ ] **Step 5: Write `src/shared/theme/index.ts`**

```typescript
export * from './colors';
export * from './typography';
export * from './shape';
export * from './motion';
```

- [ ] **Step 6: Write `src/shared/components/PlaceholderScreen.tsx`**

```typescript
import { SafeAreaView, StyleSheet, Text } from 'react-native';

import { colors, typography } from '@/shared/theme';

type Props = {
  title: string;
};

export function PlaceholderScreen({ title }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
  },
});
```

- [ ] **Step 7: Write `src/shared/types/person.ts`**

```typescript
export type Person = {
  id: number;
  name: string;
  company: string;
  title: string;
};
```

- [ ] **Step 8: Verify it type-checks**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
cd frontend
git add src/shared
git commit -m "feat(frontend): add design token theme and PlaceholderScreen"
```

---

### Task 4: Feature placeholder screens

**Files:**
- Create: `frontend/src/features/home/screens/HomeScreen.tsx`
- Create: `frontend/src/features/scan/screens/ScanCameraScreen.tsx`
- Create: `frontend/src/features/contacts/screens/ContactListScreen.tsx`
- Create: `frontend/src/features/contacts/screens/PersonDetailScreen.tsx`
- Create: `frontend/src/features/graph/screens/GraphScreen.tsx`
- Create: `frontend/src/features/conversation/screens/ConversationRecordScreen.tsx`
- Create: `frontend/src/features/game/screens/GameHomeScreen.tsx`
- Create: `frontend/src/features/game/screens/CardDetailOverlay.tsx`
- Create: `frontend/src/features/game/engine/.gitkeep`

**Interfaces:**
- Consumes: `PlaceholderScreen` from Task 3.
- Produces: one default-exported component per file — Task 5's
  `RootNavigator` imports all 8 by these exact paths.

- [ ] **Step 1: Write `src/features/home/screens/HomeScreen.tsx`**

```typescript
import { PlaceholderScreen } from '@/shared/components/PlaceholderScreen';

export default function HomeScreen() {
  return <PlaceholderScreen title="홈" />;
}
```

- [ ] **Step 2: Write `src/features/scan/screens/ScanCameraScreen.tsx`**

```typescript
import { PlaceholderScreen } from '@/shared/components/PlaceholderScreen';

export default function ScanCameraScreen() {
  return <PlaceholderScreen title="명함 스캔" />;
}
```

- [ ] **Step 3: Write `src/features/contacts/screens/ContactListScreen.tsx`**

```typescript
import { PlaceholderScreen } from '@/shared/components/PlaceholderScreen';

export default function ContactListScreen() {
  return <PlaceholderScreen title="연락처 목록" />;
}
```

- [ ] **Step 4: Write `src/features/contacts/screens/PersonDetailScreen.tsx`**

```typescript
import { PlaceholderScreen } from '@/shared/components/PlaceholderScreen';

export default function PersonDetailScreen() {
  return <PlaceholderScreen title="인물 상세" />;
}
```

- [ ] **Step 5: Write `src/features/graph/screens/GraphScreen.tsx`**

```typescript
import { PlaceholderScreen } from '@/shared/components/PlaceholderScreen';

export default function GraphScreen() {
  return <PlaceholderScreen title="관계도" />;
}
```

- [ ] **Step 6: Write `src/features/conversation/screens/ConversationRecordScreen.tsx`**

```typescript
import { PlaceholderScreen } from '@/shared/components/PlaceholderScreen';

export default function ConversationRecordScreen() {
  return <PlaceholderScreen title="대화 기록" />;
}
```

- [ ] **Step 7: Write `src/features/game/screens/GameHomeScreen.tsx`**

```typescript
import { PlaceholderScreen } from '@/shared/components/PlaceholderScreen';

export default function GameHomeScreen() {
  return <PlaceholderScreen title="게임" />;
}
```

- [ ] **Step 8: Write `src/features/game/screens/CardDetailOverlay.tsx`**

```typescript
import { PlaceholderScreen } from '@/shared/components/PlaceholderScreen';

export default function CardDetailOverlay() {
  return <PlaceholderScreen title="카드 상세" />;
}
```

- [ ] **Step 9: Create the (empty) game engine folder**

Git doesn't track empty directories, so add a placeholder file to reserve
the path for the pure-function battle engine:

Run: `touch frontend/src/features/game/engine/.gitkeep`

- [ ] **Step 10: Verify it type-checks**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 11: Commit**

```bash
cd frontend
git add src/features
git commit -m "feat(frontend): add placeholder screens for all 6 feature folders"
```

---

### Task 5: RootNavigator (tabs + stacks + FAB) and App.tsx

**Files:**
- Create: `frontend/src/navigation/RootNavigator.tsx`
- Modify: `frontend/App.tsx`

**Interfaces:**
- Consumes: all 8 screens from Task 4, `colors`/`radius` from Task 3's
  theme.
- Produces: `RootNavigator` (default navigation tree) — `App.tsx` renders
  it inside `NavigationContainer`.

- [ ] **Step 1: Write `src/navigation/RootNavigator.tsx`**

```typescript
import { NavigatorScreenParams } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/shared/theme';
import HomeScreen from '@/features/home/screens/HomeScreen';
import ScanCameraScreen from '@/features/scan/screens/ScanCameraScreen';
import ContactListScreen from '@/features/contacts/screens/ContactListScreen';
import PersonDetailScreen from '@/features/contacts/screens/PersonDetailScreen';
import GraphScreen from '@/features/graph/screens/GraphScreen';
import ConversationRecordScreen from '@/features/conversation/screens/ConversationRecordScreen';
import GameHomeScreen from '@/features/game/screens/GameHomeScreen';
import CardDetailOverlay from '@/features/game/screens/CardDetailOverlay';

export type HomeStackParamList = {
  Home: undefined;
  PersonDetail: { personId: number };
  ConversationRecord: { personId: number };
};

export type GameStackParamList = {
  GameHome: undefined;
  CardDetail: { cardId: number };
};

export type ScanStackParamList = {
  ScanCamera: undefined;
};

export type TabParamList = {
  홈: NavigatorScreenParams<HomeStackParamList>;
  목록: undefined;
  스캔: undefined;
  관계도: undefined;
  게임: NavigatorScreenParams<GameStackParamList>;
};

export type RootStackParamList = {
  Tabs: undefined;
  Scan: NavigatorScreenParams<ScanStackParamList>;
};

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const GameStack = createNativeStackNavigator<GameStackParamList>();
const ScanStack = createNativeStackNavigator<ScanStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="PersonDetail" component={PersonDetailScreen} />
      <HomeStack.Screen name="ConversationRecord" component={ConversationRecordScreen} />
    </HomeStack.Navigator>
  );
}

function GameStackNavigator() {
  return (
    <GameStack.Navigator screenOptions={{ headerShown: false }}>
      <GameStack.Screen name="GameHome" component={GameHomeScreen} />
      <GameStack.Screen
        name="CardDetail"
        component={CardDetailOverlay}
        options={{ presentation: 'modal' }}
      />
    </GameStack.Navigator>
  );
}

function ScanStackNavigator() {
  return (
    <ScanStack.Navigator screenOptions={{ headerShown: false }}>
      <ScanStack.Screen name="ScanCamera" component={ScanCameraScreen} />
    </ScanStack.Navigator>
  );
}

function FabButton() {
  return <View style={styles.fab} />;
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryLight,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.42)',
        tabBarStyle: { backgroundColor: 'rgba(20,20,31,0.92)' },
      }}
    >
      <Tab.Screen name="홈" component={HomeStackNavigator} />
      <Tab.Screen name="목록" component={ContactListScreen} />
      <Tab.Screen
        name="스캔"
        component={ScanCameraScreen}
        options={{ tabBarButton: FabButton }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.getParent()?.navigate('Scan');
          },
        })}
      />
      <Tab.Screen name="관계도" component={GraphScreen} />
      <Tab.Screen
        name="게임"
        component={GameStackNavigator}
        options={{ tabBarActiveTintColor: colors.gameAccent }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Tabs" component={TabNavigator} />
      <RootStack.Screen
        name="Scan"
        component={ScanStackNavigator}
        options={{ presentation: 'fullScreenModal' }}
      />
    </RootStack.Navigator>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 52,
    height: 52,
    borderRadius: radius.fab,
    backgroundColor: colors.primary,
    marginTop: -18,
  },
});
```

- [ ] **Step 2: Replace `App.tsx`**

Replace the full contents of `frontend/App.tsx` with:

```typescript
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from '@/navigation/RootNavigator';
import { colors } from '@/shared/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator />
        <StatusBar style="light" backgroundColor={colors.canvas} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 3: Verify it type-checks**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add App.tsx src/navigation
git commit -m "feat(frontend): wire bottom tab + stack navigation with scan FAB"
```

---

### Task 6: Full verification — type-check + bundle export

**Files:** none (verification only — fix forward if any step below fails).

- [ ] **Step 1: Full TypeScript check**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 2: Bundle export (proves Metro can resolve every import)**

Run (from `frontend/`): `npx expo export --platform android`
Expected: exits 0, produces a `dist/` output directory. (This is a proxy
for "the app boots" since no simulator/device is available in this
environment — it exercises every import path, the `@/` alias, and the
Reanimated/SVG native module registration.)

- [ ] **Step 3: Clean up the export output**

Run (from `frontend/`): `rm -rf dist`
(`dist/` is a build artifact, not something to commit — if it isn't
already covered by `.gitignore`, add `frontend/dist/` to the root
`.gitignore` and commit that one-line addition.)

- [ ] **Step 4: Commit any fixes made during verification**

If Steps 1–2 required code changes to pass, commit them:
```bash
git add -A
git commit -m "fix(frontend): address issues found during full verification"
```
If nothing needed changing, skip this step — there is nothing to commit.
