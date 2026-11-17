import alarmAnimation from '@/assets/animations/medirecord-alarm.json';
import { LottieAnimation } from '@/components/lottie-animation';

/** Decorative visual reserved for the future native medication alarm screen. */
export function AlarmVisual({ size = 160 }: { size?: number }) {
  return <LottieAnimation source={alarmAnimation} size={size} accessibilityLabel="Alarma de medicamento" />;
}
