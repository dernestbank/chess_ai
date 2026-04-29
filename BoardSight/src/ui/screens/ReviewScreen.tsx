import Clipboard from '@react-native-clipboard/clipboard';
import { Chess } from 'chess.js';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { initDb } from '../../data/db';
import { GameRow, MoveRow } from '../../data/models';
import { getAnalysis, getGame, getMovesForGame } from '../../data/repositories';
import { BoardDiagram } from '../components/BoardDiagram';
import { EvalTimeline } from '../components/EvalTimeline';
import { RecapCard } from '../components/RecapCard';
import { ReviewProps } from '../navigation/types';
import { ColorPalette, useTheme } from '../theme';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, paddingBottom: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
    errorText: { color: t.accentRed, fontSize: 16 },
    summaryCard: { backgroundColor: t.bgCard, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16 },
    resultText: { fontSize: 40, fontWeight: 'bold', color: t.accentGold, marginBottom: 4 },
    resultLabel: { fontSize: 16, color: t.text, marginBottom: 4 },
    players: { color: t.textMuted, fontSize: 14, marginBottom: 4 },
    meta: { color: t.textFaint, fontSize: 13 },
    accuracyRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    accuracyBox: { flex: 1, backgroundColor: t.bgCard, borderRadius: 12, padding: 16, alignItems: 'center' },
    accuracyValue: { fontSize: 28, fontWeight: 'bold', color: t.accentGreen },
    accuracyLabel: { color: t.textMuted, fontSize: 13, marginTop: 4 },
    timelineSection: { backgroundColor: t.bgCard, borderRadius: 12, padding: 16, marginBottom: 16, overflow: 'hidden' },
    section: { backgroundColor: t.bgCard, borderRadius: 12, padding: 16, marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: t.text, marginBottom: 12 },
    takeaway: { color: t.text, fontSize: 14, marginBottom: 6, lineHeight: 20 },
    noMoves: { color: t.textMuted, fontSize: 14 },
    replaySection: { backgroundColor: t.bgCard, borderRadius: 12, padding: 16, marginBottom: 16 },
    replayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    replayTitle: { fontSize: 16, fontWeight: 'bold', color: t.text },
    replayPosition: { fontSize: 13, color: t.textMuted },
    navRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 14, marginBottom: 10 },
    navBtn: { backgroundColor: t.accent, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', minWidth: 52 },
    navBtnDisabled: { backgroundColor: t.bgCard, opacity: 0.5 },
    navBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    scrubber: { marginTop: 4, marginBottom: 4 },
    scrubberContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 4 },
    scrubBtn: { width: 32, height: 32, borderRadius: 6, backgroundColor: t.bgCard, alignItems: 'center', justifyContent: 'center' },
    scrubBtnActive: { backgroundColor: t.accent },
    scrubBtnText: { color: t.textMuted, fontSize: 11, fontWeight: '600' },
    scrubBtnTextActive: { color: '#fff' },
    movePair: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
    moveNum: { color: t.textMuted, fontSize: 14, minWidth: 28 },
    moveCell: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, minWidth: 64 },
    moveCellHighlighted: { backgroundColor: t.bgAccent },
    moveSan: { color: t.text, fontSize: 14 },
    moveSanHighlighted: { color: t.accentGold, fontWeight: 'bold' },
    classSymbol: { color: t.accentRed, fontSize: 12, fontWeight: 'bold' },
    recapWrapper: { marginBottom: 16 },
    exportBtn: { backgroundColor: t.accent, padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
    copyBtn: { backgroundColor: t.bgCard },
    cardBtn: { backgroundColor: '#6b46c1' },
    exportBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  });
}

interface AnalysisPayload {
  moves: Array<{
    moveNumber: number;
    san: string;
    evalCp: number;
    classification: string | null;
  }>;
  accuracy: { white: number; black: number };
  takeaways?: string[];
}

