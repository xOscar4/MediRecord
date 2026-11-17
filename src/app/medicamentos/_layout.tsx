import { Stack } from 'expo-router';

export default function MedicationLayout() {
  return (
    <Stack>
      <Stack.Screen name="nuevo" options={{ title: 'Nuevo medicamento', headerBackTitle: 'Atrás' }} />
      <Stack.Screen name="[id]" options={{ title: 'Editar medicamento', headerBackTitle: 'Atrás' }} />
    </Stack>
  );
}
