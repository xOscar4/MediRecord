import alarmAnimation from '@/assets/animations/medirecord-alarm.json';
import { LottieAnimation } from '@/components/lottie-animation';

/** Decorative visual reserved for the future native medication alarm screen. */
export function AlarmVisual() {
  return <LottieAnimation source={alarmAnimation} size={160} accessibilityLabel="Alarma de medicamento" />;
}
