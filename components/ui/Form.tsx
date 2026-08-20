import { StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts } from '@/lib/theme';

export function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function TextField(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.inkFaint} style={styles.input} {...props} />;
}

export function TextArea(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.inkFaint}
      multiline
      textAlignVertical="top"
      style={[styles.input, styles.textArea]}
      {...props}
    />
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segmentedOption,
              i > 0 && styles.segmentedOptionBorder,
              active && styles.segmentedOptionActive,
            ]}
            accessibilityRole="button">
            <Text style={[styles.segmentedLabel, active && styles.segmentedLabelActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  eenheid,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  eenheid: string;
  min?: number;
}) {
  return (
    <View style={styles.stepperRow}>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={styles.stepperBtn}
          onPress={() => onChange(Math.max(min, value - 1))}
          accessibilityRole="button">
          <Ionicons name="remove" size={18} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value}</Text>
        <TouchableOpacity
          style={[styles.stepperBtn, styles.stepperBtnRight]}
          onPress={() => onChange(value + 1)}
          accessibilityRole="button">
          <Ionicons name="add" size={18} color={colors.ink} />
        </TouchableOpacity>
      </View>
      <Text style={styles.eenheid}>{eenheid}</Text>
    </View>
  );
}

/** A typed-in number, for values too large/precise to comfortably tap out with a Stepper. */
export function NumberField({
  value,
  onChangeText,
  eenheid,
}: {
  value: string;
  onChangeText: (v: string) => void;
  eenheid: string;
}) {
  return (
    <View style={styles.numberFieldRow}>
      <TextInput
        value={value}
        onChangeText={(v) => onChangeText(v.replace(/[^0-9.,]/g, ''))}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={colors.inkFaint}
        style={[styles.input, styles.numberFieldInput]}
      />
      <Text style={styles.eenheid}>{eenheid}</Text>
    </View>
  );
}

/** One NumberField per item — e.g. an oppervlakte input per room, count
 *  driven by another field's value ("aantal ruimtes"). */
export function NumberFieldList({
  count,
  values,
  onChange,
  eenheid,
  itemLabel,
}: {
  count: number;
  values: string[];
  onChange: (values: string[]) => void;
  eenheid: string;
  itemLabel: (index: number) => string;
}) {
  if (count <= 0) {
    return <Text style={styles.numberFieldListHint}>Vul eerst het aantal in.</Text>;
  }
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.numberFieldListRow}>
          <Text style={styles.numberFieldListLabel}>{itemLabel(i)}</Text>
          <NumberField
            value={values[i] ?? ''}
            onChangeText={(v) => {
              const next = [...values];
              next[i] = v;
              onChange(next);
            }}
            eenheid={eenheid}
          />
        </View>
      ))}
    </View>
  );
}

/** A growing list of free-text lines — starts with one empty line, adds a
 *  new empty one below as soon as the last line gets text, and lets you
 *  remove a line. E.g. one binnenunit per line, no fixed count needed. */
export function DynamicTextList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const regels = values.length ? values : [''];

  const updateRegel = (index: number, waarde: string) => {
    const next = regels.map((r, i) => (i === index ? waarde : r));
    if (next[next.length - 1].trim()) next.push('');
    onChange(next);
  };

  const removeRegel = (index: number) => {
    const next = regels.filter((_, i) => i !== index);
    onChange(next.length ? next : ['']);
  };

  return (
    <View style={{ gap: 8 }}>
      {regels.map((regel, i) => (
        <View key={i} style={styles.dynamicRow}>
          <View style={{ flex: 1 }}>
            <TextField value={regel} onChangeText={(v) => updateRegel(i, v)} placeholder={placeholder} />
          </View>
          {regels.length > 1 ? (
            <TouchableOpacity onPress={() => removeRegel(i)} accessibilityRole="button" style={styles.dynamicRemove}>
              <Ionicons name="close" size={16} color={colors.inkMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Wrapped pill buttons — single-select (like a radio group) or multi-select (like checkboxes). */
export function ChipGroup({
  opties,
  value,
  onChange,
  multi = false,
}: {
  opties: string[];
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  multi?: boolean;
}) {
  return (
    <View style={styles.chipGroup}>
      {opties.map((opt) => {
        const active = multi ? Array.isArray(value) && value.includes(opt) : value === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => {
              if (multi) {
                const arr = Array.isArray(value) ? value : [];
                onChange(arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt]);
              } else {
                onChange(opt);
              }
            }}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button">
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ToggleRow({
  checked,
  onToggle,
  titel,
  sub,
}: {
  checked: boolean;
  onToggle: () => void;
  titel: string;
  sub: string;
}) {
  return (
    <TouchableOpacity style={styles.toggleRow} onPress={onToggle} accessibilityRole="button">
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitel}>{titel}</Text>
        <Text style={styles.toggleSub}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginBottom: 7,
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.white,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  textArea: { minHeight: 76, paddingTop: 10 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderColor: colors.dividerStrong },
  segmentedOption: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  segmentedOptionBorder: { borderLeftWidth: 1, borderLeftColor: colors.dividerStrong },
  segmentedOptionActive: { backgroundColor: colors.accent },
  segmentedLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  segmentedLabelActive: { color: colors.white },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numberFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numberFieldInput: { flex: 1 },
  numberFieldListHint: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, fontStyle: 'italic' },
  numberFieldListRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  numberFieldListLabel: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkMuted, width: 76 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.dividerStrong },
  stepperBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: colors.dividerStrong },
  stepperBtnRight: { borderRightWidth: 0, borderLeftWidth: 1, borderLeftColor: colors.dividerStrong },
  stepperValue: { minWidth: 44, textAlign: 'center', fontFamily: fonts.monoMedium, fontSize: 16, color: colors.ink },
  eenheid: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkMuted },
  dynamicRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dynamicRemove: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.dividerStrong },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accentDark },
  chipLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  chipLabelActive: { color: colors.white },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  checkbox: { width: 22, height: 22, borderWidth: 1, borderColor: colors.dividerStrong, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accentDark },
  toggleTitel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  toggleSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkMuted },
});
