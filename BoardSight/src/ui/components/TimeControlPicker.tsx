import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { TIME_CONTROLS, TimeControl } from '../../domain/gamecore/clock';
import type { ColorPalette } from '../theme';
import { useTheme } from '../theme';

const ALL_CONTROLS: TimeControl[] = [
  ...TIME_CONTROLS,
  { name: 'Unlimited', timeMs: 0, increment: 0 },
];

/** One-tap shortcuts for common main times (maps to existing named presets). */
const QUICK_PRESETS: { label: string; sub: string; presetName: string }[] = [
  { label: '3′', sub: 'Blitz 3+2', presetName: 'Blitz 3+2' },
  { label: '5′', sub: 'Blitz 5+0', presetName: 'Blitz 5+0' },
  { label: '10′', sub: 'Rapid 10+0', presetName: 'Rapid 10+0' },
];

function buildCustomTimeControl(minutes: number, incSec: number): TimeControl {
  const timeMs = minutes * 60_000;
  const increment = incSec * 1000;
  const name =
    incSec > 0
      ? `Custom (${minutes}m +${incSec}s)`
      : `Custom (${minutes}m)`;
  return { name, timeMs, increment };
}

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.bgCard,
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
    },
    triggerLabel: { color: t.textMuted, fontSize: 14, flex: 1 },
    triggerValue: { color: t.text, fontSize: 16, fontWeight: '600', marginRight: 8 },
    chevron: { color: t.accent, fontSize: 20 },
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: {
      backgroundColor: t.bgAccent,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 28,
      maxHeight: '88%',
    },
    sheetTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: t.text,
      marginBottom: 12,
      textAlign: 'center',
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: t.textMuted,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    quickRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    quickChip: {
      flex: 1,
      backgroundColor: t.bgCard,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    quickChipSelected: { borderWidth: 2, borderColor: t.accent },
    quickChipLabel: { color: t.text, fontSize: 18, fontWeight: 'bold' },
    quickChipSub: { color: t.textMuted, fontSize: 11, marginTop: 4, textAlign: 'center' },
    customBox: {
      backgroundColor: t.bgCard,
      borderRadius: 12,
      padding: 14,
      marginBottom: 14,
    },
    customRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 },
    customField: { flex: 1 },
    customLabel: { color: t.textMuted, fontSize: 12, marginBottom: 4 },
    customInput: {
      backgroundColor: t.bgAccent,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: t.text,
      fontSize: 16,
      borderWidth: 1,
      borderColor: t.border,
    },
    applyCustomBtn: {
      backgroundColor: t.accentCta,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    applyCustomText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderRadius: 12,
      marginBottom: 8,
      backgroundColor: t.bgCard,
    },
    optionSelected: { borderWidth: 2, borderColor: t.accent },
    optionName: { color: t.text, fontSize: 16 },
    optionNameSelected: { color: t.text, fontWeight: 'bold' },
    optionDetail: { color: t.textMuted, fontSize: 13 },
    cancelBtn: { marginTop: 8, padding: 16, alignItems: 'center' },
    cancelText: { color: t.textMuted, fontSize: 16 },
    divider: {
      height: 1,
      backgroundColor: t.border,
      marginVertical: 14,
    },
    scroll: { maxHeight: 280 },
  });
}

interface TimeControlPickerProps {
  selected: TimeControl;
  onSelect: (tc: TimeControl) => void;
}

export function TimeControlPicker({ selected, onSelect }: TimeControlPickerProps): React.JSX.Element {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [open, setOpen] = useState(false);
  const [customMin, setCustomMin] = useState('15');
  const [customInc, setCustomInc] = useState('0');

  const pickPreset = (tc: TimeControl) => {
    onSelect(tc);
    setOpen(false);
  };

  const applyCustom = () => {
    const m = parseInt(customMin, 10);
    const inc = parseInt(customInc, 10);
    if (!Number.isFinite(m) || m < 1 || m > 180) {
      return;
    }
    if (!Number.isFinite(inc) || inc < 0 || inc > 120) {
      return;
    }
    pickPreset(buildCustomTimeControl(m, inc));
  };

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
            <Text style={styles.sheetTitle}>Select time control</Text>

            <Text style={styles.sectionLabel}>Quick — main time</Text>
            <View style={styles.quickRow}>
              {QUICK_PRESETS.map(q => {
                const tc = ALL_CONTROLS.find(c => c.name === q.presetName);
                if (!tc) {
                  return null;
                }
                const sel = selected.name === tc.name;
                return (
                  <TouchableOpacity
                    key={q.presetName}
                    style={[styles.quickChip, sel && styles.quickChipSelected]}
                    onPress={() => pickPreset(tc)}
                  >
                    <Text style={styles.quickChipLabel}>{q.label}</Text>
                    <Text style={styles.quickChipSub}>{q.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Custom</Text>
            <View style={styles.customBox}>
              <View style={styles.customRow}>
                <View style={styles.customField}>
                  <Text style={styles.customLabel}>Minutes (1–180)</Text>
                  <TextInput
                    style={styles.customInput}
                    value={customMin}
                    onChangeText={setCustomMin}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="15"
                    placeholderTextColor={t.textFaint}
                  />
                </View>
                <View style={styles.customField}>
                  <Text style={styles.customLabel}>Increment (sec, 0–120)</Text>
                  <TextInput
                    style={styles.customInput}
                    value={customInc}
                    onChangeText={setCustomInc}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="0"
                    placeholderTextColor={t.textFaint}
                  />
                </View>
              </View>
              <TouchableOpacity style={styles.applyCustomBtn} onPress={applyCustom}>
                <Text style={styles.applyCustomText}>Use custom time</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>All presets</Text>
            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
              {ALL_CONTROLS.map(tc => (
                <TouchableOpacity
                  key={tc.name}
                  style={[styles.option, tc.name === selected.name && styles.optionSelected]}
                  onPress={() => pickPreset(tc)}
                >
                  <Text style={[styles.optionName, tc.name === selected.name && styles.optionNameSelected]}>
                    {tc.name}
                  </Text>
                  {tc.timeMs > 0 && (
                    <Text style={styles.optionDetail}>
                      {Math.floor(tc.timeMs / 60000)} min
                      {tc.increment > 0 ? ` +${tc.increment / 1000}s` : ''}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
