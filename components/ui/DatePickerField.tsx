import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts } from '@/lib/theme';

const WEEKDAGEN = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

function toIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromIso(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Monday-first weekday index (0 = Monday .. 6 = Sunday).
function mondayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function DatePickerField({
  value,
  onChange,
  placeholder = 'Kies een datum',
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const base = fromIso(value) ?? new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const openPicker = () => {
    const base = fromIso(value) ?? new Date();
    setCursor({ year: base.getFullYear(), month: base.getMonth() });
    setOpen(true);
  };

  const selectedDate = fromIso(value);
  const firstOfMonth = new Date(cursor.year, cursor.month, 1);
  const leadingBlanks = mondayIndex(firstOfMonth);
  const totalDays = daysInMonth(cursor.year, cursor.month);
  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const displayLabel = selectedDate
    ? selectedDate.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
    : placeholder;

  const goPrevMonth = () =>
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  const goNextMonth = () =>
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={openPicker} accessibilityRole="button">
        <Text style={[styles.fieldText, !selectedDate && styles.fieldPlaceholder]}>{displayLabel}</Text>
        <Ionicons name="calendar-outline" size={17} color={colors.accentDark} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <TouchableOpacity onPress={goPrevMonth} accessibilityRole="button" style={styles.navBtn}>
                <Ionicons name="chevron-back" size={20} color={colors.accentDark} />
              </TouchableOpacity>
              <Text style={styles.headerLabel}>{`${MAANDEN[cursor.month]} ${cursor.year}`}</Text>
              <TouchableOpacity onPress={goNextMonth} accessibilityRole="button" style={styles.navBtn}>
                <Ionicons name="chevron-forward" size={20} color={colors.accentDark} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAGEN.map((w) => (
                <Text key={w} style={styles.weekLabel}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (day === null) return <View key={`blank-${i}`} style={styles.cell} />;
                const iso = toIso(new Date(cursor.year, cursor.month, day));
                const isSelected = value === iso;
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[styles.cell, isSelected && styles.cellSelected]}
                    onPress={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    accessibilityRole="button">
                    <Text style={[styles.cellText, isSelected && styles.cellTextSelected]}>{day}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldText: { fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  fieldPlaceholder: { color: colors.inkFaint },
  backdrop: { flex: 1, backgroundColor: 'rgba(29,31,32,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 340, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.ink, padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { padding: 4 },
  headerLabel: { fontFamily: fonts.heading, fontSize: 16, textTransform: 'uppercase', color: colors.ink },
  weekRow: { flexDirection: 'row' },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.inkMuted,
    textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellSelected: { backgroundColor: colors.accent },
  cellText: { fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  cellTextSelected: { color: colors.white, fontFamily: fonts.bodyMedium },
});
