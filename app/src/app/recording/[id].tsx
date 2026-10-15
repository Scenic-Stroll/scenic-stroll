import { useLocalSearchParams } from 'expo-router';

import { ReviewScreen } from '@/screens/review';

// Opened after Stop, and when tapping a route in My routes.
export default function RecordingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReviewScreen id={id} />;
}
