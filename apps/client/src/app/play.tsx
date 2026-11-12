import { router, useLocalSearchParams } from 'expo-router';
import { Table } from '@/components/Table';
import { FAST_BOTS } from '@/game/usePracticeGame';

/** Practice against three bots. `?aceHigh=0` turns the 12-13-1 run off; `?bots=fast` makes the bots play quickly. */
export default function Play() {
  const { aceHigh, bots } = useLocalSearchParams<{ aceHigh?: string; bots?: string }>();
  return (
    <Table
      aceHigh={aceHigh !== '0'}
      botDelayMs={bots === 'fast' ? FAST_BOTS : undefined}
      onMenu={() => router.replace('/')}
    />
  );
}
