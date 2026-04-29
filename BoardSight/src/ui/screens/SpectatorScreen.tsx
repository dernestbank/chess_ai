/**
 * SpectatorScreen — read-only live game view via cloud relay WebSocket.
 *
 * A spectator connects to a session code (host IP or relay session ID)
 * and receives moves in real-time without being able to interact.
 * Uses cloudRelayManager with role 'spectate'.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Chess } from 'chess.js';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { BoardDiagram } from '../components/BoardDiagram';
import { MoveList } from '../components/MoveList';
import { cloudRelayManager } from '../../domain/multiplayer/cloudRelay';
import { P2PMessage } from '../../domain/multiplayer/p2p';
import { Move } from '../../domain/gamecore/types';
import { ColorPalette, useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Spectator'>;

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: t.bgCard,
      gap: 8,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dotConnected: { backgroundColor: t.accentGreen },
    dotDisconnected: { backgroundColor: t.accentRed },
    headerText: { flex: 1, color: t.text, fontSize: 13 },
    leaveBtn: { color: t.accentRed, fontSize: 13, fontWeight: '600' },
    clockRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: t.bgAccent,
      paddingVertical: 6,
    },
    clockText: { color: t.text, fontSize: 14, fontWeight: 'bold' },
    boardWrapper: { width: '100%', aspectRatio: 1 },
    spectatorBadge: {
      backgroundColor: t.bgAccent,
      paddingVertical: 6,
      alignItems: 'center',
    },
    spectatorText: { color: t.textFaint, fontSize: 12 },
  });
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function SpectatorScreen({ navigation, route }: Props): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { sessionCode, relayUrl } = route.params;

  const [fen, setFen] = useState(INITIAL_FEN);
  const [moves, setMoves] = useState<Move[]>([]);
  const [connected, setConnected] = useState(false);
  const [whiteMs, setWhiteMs] = useState(0);
  const [blackMs, setBlackMs] = useState(0);

  const chessRef = useRef(new Chess());

  useEffect(() => {
    cloudRelayManager.connect(
      sessionCode,
      'spectate',
      {
        onMessage: (msg: P2PMessage) => {
          if (msg.type === 'MOVE') {
            try {
              const result = chessRef.current.move({
                from: msg.san.slice(0, 2),
                to: msg.san.slice(2, 4),
                promotion: msg.san[4] as 'q' | 'r' | 'b' | 'n' | undefined,
              });
              if (result) {
                const newFen = chessRef.current.fen();
                setFen(newFen);
                setMoves(prev => [
                  ...prev,
                  {
                    san: result.san,
                    from: result.from,
                    to: result.to,
                    fen: newFen,
                    whiteMs: 0,
                    blackMs: 0,
                    moveNumber: Math.ceil(prev.length / 2) + 1,
                    timestamp: Date.now(),
                  },
                ]);
              }
            } catch {}
          } else if (msg.type === 'CLOCK_SYNC') {
            setWhiteMs(msg.whiteMs);
            setBlackMs(msg.blackMs);
          } else if (msg.type === 'GAME_OVER') {
            Alert.alert('Game Over', `Result: ${msg.result}`, [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          }
        },
        onConnect: () => setConnected(true),
        onDisconnect: () => {
          setConnected(false);
          Alert.alert('Disconnected', 'The live game has ended.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        },
      },
      relayUrl,
    );

    return () => {
      cloudRelayManager.disconnect();
    };
  }, [sessionCode, relayUrl, navigation]);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.dot, connected ? styles.dotConnected : styles.dotDisconnected]} />
        <Text style={styles.headerText}>
          {connected ? `Watching: ${sessionCode}` : 'Connecting…'}
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.leaveBtn}>✕ Leave</Text>
        </TouchableOpacity>
      </View>

      {/* Clocks */}
      {(whiteMs > 0 || blackMs > 0) && (
        <View style={styles.clockRow}>
          <Text style={styles.clockText}>⬜ {formatTime(whiteMs)}</Text>
          <Text style={styles.clockText}>⬛ {formatTime(blackMs)}</Text>
        </View>
      )}

      {/* Live board */}
      <View style={styles.boardWrapper}>
        <BoardDiagram fen={fen} legalTargets={[]} onSquarePress={() => {}} />
      </View>

      {/* Spectator badge */}
      <View style={styles.spectatorBadge}>
        <Text style={styles.spectatorText}>👁 Spectating — read only</Text>
      </View>

      {/* Move list */}
      <MoveList moves={moves} />
    </View>
  );
}