const CLASSIFICATION_SYMBOL: Record<string, string> = {
  brilliant: '!!',
  excellent: '!',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

export function ReviewScreen({ navigation: _navigation, route }: ReviewProps): React.JSX.Element {
  const { gameId } = route.params;
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [game, setGame] = useState<GameRow | null>(null);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [fenHistory, setFenHistory] = useState<string[]>([STARTING_FEN]);
  const [replayIndex, setReplayIndex] = useState(0);

  const scrubberRef = useRef<ScrollView>(null);
  const recapCardRef = useRef<View>(null);

  // Auto-scroll the move scrubber so the active button stays visible.
  useEffect(() => {
    const x = replayIndex * (32 + 4); // (scrubBtn width + gap) × index
    scrubberRef.current?.scrollTo({ x, animated: true });
  }, [replayIndex]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initDb();
        const g = getGame(gameId);
        const m = getMovesForGame(gameId);
        const a = getAnalysis(gameId);
        if (!cancelled) {
          setGame(g);
          setMoves(m);

          // Build FEN history using chess.js
          const history: string[] = [STARTING_FEN];
          if (m.length > 0) {
            const chess = new Chess();
            for (const moveRow of m) {
              try {
                chess.move(moveRow.san);
                history.push(chess.fen());
              } catch {
                // If a move fails to parse, stop replay at this point
                break;
              }
            }
          }
          setFenHistory(history);
          setReplayIndex(m.length);

          if (a?.payload_json) {
            try {
              setAnalysis(JSON.parse(a.payload_json));
            } catch { /* ignore */ }
          }
        }
      } catch (err) {
        console.error('ReviewScreen load error:', err);
      } finally {
        if (!cancelled) { setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [gameId]);

  const pgn = game?.pgn ?? '';

  const handleExportPGN = async () => {
    if (!pgn) {
      Alert.alert('No PGN', 'This game has no recorded moves yet.');
      return;
    }
    try {
      await Share.share({ message: pgn, title: 'Chess Game PGN' });
    } catch (err) {
      Alert.alert('Export failed', String(err));
    }
  };

  const handleExportCard = async () => {
    if (!recapCardRef.current) { return; }
    try {
      const uri = await captureRef(recapCardRef, { format: 'png', quality: 1 });
      await Share.share({ url: uri, message: 'BoardSight game recap' });
    } catch (err) {
      Alert.alert('Export failed', String(err));
    }
  };

  const handleCopyPGN = () => {
    if (!pgn) {
      Alert.alert('No PGN', 'This game has no recorded moves yet.');
      return;
    }
    Clipboard.setString(pgn);
    Alert.alert('Copied', 'PGN copied to clipboard.');
  };

  const goFirst = () => setReplayIndex(0);
  const goPrev = () => setReplayIndex(i => Math.max(0, i - 1));
  const goNext = () => setReplayIndex(i => Math.min(fenHistory.length - 1, i + 1));
  const goLast = () => setReplayIndex(fenHistory.length - 1);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4299e1" />
      </View>
    );
  }

  if (!game) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Game not found.</Text>
      </View>
    );
  }

  const date = new Date(game.created_at).toLocaleDateString();
  const resultLabel =
    game.result === '1-0' ? 'White wins' :
    game.result === '0-1' ? 'Black wins' :
    game.result === '1/2-1/2' ? 'Draw' : 'In progress';

  const currentFen = fenHistory[replayIndex] ?? STARTING_FEN;
  const maxIndex = fenHistory.length - 1;

  // Group moves into pairs for display
  interface MovePair { number: number; white: MoveRow; black?: MoveRow }
  const pairs: MovePair[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const white = moves[i]; // always defined — i < moves.length
    if (!white) { continue; }
    pairs.push({ number: Math.floor(i / 2) + 1, white, black: moves[i + 1] });
  }

  const classificationFor = (san: string): string => {
    if (!analysis) { return ''; }
    const ann = analysis.moves.find(m => m.san === san);
    return ann?.classification ? (CLASSIFICATION_SYMBOL[ann.classification] ?? '') : '';
  };

  // replayIndex N means after move N. Move at index N-1 (0-based) is highlighted.
  // Move index in the flat moves array: replayIndex - 1
  const highlightedMoveIndex = replayIndex > 0 ? replayIndex - 1 : -1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Summary card */}
      <View style={styles.summaryCard}>
        <Text style={styles.resultText}>{game.result}</Text>
        <Text style={styles.resultLabel}>{resultLabel}</Text>
        <Text style={styles.players}>
          {game.player_white ?? 'White'} vs {game.player_black ?? 'Black'}
        </Text>
        <Text style={styles.meta}>{moves.length} moves · {date}</Text>
      </View>

      {/* Accuracy (from analysis) */}
      {analysis && (
        <View style={styles.accuracyRow}>
          <View style={styles.accuracyBox}>
            <Text style={styles.accuracyValue}>{analysis.accuracy.white}%</Text>
            <Text style={styles.accuracyLabel}>White accuracy</Text>
          </View>
          <View style={styles.accuracyBox}>
            <Text style={styles.accuracyValue}>{analysis.accuracy.black}%</Text>
            <Text style={styles.accuracyLabel}>Black accuracy</Text>
          </View>
        </View>
      )}

      {/* Eval timeline (centipawn chart) */}
      {analysis && analysis.moves.length > 0 && (
        <View style={styles.timelineSection}>
          <Text style={styles.sectionTitle}>Evaluation Chart</Text>
          <EvalTimeline
            evals={analysis.moves.map(m => m.evalCp)}
            replayIndex={replayIndex}
            onSeek={setReplayIndex}
          />
        </View>
      )}

      {/* LLM Takeaways */}
      {analysis?.takeaways && analysis.takeaways.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Takeaways</Text>
          {analysis.takeaways.map((t, i) => (
            <Text key={i} style={styles.takeaway}>• {t}</Text>
          ))}
        </View>
      )}

      {/* Board diagram + replay controls */}
      {moves.length > 0 && (
        <View style={styles.replaySection}>
          {/* Position indicator */}
          <View style={styles.replayHeader}>
            <Text style={styles.replayTitle}>Board Position</Text>
            <Text style={styles.replayPosition}>
              {replayIndex === 0
                ? 'Start'
                : `Move ${replayIndex} / ${moves.length}`}
            </Text>
          </View>

          {/* Board */}
          <BoardDiagram fen={currentFen} />

          {/* Navigation controls */}
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navBtn, replayIndex === 0 && styles.navBtnDisabled]}
              onPress={goFirst}
              disabled={replayIndex === 0}
            >
              <Text style={styles.navBtnText}>⏮</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navBtn, replayIndex === 0 && styles.navBtnDisabled]}
              onPress={goPrev}
              disabled={replayIndex === 0}
            >
              <Text style={styles.navBtnText}>◀</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navBtn, replayIndex === maxIndex && styles.navBtnDisabled]}
              onPress={goNext}
              disabled={replayIndex === maxIndex}
            >
              <Text style={styles.navBtnText}>▶</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navBtn, replayIndex === maxIndex && styles.navBtnDisabled]}
              onPress={goLast}
              disabled={replayIndex === maxIndex}
            >
              <Text style={styles.navBtnText}>⏭</Text>
            </TouchableOpacity>
          </View>

          {/* Move scrubber */}
          <ScrollView
            ref={scrubberRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.scrubber}
            contentContainerStyle={styles.scrubberContent}
          >
            {Array.from({ length: fenHistory.length }, (_, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.scrubBtn,
                  replayIndex === i && styles.scrubBtnActive,
                ]}
                onPress={() => setReplayIndex(i)}
              >
                <Text
                  style={[
                    styles.scrubBtnText,
                    replayIndex === i && styles.scrubBtnTextActive,
                  ]}
                >
                  {i === 0 ? '▲' : String(i)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Move list */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Moves</Text>
        {pairs.length === 0 ? (
          <Text style={styles.noMoves}>No moves recorded.</Text>
        ) : (
          pairs.map(pair => {
            const whiteIdx = (pair.number - 1) * 2;
            const blackIdx = whiteIdx + 1;
            const whiteHighlighted = whiteIdx === highlightedMoveIndex;
            const blackHighlighted = blackIdx === highlightedMoveIndex;
            const whiteClass = classificationFor(pair.white.san);
            const blackClass = pair.black ? classificationFor(pair.black.san) : '';

            return (
              <View key={pair.number} style={styles.movePair}>
                <Text style={styles.moveNum}>{pair.number}.</Text>
                <TouchableOpacity
                  style={[
                    styles.moveCell,
                    whiteHighlighted && styles.moveCellHighlighted,
                  ]}
                  onPress={() => setReplayIndex(whiteIdx + 1)}
                >
                  <Text style={[styles.moveSan, whiteHighlighted && styles.moveSanHighlighted]}>
                    {pair.white.san}
                    {whiteClass ? (
                      <Text style={styles.classSymbol}>{whiteClass}</Text>
                    ) : null}
                  </Text>
                </TouchableOpacity>
                {pair.black && (
                  <TouchableOpacity
                    style={[
                      styles.moveCell,
                      blackHighlighted && styles.moveCellHighlighted,
                    ]}
                    onPress={() => setReplayIndex(blackIdx + 1)}
                  >
                    <Text style={[styles.moveSan, blackHighlighted && styles.moveSanHighlighted]}>
                      {pair.black.san}
                      {blackClass ? (
                        <Text style={styles.classSymbol}>{blackClass}</Text>
                      ) : null}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Recap card (for PNG export) */}
      {analysis && (
        <View ref={recapCardRef} collapsable={false} style={styles.recapWrapper}>
          <RecapCard
            playerWhite={game.player_white ?? 'White'}
            playerBlack={game.player_black ?? 'Black'}
            result={game.result}
            date={new Date(game.created_at).toLocaleDateString()}
            accuracyWhite={analysis.accuracy.white}
            accuracyBlack={analysis.accuracy.black}
            moves={moves.length}
          />
        </View>
      )}

      {/* Export buttons */}
      {analysis && (
        <TouchableOpacity style={[styles.exportBtn, styles.cardBtn]} onPress={handleExportCard}>
          <Text style={styles.exportBtnText}>🖼 Share Recap Card</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.exportBtn} onPress={handleExportPGN}>
        <Text style={styles.exportBtnText}>↑ Share PGN</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.exportBtn, styles.copyBtn]} onPress={handleCopyPGN}>
        <Text style={styles.exportBtnText}>⎘ Copy PGN</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

