import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { LiveGameProps } from '../navigation/types';
import { Clock } from '../components/Clock';
import { MoveList } from '../components/MoveList';
import { BoardDiagram } from '../components/BoardDiagram';
import { ConfirmMoveSheet } from '../components/ConfirmMoveSheet';
import { cvModule, MoveCandidate } from '../../native/cvModule';
import { useGameService } from '../../domain/gameService';
import { useAppStore } from '../../domain/stateMachine';
import { ClockState, GameResult, Square } from '../../domain/gamecore/types';
import { instrumentation } from '../../domain/instrumentation';
import { P2PMessage } from '../../domain/multiplayer/p2p';
import { getTransport, setTransportType } from '../../domain/multiplayer/activeTransport';
import { getSettings } from '../../domain/settings';
import { ColorPalette, useTheme } from '../theme';

const CONFIDENCE_THRESHOLD = 0.85;

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    boardWrapper: { width: '100%', aspectRatio: 1, position: 'relative' },
    pauseOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center', justifyContent: 'center',
    },
    pauseText: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
    guestBadge: {
      position: 'absolute', bottom: 8, right: 8,
      backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    },
    guestBadgeText: { color: t.accentGold, fontSize: 12 },
    latencyPill: {
      position: 'absolute', top: 8, right: 8,
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
    },
    latencyDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
    latencyText: { color: '#fff', fontSize: 11 },
    controls: { flexDirection: 'row', padding: 8, gap: 8, backgroundColor: t.bgCard },
    controlBtn: { flex: 1, backgroundColor: t.border, padding: 12, borderRadius: 8, alignItems: 'center' },
    controlBtnText: { color: t.text, fontSize: 13 },
    resignBtn: { backgroundColor: t.accentRed + '44' },
  });
}

