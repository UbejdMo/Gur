import { GameTable } from './GameTable';
import { ResultsOverlay } from './ResultsOverlay';
import { usePracticeGame } from '@/game/usePracticeGame';
import type { PracticeOptions } from '@/game/usePracticeGame';

type Props = PracticeOptions & { onMenu: () => void };

/** The practice table: you against three bots, all on this device. */
export function Table({ onMenu, ...options }: Props) {
  const p = usePracticeGame(options);
  return (
    <GameTable
      table={p}
      overlay={
        p.view.status !== 'playing' && (
          <ResultsOverlay
            view={p.view}
            names={p.names}
            primary={{ label: 'Play again', onPress: p.playAgain }}
            onMenu={onMenu}
          />
        )
      }
    />
  );
}
