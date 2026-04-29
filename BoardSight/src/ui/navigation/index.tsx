import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { StartGameScreen } from '../screens/StartGameScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { LiveGameScreen } from '../screens/LiveGameScreen';
import { BotGameScreen } from '../screens/BotGameScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { DrillScreen } from '../screens/DrillScreen';
import { TacticsScreen } from '../screens/TacticsScreen';
import { SpectatorScreen } from '../screens/SpectatorScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const headerSettingsStyles = StyleSheet.create({
  btn: { marginRight: 4, padding: 4 },
  icon: { fontSize: 22, color: '#ffffff' },
});

function StartGameHeaderSettings({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList, 'StartGame'>;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Settings')}
      style={headerSettingsStyles.btn}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Open settings"
    >
      <Text style={headerSettingsStyles.icon}>⚙️</Text>
    </TouchableOpacity>
  );
}

export function RootNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="StartGame"
      screenOptions={{
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: 'bold' },
        contentStyle: { backgroundColor: '#16213e' },
      }}
    >
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="StartGame"
        component={StartGameScreen}
        options={({ navigation }) => ({
          title: 'BoardSight Chess',
          // react-navigation expects a factory; StartGameHeaderSettings is module-level.
          // eslint-disable-next-line react/no-unstable-nested-components -- navigator API requires inline factory
          headerRight: () => <StartGameHeaderSettings navigation={navigation} />,
        })}
      />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan Board' }} />
      <Stack.Screen name="LiveGame" component={LiveGameScreen} options={{ title: 'Live Game', gestureEnabled: false }} />
      <Stack.Screen name="BotGame" component={BotGameScreen} options={{ title: 'vs Bot', gestureEnabled: false }} />
      <Stack.Screen name="Lobby" component={LobbyScreen} options={{ title: 'Multiplayer' }} />
      <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Game Review' }} />
      <Stack.Screen name="Library" component={LibraryScreen} options={{ title: 'Game Library' }} />
      <Stack.Screen name="Drill" component={DrillScreen} options={{ title: 'Drills' }} />
      <Stack.Screen name="Tactics" component={TacticsScreen} options={{ title: 'Tactics Puzzles' }} />
      <Stack.Screen name="Spectator" component={SpectatorScreen} options={{ title: 'Live Game', gestureEnabled: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Stack.Navigator>
  );
}
