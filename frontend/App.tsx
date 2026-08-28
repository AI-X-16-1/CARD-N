import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CallAlertSync } from '@/features/call-alert/components/CallAlertSync';
import { RootNavigator } from '@/navigation/RootNavigator';
import { linking } from '@/navigation/linking';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer linking={linking}>
          {/* Renders nothing; keeps the native call-alert cache fresh while the app runs. */}
          <CallAlertSync />
          <RootNavigator />
          <StatusBar style="light" />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
