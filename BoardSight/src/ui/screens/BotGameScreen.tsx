import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { BotGameProps } from '../navigation/types';
import { Clock } from '../components/Clock';
import { MoveList } from '../components/MoveList';
import { BoardDiagram } from '../components/BoardDiagram';
import { useGameService } from '../../domain/gameService';
import { BotEngine } from '../../domain/botEngine';
import { Color, Square } from '../../domain/gamecore/types';
import { getSettings } from '../../domain/settings';
import { getComment } from '../../domain/commentator';
import { ColorPalette, useTheme } from '../theme';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    playerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: t.bgAccent, gap: 12 },
    playerName: { color: t.text, fontSize: 15, fontWeight: 'bold' },
    thinking: { color: t.textMuted, fontStyle: 'italic', fontSize: 13 },
    boardWrapper: { width: '100%', aspectRatio: 1 },
    drillBanner: { backgroundColor: t.bgCard, paddingVertical: 6, paddingHorizontal: 16 },
    drillBannerText: { color: t.accent, fontSize: 13, fontWeight: '600' },
    hintBanner: { backgroundColor: t.bgCard, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
    hintText: { color: t.text, fontSize: 14 },
    hintDismiss: { color: t.textMuted, fontSize: 16, fontWeight: 'bold' },
    commentBanner: { backgroundColor: t.bgCard, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
    commentText: { color: t.accentGreen, fontSize: 13, flex: 1 },
    controls: { flexDirection: 'row', padding: 8, gap: 8, backgroundColor: t.bgAccent },
    controlBtn: { flex: 1, backgroundColor: t.bgCard, padding: 12, borderRadius: 8, alignItems: 'center' },
    controlBtnText: { color: t.text, fontSize: 13 },
    resignBtn: { backgroundColor: t.accentRed },
    disabled: { opacity: 0.4 },
  });
}

