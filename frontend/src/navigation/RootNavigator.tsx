import { NavigatorScreenParams } from '@react-navigation/native';
import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, size } from '@/shared/theme';
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
  Scan: NavigatorScreenParams<ScanStackParamList> | undefined;
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

function FabButton({ onPress, accessibilityState }: BottomTabBarButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="명함 스캔"
      accessibilityState={accessibilityState}
      style={styles.fabButton}
    >
      <View style={styles.fab} />
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
            navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('Scan');
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
  },
});
