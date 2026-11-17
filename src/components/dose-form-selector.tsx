import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppIcon, SectionLabel } from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MedicationDoseForm } from '@/types/medications';

const DOSE_FORMS: { value: MedicationDoseForm; label: string }[] = [
  { value: 'tablet', label: 'Tableta' },
  { value: 'capsule', label: 'Cápsula' },
  { value: 'liquid', label: 'Líquido' },
  { value: 'drops', label: 'Gotas' },
  { value: 'injection', label: 'Inyección' },
  { value: 'inhaler', label: 'Inhalador' },
  { value: 'other', label: 'Otro' },
];

export function DoseFormSelector({ value, onChange, disabled = false }: {
  value: MedicationDoseForm | null;
  onChange: (value: MedicationDoseForm | null) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <SectionLabel>Forma farmacéutica</SectionLabel>
      <View style={styles.grid}>
        {DOSE_FORMS.map((form) => {
          const selected = value === form.value;
          return (
            <Pressable
              key={form.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(selected ? null : form.value)}
              style={({ pressed }) => [
                styles.choice,
                {
                  backgroundColor: selected ? theme.primary : theme.background,
                  borderColor: selected ? theme.primary : theme.border,
                  opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
                },
              ]}>
              {selected ? <AppIcon name={{ ios: 'checkmark', android: 'check' }} color={theme.onPrimary} size={14} /> : null}
              <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.textSecondary }}>{form.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { alignItems: 'center', borderRadius: Radius.sm, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 42, paddingHorizontal: 12, paddingVertical: 9 },
});
