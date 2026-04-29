import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MoveCandidate } from '../../native/cvModule';
import { Square } from '../../domain/gamecore/types';

interface ConfirmMoveSheetProps {
  candidate: MoveCandidate;
  onConfirm: (from: Square, to: Square) => void;
  onDismiss: () => void;
}

export function ConfirmMoveSheet({ candidate, onConfirm, onDismiss }: ConfirmMoveSheetProps): React.JSX.Element {
  return (
    <Modal transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Confirm Move?</Text>
          <Text style={styles.subtitle}>
            Low confidence detection ({Math.round(candidate.confidence * 100)}%)
          </Text>
          <Text style={styles.moveText}>
            {candidate.fromSquare} → {candidate.toSquare}
            {candidate.promotion ? ` (=${candidate.promotion.toUpperCase()})` : ''}
          </Text>
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.confirmBtn}
              onPress={() => onConfirm(candidate.fromSquare as Square, candidate.toSquare as Square)}>
              <Text style={styles.confirmBtnText}>✓ Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
              <Text style={styles.dismissBtnText}>✕ Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#0f3460', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#a0aec0', marginBottom: 12 },
  moveText: { fontSize: 24, color: '#fbd38d', fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  buttons: { flexDirection: 'row', gap: 12 },
  confirmBtn: { flex: 1, backgroundColor: '#48bb78', padding: 16, borderRadius: 12, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  dismissBtn: { flex: 1, backgroundColor: '#742a2a', padding: 16, borderRadius: 12, alignItems: 'center' },
  dismissBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
