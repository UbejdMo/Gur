import { router, useLocalSearchParams } from 'expo-router';
import { Table } from '@/components/Table';

/** Practice against three bots. `?aceHigh=0` turns the 12-13-1 run off. */
export default function Play() {
  const { aceHigh } = useLocalSearchParams<{ aceHigh?: string }>();
  return <Table aceHigh={aceHigh !== '0'} onMenu={() => router.replace('/')} />;
}
