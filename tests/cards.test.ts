import { describe, expect, it } from 'vitest';
import cards from '../data/cards.json';

describe('data/cards.json', () => {
  it('家事イベントは30枚で、重さ1・2・3が各10枚', () => {
    expect(cards.events).toHaveLength(30);
    for (const w of [1, 2, 3]) {
      expect(cards.events.filter((e) => e.weight === w)).toHaveLength(10);
    }
  });

  it('約束カードと行動カードのidがSPECどおり', () => {
    expect(cards.promiseCards.map((c) => c.id)).toEqual(['together', 'me', 'you']);
    expect(cards.actionCards.map((c) => c.id)).toEqual(['do', 'delegate']);
  });
});
