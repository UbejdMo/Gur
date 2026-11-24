import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tileId } from '@gur/engine';
import { useAccount } from '@/account';
import { BotsSetup } from '@/components/BotsSetup';
import { OnlineSetup } from '@/components/OnlineSetup';
import { PageLink } from '@/components/PageLink';
import { PlayCard } from '@/components/PlayCard';
import { Popover } from '@/components/Popover';
import { TopBar } from '@/components/TopBar';
import { loadBotSettings, playAddress, saveBotSettings } from '@/game/botSettings';
import { inPhoneBrowser, useFullscreen } from '@/hooks/useFullscreen';
import { online } from '@/online/connection';
import { loadOnlineAceHigh, saveOnlineAceHigh } from '@/online/onlineSettings';
import { colors } from '@/theme';

// Bots play a run with the joker in it; friends sit together like a set of one number.
const BOT_TILES = [tileId('blue', 9), 104, tileId('blue', 11)] as const;
const FRIEND_TILES = [tileId('red', 7), tileId('yellow', 7), tileId('black', 7)] as const;
// Strangers from everywhere: one of each colour, a pair and a stranger.
const ONLINE_TILES = [tileId('yellow', 1), tileId('blue', 1), tileId('red', 13)] as const;

/**
 * The first screen: the name of the game and three big stones: playing against bots, with
 * friends, and online with other players. Your profile, friends and messages are at the top right.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const fullscreen = useFullscreen();
  // In a phone's browser the address bar takes room the table needs: say how to get rid of it.
  const [cramped] = useState(inPhoneBrowser);
  const [botsOpen, setBotsOpen] = useState(false);
  const [botSettings] = useState(loadBotSettings);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [onlineAceHigh] = useState(loadOnlineAceHigh);
  const { profile } = useAccount();

  // Three in a row where they fit; two and one below on an upright phone; one under the other
  // on a very narrow screen.
  const room = Math.min(screen.width, 960) - insets.left - insets.right - 40;
  const perRow = room >= 3 * 170 + 2 * GAP ? 3 : room >= 320 ? 2 : 1;
  // A phone held sideways is short: a smaller title and smaller stones, so all fit without scrolling.
  const short = screen.height < 520;
  const cardWidth = Math.floor(
    perRow === 1 ? Math.min(300, room) : Math.min(short ? 200 : 250, (room - GAP * (perRow - 1)) / perRow),
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        short && styles.contentShort,
        {
          paddingTop: 12 + insets.top,
          paddingBottom: 24 + insets.bottom,
          paddingLeft: 20 + insets.left,
          paddingRight: 20 + insets.right,
        },
      ]}
    >
      <TopBar />

      <View style={[styles.hero, short && styles.heroShort]}>
        <Text style={[styles.title, short && styles.titleShort]} accessibilityRole="header">
          Gur
        </Text>
        <Text style={styles.subtitle}>Tile rummy, the Kosovo way</Text>
      </View>

      <View style={[styles.cards, perRow === 1 && styles.cardsStacked, perRow === 2 && styles.cardsTwo]}>
        <PlayCard
          title="Play against bots"
          subtitle="Three bots, on this device"
          tiles={BOT_TILES}
          tilt={-4}
          width={cardWidth}
          onPress={() => setBotsOpen(true)}
        />
        <PlayCard
          title="Play with friends"
          subtitle="Create a lobby or join one"
          tiles={FRIEND_TILES}
          tilt={4}
          width={cardWidth}
          onPress={() => router.push('/friends')}
        />
        <PlayCard
          title="Play online"
          subtitle="Meet other players"
          tiles={ONLINE_TILES}
          tilt={-3}
          width={cardWidth}
          onPress={() => setOnlineOpen(true)}
        />
      </View>

      {cramped && !fullscreen.active && (
        <Text style={styles.note} testID="install-tip">
          {fullscreen.supported
            ? 'For the biggest table, play full screen (the button at the top left). Or add Gur to your home screen from the browser menu: it then opens like an app, without the address bar.'
            : 'For a bigger table, add Gur to your home screen: tap Share, then "Add to Home Screen". It then opens like an app, without the address bar.'}
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.about}>
          A free tile rummy game for 2 to 4 players. Play against bots, with friends by lobby code, or online with other
          players.
        </Text>
        <View style={styles.links}>
          <PageLink page="privacy.html">Privacy policy</PageLink>
          <Text style={styles.about}>·</Text>
          <PageLink page="terms.html">Terms of service</PageLink>
        </View>
      </View>

      <Popover title="Play against bots" place="centre" open={botsOpen} onClose={() => setBotsOpen(false)}>
        <BotsSetup
          initial={botSettings}
          onStart={(settings) => {
            saveBotSettings(settings);
            setBotsOpen(false);
            router.push(playAddress(settings));
          }}
        />
      </Popover>

      <Popover title="Play online" place="centre" open={onlineOpen} onClose={() => setOnlineOpen(false)}>
        <OnlineSetup
          username={profile?.username ?? null}
          initialName={online.savedName()}
          initialAceHigh={onlineAceHigh}
          onFind={async (name, aceHigh) => {
            saveOnlineAceHigh(aceHigh);
            const answer = await online.find(name, aceHigh);
            if (answer.ok) {
              setOnlineOpen(false);
              router.push('/lobby');
            }
            return answer;
          }}
        />
      </Popover>
    </ScrollView>
  );
}

const GAP = 28;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.table },
  content: { flexGrow: 1, alignItems: 'center', gap: 28, width: '100%', maxWidth: 960, alignSelf: 'center' },
  contentShort: { gap: 14 },
  hero: { alignItems: 'center', gap: 4, marginTop: 8 },
  heroShort: { marginTop: -44 },
  titleShort: { fontSize: 46 },
  title: { fontSize: 72, fontWeight: '900', color: colors.text, letterSpacing: 3 },
  subtitle: { fontSize: 16, color: colors.textMuted },
  cards: { flexDirection: 'row', gap: GAP, justifyContent: 'center', alignItems: 'flex-start', paddingVertical: 8 },
  cardsTwo: { flexWrap: 'wrap', rowGap: 18 },
  cardsStacked: { flexDirection: 'column', alignItems: 'center' },
  note: { fontSize: 13, color: colors.textMuted, textAlign: 'center', maxWidth: 340 },
  footer: { alignItems: 'center', gap: 6, marginTop: 'auto', maxWidth: 360 },
  about: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  links: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
