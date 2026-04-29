import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LobbyProps } from '../navigation/types';
import { p2pManager, P2PMessage, P2PSession } from '../../domain/multiplayer/p2p';
import { cloudRelayManager } from '../../domain/multiplayer/cloudRelay';
import { getTransportType, setTransportType } from '../../domain/multiplayer/activeTransport';
import { clearLastSession, loadLastSession, saveLastSession } from '../../domain/multiplayer/sessionPersistence';
import { getSettings } from '../../domain/settings';
import { ColorPalette, useTheme } from '../theme';

type LobbyPhase = 'idle' | 'hosting' | 'joining' | 'connected';

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, padding: 24, backgroundColor: t.bg },
    heading: { fontSize: 24, fontWeight: 'bold', color: t.text, marginBottom: 8 },
    subtitle: { color: t.textMuted, fontSize: 13, marginBottom: 32 },
    hostBtn: { backgroundColor: t.accent, padding: 18, borderRadius: 12, alignItems: 'center', marginBottom: 24 },
    hostBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    orDivider: { color: t.textMuted, textAlign: 'center', marginBottom: 24 },
    label: { color: t.textMuted, marginBottom: 8 },
    input: {
      backgroundColor: t.bgCard, color: t.text, padding: 14, borderRadius: 10,
      fontSize: 18, letterSpacing: 2, marginBottom: 16, textAlign: 'center',
    },
    joinBtn: { backgroundColor: t.accentGreen, padding: 16, borderRadius: 12, alignItems: 'center' },
    joinBtnDisabled: { opacity: 0.4 },
    joinBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    waitingPanel: { backgroundColor: t.bgCard, borderRadius: 16, padding: 24, alignItems: 'center' },
    codeLabel: { color: t.textMuted, marginBottom: 8, fontSize: 13 },
    hostCode: { color: t.accentGold, fontSize: 28, fontWeight: 'bold', letterSpacing: 4, marginBottom: 20 },
    spinner: { marginBottom: 16 },
    statusMsg: { color: t.text, fontSize: 14, marginBottom: 20, textAlign: 'center' },
    cancelBtn: { backgroundColor: t.accentRed, padding: 12, borderRadius: 10, paddingHorizontal: 24 },
    cancelBtnText: { color: '#fff', fontWeight: '600' },
    connectedText: { color: t.accentGreen, fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
    reconnectPanel: {
      backgroundColor: t.bgCard, borderRadius: 12, padding: 16, marginBottom: 20,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    reconnectLabel: { color: t.textMuted, fontSize: 12 },
    reconnectCode: { color: t.accentGold, fontSize: 14, fontWeight: 'bold', flex: 1, marginHorizontal: 8 },
    reconnectBtn: { backgroundColor: t.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
    reconnectBtnText: { color: '#fff', fontSize: 13 },
    spectateBtn: { backgroundColor: t.bgCard, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
    spectateBtnText: { color: t.textMuted, fontSize: 15 },
  });
}

export function LobbyScreen({ navigation }: LobbyProps): React.JSX.Element {
  const [phase, setPhase] = useState<LobbyPhase>('idle');
  const [sessionCode, setSessionCode] = useState('');
  const [hostSession, setHostSession] = useState<P2PSession | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [lastSession, setLastSession] = useState<{ code: string; role: 'host' | 'guest' } | null>(null);
  const theme = useTheme();
  const styles = makeStyles(theme);

  // Load last session for quick-reconnect offer
  useEffect(() => {
    loadLastSession().then(s => {
      if (s) setLastSession({ code: s.sessionCode, role: s.role });
    });
  }, []);

  // Clean up P2P on unmount
  useEffect(() => {
    return () => {
      p2pManager.disconnect();
    };
  }, []);

  const callbacks = useCallback(
    () => ({
      onMessage: (msg: P2PMessage) => {
        if (msg.type === 'MOVE') {
          // Move received from peer before onConnect fires — navigate as guest
          const session = p2pManager.getSession();
          if (session && (session.role === 'host' || session.role === 'guest')) {
            navigation.replace('LiveGame', {
              gameId: session.id,
              isMultiplayer: true,
              role: session.role,
            });
          }
        }
      },
      onConnect: () => {
        const tType = getTransportType();
        const transport = tType === 'cloud' ? cloudRelayManager : p2pManager;
        const session = transport.getSession();
        if (session && (session.role === 'host' || session.role === 'guest')) {
          setPhase('connected');
          setStatusMsg('Peer connected!');
          saveLastSession(session.id, session.role).catch(() => {});
          navigation.replace('LiveGame', {
            gameId: session.id,
            isMultiplayer: true,
            role: session.role,
            connectionType: tType,
          });
        }
      },
      onDisconnect: () => {
        setPhase('idle');
        setStatusMsg('Peer disconnected.');
        clearLastSession().catch(() => {});
        Alert.alert('Disconnected', 'The peer disconnected. You can try again.');
      },
    }),
    [navigation],
  );

  const handleHost = async () => {
    setPhase('hosting');
    setStatusMsg('Starting server…');
    try {
      const session = await p2pManager.startHost(callbacks());
      setHostSession(session);
      setStatusMsg(
        session.id === '0.0.0.0'
          ? 'Server ready — share your IP address with the guest'
          : `Share code: ${session.id}`,
      );
    } catch (err) {
      setPhase('idle');
      Alert.alert('Host failed', String(err));
    }
  };

  const handleJoin = async () => {
    if (sessionCode.trim().length < 4) {
      Alert.alert('Enter code', 'Please enter the host IP address or session code.');
      return;
    }
    setPhase('joining');
    setStatusMsg('Connecting…');
    setTransportType('p2p');
    try {
      await p2pManager.joinSession(sessionCode.trim(), callbacks());
      // onConnect callback will fire and navigate
    } catch {
      setPhase('idle');
      Alert.alert(
        'Connection failed',
        'Could not connect via WiFi P2P. Try cloud relay instead?',
        [
          { text: 'Retry P2P', onPress: handleJoin },
          {
            text: 'Cloud Relay',
            onPress: () => handleJoinViaCloud(sessionCode.trim()),
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    }
  };

  const handleJoinViaCloud = async (code: string) => {
    setPhase('joining');
    setStatusMsg('Connecting via cloud relay…');
    try {
      const settings = await getSettings();
      if (!settings.cloudEndpointUrl) {
        setPhase('idle');
        Alert.alert(
          'No relay configured',
          'Set a cloud endpoint URL in Settings to use cloud relay.',
        );
        return;
      }
      setTransportType('cloud');
      await cloudRelayManager.connect(code, 'guest', callbacks(), settings.cloudEndpointUrl);
      // onConnect from cloudRelayManager fires when peer joins — navigation happens there
    } catch (err) {
      setTransportType('p2p');
      setPhase('idle');
      Alert.alert('Cloud relay failed', String(err));
    }
  };

  const handleCancel = () => {
    p2pManager.disconnect();
    cloudRelayManager.disconnect();
    setTransportType('p2p');
    setPhase('idle');
    setHostSession(null);
    setStatusMsg('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Multiplayer</Text>
      <Text style={styles.subtitle}>
        Both devices must be on the same WiFi network.
      </Text>

      {phase === 'idle' && lastSession && lastSession.role === 'guest' && (
        <View style={styles.reconnectPanel}>
          <Text style={styles.reconnectLabel}>Last session:</Text>
          <Text style={styles.reconnectCode}>{lastSession.code}</Text>
          <TouchableOpacity
            style={styles.reconnectBtn}
            onPress={() => {
              setSessionCode(lastSession.code);
              setLastSession(null);
            }}
          >
            <Text style={styles.reconnectBtnText}>Reconnect</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'idle' && (
        <>
          <TouchableOpacity style={styles.hostBtn} onPress={handleHost}>
            <Text style={styles.hostBtnText}>🏠 Host a Game</Text>
          </TouchableOpacity>
          <Text style={styles.orDivider}>— or —</Text>
          <Text style={styles.label}>Join with host IP address</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 192.168.1.5"
            placeholderTextColor="#666"
            value={sessionCode}
            onChangeText={setSessionCode}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            maxLength={21}
          />
          <TouchableOpacity
            style={[styles.joinBtn, sessionCode.trim().length < 4 && styles.joinBtnDisabled]}
            onPress={handleJoin}
            disabled={sessionCode.trim().length < 4}
          >
            <Text style={styles.joinBtnText}>Join Game</Text>
          </TouchableOpacity>

          <Text style={styles.orDivider}>— or —</Text>
          <TouchableOpacity
            style={[styles.spectateBtn, sessionCode.trim().length < 4 && styles.joinBtnDisabled]}
            onPress={() => {
              if (sessionCode.trim().length < 4) { return; }
              getSettings().then(s => {
                if (!s.cloudEndpointUrl) {
                  Alert.alert('No relay URL', 'Set a cloud endpoint URL in Settings to spectate.');
                  return;
                }
                navigation.navigate('Spectator', {
                  sessionCode: sessionCode.trim(),
                  relayUrl: s.cloudEndpointUrl,
                });
              });
            }}
            disabled={sessionCode.trim().length < 4}
          >
            <Text style={styles.spectateBtnText}>👁 Watch (spectate)</Text>
          </TouchableOpacity>
        </>
      )}

      {(phase === 'hosting' || phase === 'joining') && (
        <View style={styles.waitingPanel}>
          {phase === 'hosting' && hostSession && hostSession.id !== '0.0.0.0' && (
            <>
              <Text style={styles.codeLabel}>Your IP address (share with guest):</Text>
              <Text style={styles.hostCode}>{hostSession.id}</Text>
            </>
          )}
          <ActivityIndicator color="#4299e1" style={styles.spinner} />
          <Text style={styles.statusMsg}>{statusMsg}</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'connected' && (
        <View style={styles.waitingPanel}>
          <Text style={styles.connectedText}>✓ {statusMsg}</Text>
          <ActivityIndicator color="#48bb78" />
        </View>
      )}
    </View>
  );
}

