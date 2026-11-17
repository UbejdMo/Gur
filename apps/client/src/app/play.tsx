import { router, useLocalSearchParams } from 'expo-router';
import { Table } from '@/components/Table';
import { botSeconds } from '@/game/botSettings';
import { FAST_BOTS } from '@/game/usePracticeGame';

/**
 * Practice against three bots. `?aceHigh=0` turns the 12-13-1 run off; `?seconds=1` to `10` is
 * how long each bot takes over its turn; `?bots=fast` makes them play at once (for tests).
 */
export default function Play() {
  const { aceHigh, seconds, bots } = useLocalSearchParams<{ aceHigh?: string; seconds?: string; bots?: string }>();
  return (
    <Table
      aceHigh={aceHigh !== '0'}
      botDelayMs={bots === 'fast' ? FAST_BOTS : seconds !== undefined ? botSeconds(seconds) * 1000 : undefined}
      onMenu={() => router.replace('/')}
    />
  );
}
