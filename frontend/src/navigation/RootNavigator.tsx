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