export function LiveGameScreen({ navigation, route }: LiveGameProps): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { gameId, isMultiplayer = false, role, connectionType = 'p2p' } = route.params;
  const isHost = isMultiplayer && role === 'host';
  const isGuest = isMultiplayer && role === 'guest';

  // Ensure transport type matches how the connection was established
  useEffect(() => {
    setTransportType(connectionType);
  }, [connectionType]);

  const { core, gameState, loadGame, applyMove, undoMove, pauseGame, resumeGame, endGame, syncToFen } =
    useGameService();
  const { dispatch } = useAppStore();

  const [pendingCandidate, setPendingCandidate] = useState<MoveCandidate | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [highlightFrom, setHighlightFrom] = useState<Square | null>(null);

  // Two-phone clock sync: guest receives clock state from host
  const [peerClock, setPeerClock] = useState<Pick<ClockState, 'whiteMs' | 'blackMs'> | null>(null);
  const [refereeMode, setRefereeMode] = useState(true);
  // Latency approximation derived from CLOCK_SYNC sentAt timestamp
  const [latencyMs, setLatencyMs] = useState(0);

  // Track whether we already navigated to avoid double-navigate
  const navigatedToReview = useRef(false);

  // Load settings
  useEffect(() => {
    getSettings().then(s => setRefereeMode(s.enableRefereeMode));
  }, []);

  // Load game on mount (if not already loaded by StartGameScreen)
  useEffect(() => {
    if (!gameState) {
      loadGame(gameId).catch(console.error);
    }
  }, [gameId]);

  // ── P2P multiplayer wiring ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isMultiplayer) return;

    const handleMessage = (msg: P2PMessage) => {
      switch (msg.type) {
        case 'MOVE': {
          // Guest: apply move received from host (san field is UCI format: "e2e4")
          if (isGuest) {
            const from = msg.san.slice(0, 2) as Square;
            const to = msg.san.slice(2, 4) as Square;
            const promo = msg.san.length > 4 ? (msg.san[4] as 'q' | 'r' | 'b' | 'n') : undefined;
            applyMove(from, to, promo);
          }
          break;
        }
        case 'CLOCK_SYNC': {
          // Both phones: sync displayed clock; measure one-way latency from sentAt
          setPeerClock({ whiteMs: msg.whiteMs, blackMs: msg.blackMs });
          const oneWay = msg.sentAt != null ? Date.now() - msg.sentAt : 0;
          setLatencyMs(oneWay);
          instrumentation.logP2PSync(oneWay, 'host_to_guest');
          break;
        }
        case 'GAME_OVER': {
          if (!navigatedToReview.current) {
            navigatedToReview.current = true;
            dispatch({ type: 'GAME_OVER', result: msg.result as GameResult });
            navigation.replace('Review', { gameId });
          }
          break;
        }
        case 'CLOCK_TAP': {
          // Host: guest is requesting a manual clock switch
          if (isHost) {
            const state = useGameService.getState().gameState;
            if (state?.clock.isRunning) {
              // Switch clock sides (same as manual tap)
              const newColor = state.clock.activeColor === 'w' ? 'b' : 'w';
              useGameService.getState().startClock(newColor);
              // Sync updated clock back to guest
              const updated = useGameService.getState().gameState?.clock;
              if (updated) {
                getTransport().sendClockSync({ whiteMs: updated.whiteMs, blackMs: updated.blackMs });
              }
            }
          }
          break;
        }
        case 'CORRECTION_REQUEST': {
          // Host: guest is asking to undo the last move
          if (isHost) {
            Alert.alert(
              'Undo request',
              'Your opponent is requesting to undo the last move.',
              [
                {
                  text: 'Allow',
                  onPress: () => {
                    undoMove();
                    const newFen = useGameService.getState().gameState?.fen ?? '';
                    getTransport().sendMessage({ type: 'CORRECTION_APPROVED', fen: newFen });
                  },
                },
                {
                  text: 'Deny',
                  style: 'cancel',
                  onPress: () => getTransport().sendMessage({ type: 'CORRECTION_DENIED' }),
                },
              ],
            );
          }
          break;
        }
        case 'CORRECTION_APPROVED': {
          // Guest: host approved undo — sync our board
          if (isGuest) {
            syncToFen(msg.fen);
          }
          break;
        }
        case 'CORRECTION_DENIED': {
          if (isGuest) {
            Alert.alert('Undo denied', 'The host declined your undo request.');
          }
          break;
        }
        case 'PING': {
          getTransport().sendMessage({ type: 'PONG' });
          break;
        }
        default:
          break;
      }
    };

    // Re-register callbacks for this screen (lobby registered earlier but we need new handlers)
    getTransport().setCallbacks({
      onMessage: handleMessage,
      onConnect: () => {},
      onDisconnect: () => {
        Alert.alert(
          'Peer disconnected',
          'Your opponent has disconnected.',
          [{ text: 'OK' }],
        );
      },
    });

    return () => {
      // Don't disconnect on unmount — navigating to Review keeps session live briefly
    };
  }, [isMultiplayer, isGuest, applyMove, dispatch, gameId, navigation]);

  // ── CV session (OTB + host in multiplayer) ─────────────────────────────────
  useEffect(() => {
    // Guests don't run CV — they mirror the host's board
    if (isGuest) return;
    if (!gameState) return;

    instrumentation.startSession();

    cvModule.startSession(
      { boardOrientation: 'white-bottom', targetFps: 15, confidenceThreshold: CONFIDENCE_THRESHOLD },
      {
        onMoveCandidate: (candidate: MoveCandidate) => {
          if (isPaused) return;
          const receiveTime = Date.now();
          const latencyMs = receiveTime - candidate.timestamp;

          if (candidate.confidence >= CONFIDENCE_THRESHOLD) {
            const ok = applyMove(candidate.fromSquare as Square, candidate.toSquare as Square, candidate.promotion);
            instrumentation.logMoveCandidate({
              confidence: candidate.confidence,
              autoAccepted: true,
              manuallyCorrect: ok,
              latencyMs,
            });

            if (ok) { Vibration.vibrate(30); } // move confirmation haptic
            if (ok && isHost) {
              // Send move + clock snapshot to guest
              const clock = useGameService.getState().gameState?.clock;
              getTransport().sendMove(
                { type: 'MOVE', san: candidate.fromSquare + candidate.toSquare, fen: useGameService.getState().gameState?.fen ?? '', seq: 0 },
                { whiteMs: clock?.whiteMs ?? 0, blackMs: clock?.blackMs ?? 0 },
              );
            }

            if (!ok && refereeMode) {
              Alert.alert(
                'Illegal move detected',
                `${candidate.fromSquare}→${candidate.toSquare} is not legal. Please correct the board.`,
                [{ text: 'OK' }],
              );
            }
          } else {
            instrumentation.logMoveCandidate({
              confidence: candidate.confidence,
              autoAccepted: false,
              manuallyCorrect: false,
              latencyMs,
            });
            setHighlightFrom(candidate.fromSquare as Square);
            setPendingCandidate(candidate);
          }
        },
      },
    );

    return () => cvModule.stopSession();
  }, [gameState, isPaused, isGuest, isHost]);

  const handlePause = () => {
    setIsPaused(p => {
      if (!p) {
        pauseGame();
        cvModule.pauseTracking(true);
        dispatch({ type: 'PAUSE' });
      } else {
        resumeGame();
        cvModule.pauseTracking(false);
        dispatch({ type: 'RESUME' });
      }
      return !p;
    });
  };

  const handleResign = () => {
    Alert.alert('Resign', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resign',
        style: 'destructive',
        onPress: () => {
          const turn = gameState?.fen.split(' ')[1];
          const result = turn === 'w' ? '0-1' : '1-0';
          endGame(result);
          dispatch({ type: 'GAME_OVER', result });
          if (isHost || isGuest) {
            getTransport().sendMessage({ type: 'GAME_OVER', result });
          }
          if (!navigatedToReview.current) {
            navigatedToReview.current = true;
            navigation.replace('Review', { gameId });
          }
        },
      },
    ]);
  };

  const handleTakeback = () => {
    Alert.alert('Takeback', 'Undo the last move?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo', onPress: () => undoMove() },
    ]);
  };

  const handleConfirmMove = (from: Square, to: Square) => {
    const ok = applyMove(from, to, pendingCandidate?.promotion);
    if (ok && isHost) {
      const clock = useGameService.getState().gameState?.clock;
      getTransport().sendMove(
        { type: 'MOVE', san: from + to, fen: useGameService.getState().gameState?.fen ?? '', seq: 0 },
        { whiteMs: clock?.whiteMs ?? 0, blackMs: clock?.blackMs ?? 0 },
      );
    }
    setPendingCandidate(null);
    setHighlightFrom(null);
  };

  const handleDismissCandidate = () => {
    setPendingCandidate(null);
    setHighlightFrom(null);
  };

  // Host: send clock sync periodically (every 5s) to keep guest in sync
  useEffect(() => {
    if (!isHost) return;
    const interval = setInterval(() => {
      const clock = useGameService.getState().gameState?.clock;
      if (clock) {
        getTransport().sendClockSync({ whiteMs: clock.whiteMs, blackMs: clock.blackMs });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isHost]);

  // Watch for game over
  useEffect(() => {
    if (gameState?.result && gameState.result !== '*') {
      Vibration.vibrate([0, 100, 80, 100, 80, 100]); // game-end haptic
      const summary = instrumentation.summarizeSession();
      const label =
        gameState.result === '1-0' ? 'White wins!' :
        gameState.result === '0-1' ? 'Black wins!' : 'Draw!';
      const correctionNote = summary
        ? `\nManual corrections: ${(summary.correctionRate * 100).toFixed(0)}%`
        : '';
      Alert.alert('Game Over', label + correctionNote, [
        {
          text: 'Review',
          onPress: () => {
            if (!navigatedToReview.current) {
              navigatedToReview.current = true;
              navigation.replace('Review', { gameId });
            }
          },
        },
      ]);
    }
  }, [gameState?.result]);

  // Latency pill appearance
  const latencyDotColor = latencyMs < 50 ? '#48bb78' : latencyMs <= 150 ? '#fbd38d' : '#fc8181';
  const latencyLabel = latencyMs < 50 ? '< 50ms' : latencyMs <= 150 ? `${latencyMs}ms` : '> 150ms';

  const fen = gameState?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const moves = gameState?.moves ?? [];
  const clock = gameState?.clock;

  // In multiplayer, display peer-synced clock values if available
  const whiteMs = peerClock?.whiteMs ?? clock?.whiteMs ?? 0;
  const blackMs = peerClock?.blackMs ?? clock?.blackMs ?? 0;

  return (
    <View style={styles.container}>
      {/* Opponent clock (black) */}
      <Clock
        side="black"
        timeMs={blackMs}
        isActive={clock?.activeColor === 'b'}
        onTap={isGuest ? () => getTransport().sendMessage({ type: 'CLOCK_TAP' }) : undefined}
      />

      {/* Board */}
      <View style={styles.boardWrapper}>
        <BoardDiagram
          fen={fen}
          legalTargets={highlightFrom ? core?.getLegalMovesFrom(highlightFrom) ?? [] : []}
        />
        {isPaused && (
          <View style={styles.pauseOverlay}>
            <Text style={styles.pauseText}>⏸ Paused</Text>
          </View>
        )}
        {isGuest && (
          <View style={styles.guestBadge}>
            <Text style={styles.guestBadgeText}>👁 Watching</Text>
          </View>
        )}
        {isMultiplayer && latencyMs > 0 && (
          <View style={styles.latencyPill}>
            <View style={[styles.latencyDot, { backgroundColor: latencyDotColor }]} />
            <Text style={styles.latencyText}>{latencyLabel}</Text>
          </View>
        )}
      </View>

      {/* Player clock (white) */}
      <Clock
        side="white"
        timeMs={whiteMs}
        isActive={clock?.activeColor === 'w'}
        onTap={isGuest ? () => getTransport().sendMessage({ type: 'CLOCK_TAP' }) : undefined}
      />

      {/* Move list */}
      <MoveList moves={moves} />

      {/* Controls */}
      <View style={styles.controls}>
        {!isGuest && (
          <TouchableOpacity style={styles.controlBtn} onPress={handlePause}>
            <Text style={styles.controlBtnText}>{isPaused ? '▶ Resume' : '⏸ Pause'}</Text>
          </TouchableOpacity>
        )}
        {!isGuest && (
          <TouchableOpacity style={styles.controlBtn} onPress={handleTakeback}>
            <Text style={styles.controlBtnText}>↩ Takeback</Text>
          </TouchableOpacity>
        )}
        {isGuest && (moves.length > 0) && (
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => getTransport().sendMessage({ type: 'CORRECTION_REQUEST' })}
          >
            <Text style={styles.controlBtnText}>↩ Request Undo</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.controlBtn, styles.resignBtn]} onPress={handleResign}>
          <Text style={styles.controlBtnText}>🏳 Resign</Text>
        </TouchableOpacity>
      </View>

      {/* Low-confidence move confirmation sheet (host + OTB only) */}
      {pendingCandidate && !isGuest && (
        <ConfirmMoveSheet
          candidate={pendingCandidate}
          onConfirm={handleConfirmMove}
          onDismiss={handleDismissCandidate}
        />
      )}
    </View>
  );
}

