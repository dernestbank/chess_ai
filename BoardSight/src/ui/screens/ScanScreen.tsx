import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { ScanProps } from '../navigation/types';
import { CalibOverlay } from '../components/CalibOverlay';
import { BoardDiagram } from '../components/BoardDiagram';
import { cvModule, BoardObservation } from '../../native/cvModule';
import { useGameService } from '../../domain/gameService';
import { useAppStore } from '../../domain/stateMachine';
import { TIME_CONTROLS } from '../../domain/gamecore/clock';
import { ColorPalette, useTheme } from '../theme';

type ScanPhase = 'scanning' | 'calibrating' | 'confirming';

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    cameraView: {
      flex: 1, backgroundColor: '#000',
      alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    },
    cameraPlaceholder: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    cameraIcon: { fontSize: 64 },
    cameraLabel: { color: t.textFaint, marginTop: 8, fontSize: 14 },
    boardPreview: { width: '90%', aspectRatio: 1 },
    infoPanel: { padding: 20, backgroundColor: t.bgCard, minHeight: 180 },
    phaseTitle: { fontSize: 20, fontWeight: 'bold', color: t.text, marginBottom: 6 },
    phaseHint: { fontSize: 14, color: t.textMuted, marginBottom: 12 },
    warning: { color: t.accentRed, fontSize: 13, marginBottom: 12 },
    confidenceRow: {
      height: 6, backgroundColor: t.border, borderRadius: 3,
      overflow: 'hidden', position: 'relative', flexDirection: 'row',
      alignItems: 'center',
    },
    confidenceBar: { height: 6, backgroundColor: t.accent, borderRadius: 3 },
    confidenceLabel: { color: t.textMuted, fontSize: 11, marginLeft: 8 },
    spinner: { marginTop: 12 },
    flipBtn: {
      backgroundColor: t.bgAccent, padding: 12, borderRadius: 10,
      marginBottom: 12, alignItems: 'center',
    },
    flipBtnText: { color: t.text, fontSize: 14 },
    startBtn: { backgroundColor: t.accentGreen, padding: 16, borderRadius: 12, alignItems: 'center' },
    startBtnDisabled: { opacity: 0.6 },
    startBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  });
}

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function ScanScreen({ navigation, route }: ScanProps): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { gameId, timeControlName } = route.params;
  const { startNewGame } = useGameService();
  const { dispatch } = useAppStore();

  const [phase, setPhase] = useState<ScanPhase>('scanning');
  const [confidence, setConfidence] = useState(0);
  const [lightingWarning, setLightingWarning] = useState(false);
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const latestObs = useRef<BoardObservation | null>(null);

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  // Start CV session on mount
  useEffect(() => {
    const run = async () => {
      if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) return; // user denied
      }

      cvModule.startSession(
        { boardOrientation: 'white-bottom', targetFps: 15, confidenceThreshold: 0.85 },
        {
          onBoardObservation: (obs: BoardObservation) => {
            latestObs.current = obs;
            setConfidence(obs.confidence);
            setLightingWarning(obs.lightingWarning);

            setPhase(prev => {
              if (obs.confidence >= 0.85 && prev === 'scanning') return 'calibrating';
              if (obs.confidence >= 0.92 && prev === 'calibrating') return 'confirming';
              return prev;
            });
          },
        },
      );

      dispatch({ type: 'BOARD_DETECTED' });
    };

    run();

    return () => {
      cvModule.stopSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- CV bootstrap once; permission flows via run()
  }, []);

  const handleConfirm = useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      cvModule.pauseTracking(true);
      const orientation = boardFlipped ? 'black-bottom' : 'white-bottom';

      const timeControl =
        TIME_CONTROLS.find(tc => tc.name === timeControlName) ?? TIME_CONTROLS[2];

      // Create game in GameService (uses 'otb' mode; time control from StartGame selection)
      const gId = await startNewGame({
        id: gameId === 'new' ? Math.random().toString(36).slice(2) : gameId,
        mode: 'otb',
        boardOrientation: orientation,
        timeControl,
        assistLevel: 'off',
      });

      dispatch({ type: 'POSITION_CONFIRMED', fen: STARTING_FEN });
      navigation.replace('LiveGame', { gameId: gId });
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, boardFlipped, startNewGame, dispatch, navigation, gameId, timeControlName]);

  const confidencePct = Math.round(confidence * 100);

  return (
    <View style={styles.container}>
      {/* Camera preview area */}
      <View style={styles.cameraView}>
        {device && hasPermission ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={phase !== 'confirming'}
            photo={false}
            video={false}
          />
        ) : (
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.cameraIcon}>📷</Text>
            <Text style={styles.cameraLabel}>Waiting for camera…</Text>
          </View>
        )}
        {/* Show status label only when no live camera */}
        {phase !== 'confirming' && !(device && hasPermission) && (
          <Text style={styles.cameraLabel}>
            {phase === 'scanning' ? 'Scanning…' : 'Locking calibration…'}
          </Text>
        )}
        {phase === 'confirming' && (
          <View style={styles.boardPreview}>
            <BoardDiagram fen={STARTING_FEN} flipped={boardFlipped} />
          </View>
        )}
        {/* Calib overlay when scanning/calibrating */}
        {phase !== 'confirming' && (
          <CalibOverlay confidence={confidence} />
        )}
      </View>

      {/* Info panel */}
      <View style={styles.infoPanel}>
        {phase === 'scanning' && (
          <>
            <Text style={styles.phaseTitle}>Scanning for board…</Text>
            <Text style={styles.phaseHint}>
              Point your camera so the full board is visible
            </Text>
            {lightingWarning && (
              <Text style={styles.warning}>⚠️ Low lighting — move to a brighter area</Text>
            )}
            <View style={styles.confidenceRow}>
              <View style={[styles.confidenceBar, { width: `${confidencePct}%` }]} />
              <Text style={styles.confidenceLabel}>{confidencePct}%</Text>
            </View>
          </>
        )}

        {phase === 'calibrating' && (
          <>
            <Text style={styles.phaseTitle}>Board detected ✓</Text>
            <Text style={styles.phaseHint}>Hold still — locking grid…</Text>
            <ActivityIndicator color="#4299e1" style={styles.spinner} />
          </>
        )}

        {phase === 'confirming' && (
          <>
            <Text style={styles.phaseTitle}>Confirm position</Text>
            <Text style={styles.phaseHint}>
              Check the board orientation is correct, then start the game.
            </Text>
            <TouchableOpacity
              style={styles.flipBtn}
              onPress={() => setBoardFlipped(f => !f)}
            >
              <Text style={styles.flipBtnText}>
                🔄 Flip board ({boardFlipped ? 'Black at bottom' : 'White at bottom'})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.startBtn, isStarting && styles.startBtnDisabled]}
              onPress={handleConfirm}
              disabled={isStarting}
            >
              {isStarting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.startBtnText}>Start Game →</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

