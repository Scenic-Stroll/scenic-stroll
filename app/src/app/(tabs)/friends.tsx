import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/empty-state';
import { useAppTheme } from '@/theme';

// Step 5 of the redesign adds friend codes, requests, activity and the leaderboard.
export default function FriendsTab() {
  const t = useAppTheme();
  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: t.background, justifyContent: 'center' }}
    >
      <EmptyState
        icon="account-multiple-outline"
        title="Friends are coming soon"
        body="Add friends with a code, see what routes they log, and compare points on a weekly leaderboard."
      />
    </SafeAreaView>
  );
}
