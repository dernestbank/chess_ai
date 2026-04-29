import React from 'react';
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DrillProps } from '../navigation/types';
import { useGameService } from '../../domain/gameService';
import { DRILLS, Drill } from '../../domain/drills';
import type { SessionConfig } from '../../domain/gamecore/types';
import { ColorPalette, useTheme } from '../theme';

const SECTIONS = [
  { title: '♟ Opening Drills', data: DRILLS.filter(d => d.category === 'opening') },
  { title: '♔ Endgame Drills', data: DRILLS.filter(d => d.category === 'endgame') },
];

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    list: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, paddingBottom: 40 },
    sectionHeader: {
      fontSize: 15, fontWeight: 'bold', color: t.textMuted,
      textTransform: 'uppercase', letterSpacing: 1, paddingVertical: 12, paddingTop: 20,
    },
    card: { backgroundColor: t.bgCard, borderRadius: 14, padding: 16 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    cardName: { fontSize: 16, fontWeight: 'bold', color: t.text, flex: 1 },
    colorBadge: { fontSize: 12, color: t.textMuted, marginLeft: 8 },
    cardDesc: { fontSize: 13, color: t.textMuted, lineHeight: 18, marginBottom: 10 },
    startHint: { fontSize: 12, color: t.accent, fontWeight: '600' },
    sep: { height: 10 },
  });
}

export function DrillScreen({ navigation }: DrillProps): React.JSX.Element {
  const { startNewGame } = useGameService();
  const theme = useTheme();
  const styles = makeStyles(theme);

  const handleStart = async (drill: Drill) => {
    const config: SessionConfig = {
      id: Math.random().toString(36).slice(2),
      mode: 'bot',
      boardOrientation: drill.targetColor === 'w' ? 'white-bottom' : 'black-bottom',
      assistLevel: 'light',
      botDifficulty: 'intermediate',
      startFen: drill.startFen,
    };
    const gId = await startNewGame(config);
    navigation.navigate('BotGame', {
      gameId: gId,
      difficulty: 'intermediate',
      startFen: drill.startFen,
      drillName: drill.name,
    });
  };

  const renderDrill = ({ item }: { item: Drill }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleStart(item)}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{item.name}</Text>
        <Text style={styles.colorBadge}>
          {item.targetColor === 'w' ? '⬜ White' : '⬛ Black'}
        </Text>
      </View>
      <Text style={styles.cardDesc}>{item.description}</Text>
      <Text style={styles.startHint}>Tap to start →</Text>
    </TouchableOpacity>
  );

  return (
    <SectionList
      style={styles.list}
      contentContainerStyle={styles.content}
      sections={SECTIONS}
      keyExtractor={item => item.id}
      renderItem={renderDrill}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionHeader}>{section.title}</Text>
      )}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
    />
  );
}

