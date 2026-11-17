import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Invites } from '@/components/Invites';

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {/* Over every screen: invitations from friends reach you wherever you are. */}
      <Invites />
      <StatusBar style="light" />
    </>
  );
}
