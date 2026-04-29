import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { TIME_CONTROLS, TimeControl } from '../../domain/gamecore/clock';

// Add Custom entry
const ALL_CONTROLS: (TimeControl & { custom?: boolean })[] = [
  ...TIME_CONTROLS,
  { name: 'Unlimited', timeMs: 0, increment: 0 },
];

interface TimeControlPickerProps {
  selected: TimeControl;
  onSelect: (tc: TimeControl) => void;
}

export function TimeControlPicker({ selected, onSelect }: TimeControlPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={styles.triggerLabel}>⏱ Time control</Text>
        <Text style={styles.triggerValue}>{selected.name}</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <Modal transparent animationType="slide" visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Select Time Control</Text>
            {ALL_CONTROLS.map(tc => (
              <TouchableOpacity
                key={tc.name}
                style={[styles.option, tc.name === selected.name && styles.optionSelected]}
                onPress={() => {
                  onSelect(tc);
                  setOpen(false);
                }}
              >
                <Text style={[styles.optionName, tc.name === selected.name && styles.optionNameSelected]}>
                  {tc.name}
                </Text>
                {tc.timeMs > 0 && (
                  <Text style={styles.optionDetail}>
                    {Math.floor(tc.timeMs / 60000)}min
                    {tc.increment > 0 ? ` +${tc.increment / 1000}s` : ''}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0f3460', padding: 16, borderRadius: 12, marginBottom: 12,
  },
  triggerLabel: { color: '#a0aec0', fontSize: 14, flex: 1 },
  triggerValue: { color: '#fff', fontSize: 16, fontWeight: '600', marginRight: 8 },
  chevron: { color: '#4299e1', fontSize: 20 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 16, textAlign: 'center' },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: 12, marginBottom: 8, backgroundColor: '#0f3460',
  },
  optionSelected: { backgroundColor: '#2b6cb0' },
  optionName: { color: '#e2e8f0', fontSize: 16 },
  optionNameSelected: { color: '#fff', fontWeight: 'bold' },
  optionDetail: { color: '#718096', fontSize: 13 },
  cancelBtn: { marginTop: 8, padding: 16, alignItems: 'center' },
  cancelText: { color: '#a0aec0', fontSize: 16 },
});
