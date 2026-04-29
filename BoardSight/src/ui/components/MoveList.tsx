import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { Move } from '../../domain/gamecore/types';

interface MoveListProps {
  moves: Move[];
}

interface MovePair {
  moveNumber: number;
  white: string;
  black?: string;
}

function groupMoves(moves: Move[]): MovePair[] {
  const pairs: MovePair[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const white = moves[i]; // always defined — i < moves.length
    if (!white) { continue; }
    pairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: white.san,
      black: moves[i + 1]?.san,
    });
  }
  return pairs;
}

export function MoveList({ moves }: MoveListProps): React.JSX.Element {
  const pairs = groupMoves(moves);
  return (
    <View style={styles.container}>
      <FlatList
        data={pairs}
        keyExtractor={item => String(item.moveNumber)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.num}>{item.moveNumber}.</Text>
            <Text style={styles.move}>{item.white}</Text>
            <Text style={styles.move}>{item.black ?? ''}</Text>
          </View>
        )}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No moves yet</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#0f3460', paddingVertical: 8, maxHeight: 48 },
  list: { paddingHorizontal: 12, alignItems: 'center' },
  row: { flexDirection: 'row', marginRight: 8, alignItems: 'center' },
  num: { color: '#718096', fontSize: 13, marginRight: 2 },
  move: { color: '#e2e8f0', fontSize: 13, marginRight: 6, minWidth: 36 },
  empty: { color: '#718096', fontSize: 13, paddingHorizontal: 12 },
});
