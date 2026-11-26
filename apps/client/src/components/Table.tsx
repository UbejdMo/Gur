import { GameTable } from './GameTable';
import { ResultsOverlay } from './ResultsOverlay';
import { usePracticeGame } from '@/game/usePracticeGame';
import type { PracticeOptions } from '@/game/usePracticeGame';
import { useT } from '@/i18n';

type Props = PracticeOptions & { onMenu: () => void };

/** The practice table: you against three bots, all on this device. */
export function Table({ onMenu, ...options }: Props) {
  const t = useT();
  const p = usePracticeGame(options);
  return (
    <GameTable
      table={p}
      onLeave={onMenu}
      leaveNote={t.table.botsLeaveNote}
      overlay={
        p.view.status !== 'playing' && (
          <ResultsOverlay
            view={p.view}
            names={p.names}
            primary={{ label: t.results.playAgain, onPress: p.playAgain }}
            onMenu={onMenu}
          />
        )
      }
    />
  );
}
