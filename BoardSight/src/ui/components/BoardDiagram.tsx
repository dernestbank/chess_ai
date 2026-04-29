import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fenToBoard } from '../../domain/gamecore/pgn';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const PIECE_SYMBOLS: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

interface BoardDiagramProps {
  fen: string;
  legalTargets?: string[]; // squares to highlight as legal move targets
  onSquarePress?: (square: string) => void;
  flipped?: boolean;
  hintTo?: string; // highlight destination of hint move
}

export function BoardDiagram({
  fen,
  legalTargets = [],
  onSquarePress,
  flipped = false,
  hintTo,
}: BoardDiagramProps): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  const board = fenToBoard(fen);

  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;

  const handlePress = (square: string) => {
    if (onSquarePress) {
      onSquarePress(square);
    }
    setSelected(sq => (sq === square ? null : square));
  };

  return (
    <View style={styles.board}>
      {ranks.map((rank, rowIdx) => (
        <View key={rank} style={styles.row}>
          {files.map((file, colIdx) => {
            const square = file + rank;
            const piece = board[rowIdx]?.[colIdx];
            const isLight = (rowIdx + colIdx) % 2 === 0;
            const isSelected = selected === square;
            const isTarget = legalTargets.includes(square);
            const isHintTo = hintTo === square;

            return (
              <TouchableOpacity
                key={square}
                style={[
                  styles.square,
                  isLight ? styles.lightSquare : styles.darkSquare,
                  isSelected && styles.selectedSquare,
                  isTarget && styles.targetSquare,
                  isHintTo && styles.hintSquare,
                ]}
                onPress={() => handlePress(square)}
                activeOpacity={0.7}
              >
                {piece ? (
                  <Text style={styles.piece}>{PIECE_SYMBOLS[piece] ?? piece}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { aspectRatio: 1, width: '100%' },
  row: { flex: 1, flexDirection: 'row' },
  square: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lightSquare: { backgroundColor: '#f0d9b5' },
  darkSquare: { backgroundColor: '#b58863' },
  selectedSquare: { backgroundColor: '#f6f669' },
  targetSquare: { backgroundColor: '#cdd26a' },
  hintSquare: { backgroundColor: '#48bb78' },
  piece: { fontSize: 24 },
});
