/**
 * TacticsScreen — solve puzzles extracted from the user's own game mistakes.
 *
 * Shows a position from a real game where the player blundered, and asks
 * them to find the best move. Reveals the engine recommendation after they try.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { BoardDiagram } from '../components/BoardDiagram';
import { Square } from '../../domain/gamecore/types';
import { extractPuzzlesFromLibrary, TacticsPuzzle } from '../../domain/tactics';
import { GameCore, createGameCore } from '../../domain/gamecore';
import { ColorPalette, useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Tactics'>;

type PuzzlePhase = 'thinking' | 'correct' | 'wrong' | 'revealed';

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: t.bgCard },
    headerTitle: { color: t.text, fontSize: 16, fontWeight: 'bold' },
    scoreText: { color: t.accentGreen, fontSize: 14, fontWeight: '600' },
    prompt: { color: t.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 10 },
    boardWrapper: { width: '100%', aspectRatio: 1 },
    feedback: { padding: 14, marginHorizontal: 16, marginTop: 12, borderRadius: 10 },
    feedbackCorrect: { backgroundColor: t.accentGreen + '33' },
    feedbackWrong: { backgroundColor: t.accentRed + '33' },
    feedbackReveal: { backgroundColor: t.accent + '33' },
    feedbackText: { color: t.text, fontSize: 14, textAlign: 'center' },
    controls: { flexDirection: 'row', justifyContent: 'center', padding: 16, gap: 12 },
    revealBtn: { backgroundColor: t.border, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
    revealBtnText: { color: t.textMuted, fontSize: 14 },
    nextBtn: { backgroundColor: t.accent, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 10 },
    nextBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
    loadingText: { color: t.textMuted, marginTop: 16, textAlign: 'center' },
    emptyTitle: { color: t.text, fontSize: 20, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
    emptyDesc: { color: t.textFaint, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    backBtn: { marginTop: 24, backgroundColor: t.bgCard, padding: 14, borderRadius: 10 },
    backBtnText: { color: t.accent, fontSize: 14 },
  });
}

export function TacticsScreen({ navigation }: Props): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [puzzles, setPuzzles] = useState<TacticsPuzzle[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<PuzzlePhase>('thinking');
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [core, setCore] = useState<GameCore | null>(null);
  const [score, setScore] = useState({ correct: 0, tried: 0 });

  useEffect(() => {
    extractPuzzlesFromLibrary().then(ps => {
      setPuzzles(ps);
      setLoading(false);
    });
  }, []);

  const puzzle = puzzles[index] ?? null;

  // Build a fresh GameCore at the puzzle FEN whenever puzzle changes
  useEffect(() => {
    if (!puzzle) { return; }
    const c = createGameCore({
      id: 'tactics-' + puzzle.gameId + puzzle.moveNumber,
      mode: 'bot',
      boardOrientation: 'white-bottom',
      assistLevel: 'off',
      startFen: puzzle.puzzleFen,
    });
    setCore(c);
    setPhase('thinking');
    setSelectedSquare(null);
    setLegalTargets([]);
  }, [puzzle]);

  const handleSquarePress = (square: Square) => {
    if (!core || phase !== 'thinking') { return; }

    if (selectedSquare === null) {
      const targets = core.getLegalMovesFrom(square);
      if (targets.length > 0) {
        setSelectedSquare(square);
        setLegalTargets(targets);
      }
    } else if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalTargets([]);
    } else if (legalTargets.includes(square)) {
      // Player made a move — check if it matches the best move
      const uci = selectedSquare + square;
      const isCorrect =
        puzzle != null &&
        (uci === puzzle.bestMove || uci.startsWith(puzzle.bestMove.slice(0, 4)));

      setScore(s => ({ correct: s.correct + (isCorrect ? 1 : 0), tried: s.tried + 1 }));
      setPhase(isCorrect ? 'correct' : 'wrong');
      setSelectedSquare(null);
      setLegalTargets([]);
    } else {
      const targets = core.getLegalMovesFrom(square);
      setSelectedSquare(square);
      setLegalTargets(targets.length > 0 ? targets : []);
    }
  };

  const handleReveal = () => setPhase('revealed');

  const handleNext = () => {
    if (index + 1 < puzzles.length) {
      setIndex(i => i + 1);
    } else {
      Alert.alert(
        'All puzzles done!',
        `You got ${score.correct} / ${score.tried} correct.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4299e1" size="large" />
        <Text style={styles.loadingText}>Scanning your games for puzzles…</Text>
      </View>
    );
  }

  if (puzzles.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No puzzles yet</Text>
        <Text style={styles.emptyDesc}>
          Play and analyse a few games. Blunders from your games will appear here as puzzles.
        </Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // puzzle is always non-null here: puzzles.length > 0 and index is bounded
  if (!puzzle) { return <View style={styles.center} />; }

  const fen = core?.getState().fen ?? puzzle.puzzleFen ?? '';
  const flipped = puzzle.playerColor === 'b';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Puzzle {index + 1} / {puzzles.length}
        </Text>
        <Text style={styles.scoreText}>
          ✓ {score.correct} / {score.tried}
        </Text>
      </View>

      <Text style={styles.prompt}>
        {puzzle.playerColor === 'w' ? '⬜ White' : '⬛ Black'} to move
        {'  ·  '}Move {puzzle.moveNumber}
      </Text>

      {/* Board */}
      <View style={styles.boardWrapper}>
        <BoardDiagram
          fen={fen}
          legalTargets={legalTargets}
          onSquarePress={handleSquarePress}
          flipped={flipped}
        />
      </View>

      {/* Feedback */}
      {phase === 'correct' && (
        <View style={[styles.feedback, styles.feedbackCorrect]}>
          <Text style={styles.feedbackText}>✓ Correct! Best move: {puzzle.bestMove}</Text>
        </View>
      )}
      {phase === 'wrong' && (
        <View style={[styles.feedback, styles.feedbackWrong]}>
          <Text style={styles.feedbackText}>✗ Not quite.</Text>
        </View>
      )}
      {phase === 'revealed' && (
        <View style={[styles.feedback, styles.feedbackReveal]}>
          <Text style={styles.feedbackText}>Best: {puzzle.bestMove}  ({puzzle.evalDelta} cp)</Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {phase === 'thinking' && (
          <TouchableOpacity style={styles.revealBtn} onPress={handleReveal}>
            <Text style={styles.revealBtnText}>Show answer</Text>
          </TouchableOpacity>
        )}
        {(phase === 'correct' || phase === 'wrong' || phase === 'revealed') && (
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextBtnText}>Next puzzle →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

