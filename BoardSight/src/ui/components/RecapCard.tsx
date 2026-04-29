import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface RecapCardProps {
  playerWhite: string;
  playerBlack: string;
  result: string;
  date: string;
  accuracyWhite: number;
  accuracyBlack: number;
  moves: number;
}

export function RecapCard({
  playerWhite,
  playerBlack,
  result,
  date,
  accuracyWhite,
  accuracyBlack,
  moves,
}: RecapCardProps): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>BoardSight Chess</Text>
      <View style={styles.players}>
        <View style={styles.player}>
          <Text style={styles.playerColor}>⬜</Text>
          <Text style={styles.playerName}>{playerWhite}</Text>
          <Text style={styles.accuracy}>{accuracyWhite}%</Text>
        </View>
        <Text style={styles.result}>{result}</Text>
        <View style={styles.player}>
          <Text style={styles.playerColor}>⬛</Text>
          <Text style={styles.playerName}>{playerBlack}</Text>
          <Text style={styles.accuracy}>{accuracyBlack}%</Text>
        </View>
      </View>
      <Text style={styles.meta}>{moves} moves · {date}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#0f3460', borderRadius: 16, padding: 20 },
  title: { color: '#4299e1', fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  players: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  player: { alignItems: 'center', flex: 1 },
  playerColor: { fontSize: 20, marginBottom: 4 },
  playerName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  accuracy: { color: '#48bb78', fontSize: 12, marginTop: 2 },
  result: { fontSize: 22, fontWeight: 'bold', color: '#fbd38d', paddingHorizontal: 12 },
  meta: { color: '#718096', fontSize: 12, textAlign: 'center' },
});
