import { useLocalSearchParams } from 'expo-router';

import { PinReview } from '@/screens/admin/pin-review';

export default function PinPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PinReview id={id} />;
}
