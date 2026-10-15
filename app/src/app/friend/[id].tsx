import { useLocalSearchParams } from 'expo-router';

import { FriendProfileScreen } from '@/screens/friends/friend-profile';

export default function FriendRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FriendProfileScreen friendId={id} />;
}
