import cards from '../../data/cards.json' with { type: 'json' };
import { DECK } from './params.ts';
import type { Rng } from './rng.ts';
import type { DeckCard, EventCard } from './types.ts';

export const EVENT_CARDS: readonly EventCard[] = cards.events.map((e) => {
  if (e.weight !== 1 && e.weight !== 2 && e.weight !== 3) {
    throw new Error(`invalid weight: ${e.id}`);
  }
  return { kind: 'event', id: e.id, name: e.name, weight: e.weight, flavor: e.flavor };
});

/** SPEC 2.2: 山A(20枚)+ 思春期 + シャッフルした(山B + 巣立ち) */
export function buildDeck(rng: Rng, events: readonly EventCard[] = EVENT_CARDS): DeckCard[] {
  const shuffled = rng.shuffle(events);
  const pileA = shuffled.slice(0, DECK.pileA);
  const pileB = rng.shuffle<DeckCard>([...shuffled.slice(DECK.pileA), { kind: 'sudachi' }]);
  return [...pileA, { kind: 'shishunki' }, ...pileB];
}
