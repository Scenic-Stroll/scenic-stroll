import { useLocalSearchParams } from 'expo-router';

import { PinReader } from '@/screens/pin-reader';

export default function PinPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PinReader pinId={id} />;
}