export function BotGameScreen({ navigation, route }: BotGameProps): React.JSX.Element {
  const { gameId, difficulty, drillName } = route.params;
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { core, gameState, applyMove, undoMove, startClock, endGame, reset } = useGameService();

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [botThinking, setBotThinking] = useState(false);
  const [hint, setHint] = useState<{ from: Square; to: Square } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [assistLevel, setAssistLevel] = useState<'off' | 'light' | 'on'>('off');
  const [comment, setComment] = useState<string | null>(null);

  const botRef = useRef<BotEngine | null>(null);
  const playerColor = 'w' as Color; // player is always white vs bot

  // Initialize bot engine
  useEffect(() => {
    botRef.current = new BotEngine({ difficulty });
    return () => {
      botRef.current?.destroy();
      botRef.current = null;
    };
  }, [difficulty]);

  // Load settings on mount
  useEffect(() => {
    getSettings().then(s => setAssistLevel(s.assistLevel));
  }, []);

  // Start the game & clock when screen mounts
  useEffect(() => {
    startClock('w');
    return () => {
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only lifecycle
  }, []);

  // Watch for turn changes: bot moves + auto-hint when assist is 'on'
  useEffect(() => {
    if (!gameState || gameState.result !== '*') { return; }

    const turn = gameState.fen.split(' ')[1];
    const isPlayerTurn = (turn === 'w') === (playerColor === 'w');

    if (!isPlayerTurn && !botThinking) {
      _doBotMove();
    } else if (isPlayerTurn && assistLevel === 'on' && !hintLoading) {
      // Auto-show best move when assist is fully on
      handleHint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tied to move list / turn only; expanding deps retriggers bot/hint loops
  }, [gameState?.moves.length]);

  const _doBotMove = useCallback(async () => {
    if (!gameState || !botRef.current) { return; }
    setBotThinking(true);
    try {
      const moveStr = await botRef.current.getBestMove(gameState.fen);
      if (moveStr && moveStr.length >= 4) {
        const from = moveStr.slice(0, 2) as Square;
        const to = moveStr.slice(2, 4) as Square;
        const promo = moveStr[4] as 'q' | 'r' | 'b' | 'n' | undefined;
        applyMove(from, to, promo || undefined);
      }
    } finally {
      setBotThinking(false);
    }
  }, [gameState, applyMove]);

  const handleSquarePress = (square: Square) => {
    if (!gameState || gameState.result !== '*') { return; }
    if (botThinking) { return; }

    // Check it's player's turn
    const turn = gameState.fen.split(' ')[1];
    if (turn !== playerColor) { return; }

    setHint(null); // clear hint on tap

    if (selectedSquare === null) {
      // Select a piece
      const targets = core?.getLegalMovesFrom(square) ?? [];
      if (targets.length > 0) {
        setSelectedSquare(square);
        setLegalTargets(targets);
      }
    } else if (selectedSquare === square) {
      // Deselect
      setSelectedSquare(null);
      setLegalTargets([]);
    } else if (legalTargets.includes(square)) {
      // Execute move
      const ok = applyMove(selectedSquare, square);
      setSelectedSquare(null);
      setLegalTargets([]);
      if (ok) {
        Vibration.vibrate(30); // move confirmation haptic
        // Fetch commentator comment asynchronously
        const newState = useGameService.getState().gameState;
        const lastMove = newState?.moves[newState.moves.length - 1];
        if (lastMove) {
          getComment(lastMove.fen, lastMove.san).then(c => setComment(c));
        }
      }
    } else {
      // Try selecting a different piece
      const targets = core?.getLegalMovesFrom(square) ?? [];
      if (targets.length > 0) {
        setSelectedSquare(square);
        setLegalTargets(targets);
      } else {
        setSelectedSquare(null);
        setLegalTargets([]);
      }
    }
  };

  const handleHint = useCallback(async () => {
    if (!gameState || !botRef.current || hintLoading) { return; }
    setHintLoading(true);
    setHint(null);
    try {
      // Use a fresh bot instance at advanced difficulty for best hint
      const hintBot = new BotEngine({ difficulty: 'advanced' });
      const moveStr = await hintBot.getBestMove(gameState.fen);
      hintBot.destroy();
      if (moveStr && moveStr.length >= 4) {
        const from = moveStr.slice(0, 2) as Square;
        const to = moveStr.slice(2, 4) as Square;
        setHint({ from, to });
        setSelectedSquare(from);
        setLegalTargets(core?.getLegalMovesFrom(from) ?? []);
      }
    } finally {
      setHintLoading(false);
    }
  }, [gameState, core, hintLoading]);

  const handleUndo = () => {
    // Undo twice: player move + bot's last response
    undoMove();
    undoMove();
    setSelectedSquare(null);
    setLegalTargets([]);
    setBotThinking(false);
  };

  const handleResign = () => {
    Alert.alert('Resign', 'Are you sure you want to resign?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resign',
        style: 'destructive',
        onPress: () => {
          endGame(playerColor === 'w' ? '0-1' : '1-0');
          navigation.replace('Review', { gameId });
        },
      },
    ]);
  };

  const fen = gameState?.fen ?? INITIAL_FEN;
  const moves = gameState?.moves ?? [];
  const whiteMs = gameState?.clock.whiteMs ?? 180_000;
  const blackMs = gameState?.clock.blackMs ?? 180_000;
  const activeColor = gameState?.clock.activeColor ?? null;
  const isGameOver = gameState ? gameState.result !== '*' : false;

  // Show game over banner
  useEffect(() => {
    if (isGameOver && gameState) {
      Vibration.vibrate([0, 100, 80, 100, 80, 100]); // game-end haptic
      const resultText =
        gameState.result === '1-0' ? 'White wins!' :
        gameState.result === '0-1' ? 'Black wins!' : 'Draw!';
      Alert.alert('Game Over', resultText, [
        { text: 'Review', onPress: () => navigation.replace('Review', { gameId }) },
        { text: 'New Game', onPress: () => navigation.replace('StartGame') },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alert once when isGameOver flips; full deps re-show alert
  }, [isGameOver]);

  return (
    <View style={styles.container}>
      {/* Drill name banner */}
      {drillName && (
        <View style={styles.drillBanner}>
          <Text style={styles.drillBannerText}>🎯 {drillName}</Text>
        </View>
      )}

      {/* Bot side info */}
      <View style={styles.playerRow}>
        <Text style={styles.playerName}>🤖 Bot ({difficulty})</Text>
        {botThinking && <Text style={styles.thinking}>thinking…</Text>}
      </View>

      {/* Bot clock (black) */}
      <Clock side="black" timeMs={blackMs} isActive={activeColor === 'b'} />

      {/* Interactive board */}
      <View style={styles.boardWrapper}>
        <BoardDiagram
          fen={fen}
          legalTargets={legalTargets}
          onSquarePress={handleSquarePress}
          flipped={playerColor === 'b'}
          hintTo={hint?.to}
        />
      </View>

      {/* Player clock (white) */}
      <Clock side="white" timeMs={whiteMs} isActive={activeColor === 'w'} />

      {/* Move list */}
      <MoveList moves={moves} />

      {hint && (
        <View style={styles.hintBanner}>
          <Text style={styles.hintText}>
            💡 Best move: {hint.from} → {hint.to}
          </Text>
          <TouchableOpacity onPress={() => setHint(null)}>
            <Text style={styles.hintDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {comment && (
        <View style={styles.commentBanner}>
          <Text style={styles.commentText}>🎙 {comment}</Text>
          <TouchableOpacity onPress={() => setComment(null)}>
            <Text style={styles.hintDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {assistLevel !== 'off' && (
          <TouchableOpacity style={styles.controlBtn} onPress={handleHint} disabled={hintLoading}>
            <Text style={[styles.controlBtnText, hintLoading && styles.disabled]}>
              {hintLoading ? '…' : '💡 Hint'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.controlBtn} onPress={handleUndo} disabled={moves.length < 2}>
          <Text style={[styles.controlBtnText, moves.length < 2 && styles.disabled]}>↩ Undo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.controlBtn, styles.resignBtn]} onPress={handleResign}>
          <Text style={styles.controlBtnText}>🏳 Resign</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

