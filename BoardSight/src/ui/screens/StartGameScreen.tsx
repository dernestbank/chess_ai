import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StartGameProps } from '../navigation/types';
import { useGameService } from '../../domain/gameService';
import type { SessionConfig } from '../../domain/gamecore/types';
import { TIME_CONTROLS } from '../../domain/gamecore/clock';
import type { TimeControl } from '../../domain/gamecore/clock';
import { TimeControlPicker } from '../components/TimeControlPicker';
import { ColorPalette, useTheme } from '../theme';

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: t.bg },
    heading: { fontSize: 22, fontWeight: 'bold', color: t.text, marginBottom: 20, marginTop: 8 },
    modeCard: { backgroundColor: t.bgCard, borderRadius: 16, padding: 20, marginBottom: 16 },
    modeEmoji: { fontSize: 36, marginBottom: 8 },
    modeTitle: { fontSize: 20, fontWeight: 'bold', color: t.text, marginBottom: 4 },
    modeSubtitle: { fontSize: 14, color: t.textMuted, lineHeight: 20 },
    libraryLink: { marginTop: 8, alignItems: 'center', padding: 12 },
    libraryText: { fontSize: 16, color: t.accent },
    pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    pickerSheet: {
      backgroundColor: t.bgAccent, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 24,
    },
    pickerHeading: { fontSize: 18, fontWeight: 'bold', color: t.text, marginBottom: 16, textAlign: 'center' },
    startBtn: {
      backgroundColor: t.accentCta, borderRadius: 12, padding: 16,
      alignItems: 'center', marginTop: 8,
    },
    startBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    cancelBtn: { marginTop: 8, padding: 16, alignItems: 'center' },
    cancelText: { color: t.textMuted, fontSize: 16 },
    settingsLink: { position: 'absolute', top: 12, right: 16 },
    settingsIcon: { fontSize: 22, color: t.textFaint },
  });
}

function GameModeButton({
  emoji,
  title,
  subtitle,
  onPress,
  styles,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <TouchableOpacity style={styles.modeCard} onPress={onPress}>
      <Text style={styles.modeEmoji}>{emoji}</Text>
      <Text style={styles.modeTitle}>{title}</Text>
      <Text style={styles.modeSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

export function StartGameScreen({ navigation }: StartGameProps): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { startNewGame } = useGameService();
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTimeControl, setSelectedTimeControl] = useState<TimeControl>(TIME_CONTROLS[2] ?? TIME_CONTROLS[0]!); // Blitz 5+0

  const startOTB = () => {
    setShowTimePicker(true);
  };

  const confirmOTB = () => {
    setShowTimePicker(false);
    navigation.navigate('Scan', { gameId: 'new', timeControlName: selectedTimeControl.name });
  };

  const startBot = async () => {
    const config: SessionConfig = {
      id: Math.random().toString(36).slice(2),
      mode: 'bot',
      boardOrientation: 'white-bottom',
      assistLevel: 'off',
      botDifficulty: 'intermediate',
    };
    const gId = await startNewGame(config);
    navigation.navigate('BotGame', { gameId: gId, difficulty: 'intermediate' });
  };

  const startMultiplayer = () => {
    navigation.navigate('Lobby');
  };

  const startDrills = () => {
    navigation.navigate('Drill');
  };

  const startTactics = () => {
    navigation.navigate('Tactics');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Choose Mode</Text>

      {/* Settings shortcut */}
      <TouchableOpacity style={styles.settingsLink} onPress={() => navigation.navigate('Settings')}>
        <Text style={styles.settingsIcon}>⚙</Text>
      </TouchableOpacity>

      <GameModeButton
        emoji="📷"
        title="Over the Board"
        subtitle="Scan a physical chessboard and track the game automatically"
        onPress={startOTB}
        styles={styles}
      />
      <GameModeButton
        emoji="🤖"
        title="Play vs Bot"
        subtitle="Play on-screen against the computer — works offline"
        onPress={startBot}
        styles={styles}
      />
      <GameModeButton
        emoji="🌐"
        title="Multiplayer"
        subtitle="Play with a friend over local WiFi or the internet"
        onPress={startMultiplayer}
        styles={styles}
      />
      <GameModeButton
        emoji="🎯"
        title="Drills"
        subtitle="Practise opening theory and endgame technique"
        onPress={startDrills}
        styles={styles}
      />
      <GameModeButton
        emoji="🧩"
        title="Tactics"
        subtitle="Solve puzzles from your own game mistakes"
        onPress={startTactics}
        styles={styles}
      />
      <TouchableOpacity style={styles.libraryLink} onPress={() => navigation.navigate('Library')}>
        <Text style={styles.libraryText}>📚 Game Library</Text>
      </TouchableOpacity>

      <Modal
        transparent
        animationType="slide"
        visible={showTimePicker}
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerHeading}>Set Up OTB Game</Text>
            <TimeControlPicker
              selected={selectedTimeControl}
              onSelect={setSelectedTimeControl}
            />
            <TouchableOpacity style={styles.startBtn} onPress={confirmOTB}>
              <Text style={styles.startBtnText}>Scan Board →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTimePicker(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
