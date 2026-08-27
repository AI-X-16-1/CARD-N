import { getFocusedRouteNameFromRoute, NavigatorScreenParams } from '@react-navigation/native';
import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, size, typography } from '@/shared/theme';
import HomeScreen from '@/features/home/screens/HomeScreen';
import ScanCameraScreen from '@/features/scan/screens/ScanCameraScreen';
import ContactListScreen from '@/features/contacts/screens/ContactListScreen';
import PersonDetailScreen from '@/features/contacts/screens/PersonDetailScreen';
import GraphScreen from '@/features/graph/screens/GraphScreen';
import ConversationRecordScreen from '@/features/conversation/screens/ConversationRecordScreen';
import GameHomeScreen from '@/features/game/screens/GameHomeScreen';
import CardDetailOverlay from '@/features/game/screens/CardDetailOverlay';

import {
  CameraIcon,
  GraphIcon,
  HomeIcon,
  ListIcon,
  SwordsIcon,
} from './icons/TabIcons';

export type HomeStackParamList = {
  Home: undefined;
  PersonDetail: { personId: number };
  // mode picks which input the record screen leads with. The action sheet
  // has separate "녹음" and "업로드" entries, and landing on the wrong one
  // reads as the button having done nothing. Optional so existing callers
  // keep the recording-first default.
  ConversationRecord: { personId: number; mode?: 'record' | 'upload' };
};

export type GameStackParamList = {
  GameHome: undefined;
  CardDetail: { cardId: number };
};

export type ScanStackParamList = {
  ScanCamera: undefined;
};

export type GraphStackParamList = {
  GraphHome: undefined;
  PersonDetail: { personId: number };
  // PersonDetail's record/upload FAB entries navigate here. Without the route the
  // graph tab was the last entry point where those buttons silently did nothing
  // (#40 fixed the same gap for 목록). Same shape as HomeStack and ListStack.
  ConversationRecord: { personId: number; mode?: 'record' | 'upload' };
};

// Was a bare tab screen (ContactListScreen managed PersonDetail as local state,
// with no route for ConversationRecord at all — the record/upload FAB entries in
// PersonDetailScreen silently no-op when reached this way). Promoted to a real
// stack, same shape as HomeStack, so 목록 can push both like every other entry
// point into PersonDetail already does.
export type ListStackParamList = {
  ContactList: undefined;
  PersonDetail: { personId: number };
  ConversationRecord: { personId: number; mode?: 'record' | 'upload' };
};

export type TabParamList = {
  홈: NavigatorScreenParams<HomeStackParamList>;
  목록: NavigatorScreenParams<ListStackParamList>;
  스캔: undefined;
  관계도: NavigatorScreenParams<GraphStackParamList>;
  게임: NavigatorScreenParams<GameStackParamList>;
};

export type RootStackParamList = {
  Tabs: undefined;
  Scan: NavigatorScreenParams<ScanStackParamList> | undefined;
};

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const GameStack = createNativeStackNavigator<GameStackParamList>();
const ScanStack = createNativeStackNavigator<ScanStackParamList>();
const GraphStack = createNativeStackNavigator<GraphStackParamList>();
const ListStack = createNativeStackNavigator<ListStackParamList>();
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

function GraphStackNavigator() {
  return (
    <GraphStack.Navigator screenOptions={{ headerShown: false }}>
      <GraphStack.Screen name="GraphHome" component={GraphScreen} />
      <GraphStack.Screen name="PersonDetail" component={PersonDetailScreen} />
      <GraphStack.Screen name="ConversationRecord" component={ConversationRecordScreen} />
    </GraphStack.Navigator>
  );
}

function ListStackNavigator() {
  return (
    <ListStack.Navigator screenOptions={{ headerShown: false }}>
      <ListStack.Screen name="ContactList" component={ContactListScreen} />
      <ListStack.Screen name="PersonDetail" component={PersonDetailScreen} />
      <ListStack.Screen name="ConversationRecord" component={ConversationRecordScreen} />
    </ListStack.Navigator>
  );
}

function FabButton({ onPress, accessibilityState }: BottomTabBarButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="명함 스캔"
      accessibilityState={accessibilityState}
      style={styles.fabButton}
    >
      <View style={styles.fab}>
        <CameraIcon color={colors.textPrimary} size={size.fabIcon} />
      </View>
    </Pressable>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryLight,
        tabBarInactiveTintColor: colors.tabIconInactive,
        tabBarStyle: { backgroundColor: colors.tabBarSurface },
        tabBarLabelStyle: typography.tabLabel,
      }}
    >
      <Tab.Screen
        name="홈"
        component={HomeStackNavigator}
        options={{ tabBarIcon: ({ color }) => <HomeIcon color={color} /> }}
        listeners={({ navigation, route }) => ({
          // The Home tab is a real stack, so switching away and back (or even
          // re-tapping it while already focused) otherwise resumes wherever the
          // stack was left (e.g. PersonDetail) instead of showing Home itself.
          tabPress: () => {
            // ...except the record screen, which is the one place in this stack
            // holding work that only exists in memory: a recording in progress, or a
            // summary that has been generated but not yet saved. Resetting unmounts it
            // and both are gone with nothing asked and nothing said. Leaving a stale
            // screen behind is the lesser problem — '뒤로' still gets out of it.
            if (getFocusedRouteNameFromRoute(route) === 'ConversationRecord') return;
            navigation.navigate('홈', { screen: 'Home' });
          },
        })}
      />
      <Tab.Screen
        name="목록"
        component={ListStackNavigator}
        options={{ tabBarIcon: ({ color }) => <ListIcon color={color} /> }}
        listeners={({ navigation, route }) => ({
          // Same fix as the 홈 tab above — now a real stack, so it needs the same
          // reset-unless-mid-recording guard.
          tabPress: () => {
            if (getFocusedRouteNameFromRoute(route) === 'ConversationRecord') return;
            navigation.navigate('목록', { screen: 'ContactList' });
          },
        })}
      />
      <Tab.Screen
        name="스캔"
        component={ScanCameraScreen}
        options={{ tabBarButton: FabButton }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('Scan');
          },
        })}
      />
      <Tab.Screen
        name="관계도"
        component={GraphStackNavigator}
        options={{ tabBarIcon: ({ color }) => <GraphIcon color={color} /> }}
        listeners={({ navigation, route }) => ({
          // Same fix as the 홈 tab above — GraphStack has the identical
          // stays-on-PersonDetail issue since it's also a real stack.
          tabPress: () => {
            // Now that ConversationRecord is reachable from this stack too, it needs
            // the same guard the other two tabs have: resetting mid-recording throws
            // away audio that exists nowhere else. See the 홈 tab for the full note.
            if (getFocusedRouteNameFromRoute(route) === 'ConversationRecord') return;
            navigation.navigate('관계도', { screen: 'GraphHome' });
          },
        })}
      />
      <Tab.Screen
        name="게임"
        component={GameStackNavigator}
        options={{
          tabBarActiveTintColor: colors.gameAccent,
          tabBarIcon: ({ color }) => <SwordsIcon color={color} />,
        }}
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
  fabButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: size.fab,
    height: size.fab,
    borderRadius: radius.fab,
    backgroundColor: colors.primary,
    marginTop: size.fabRaise,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
