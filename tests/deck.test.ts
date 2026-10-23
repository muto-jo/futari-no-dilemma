import { describe, expect, it } from 'vitest';
import { buildDeck, EVENT_CARDS } from '../src/engine/deck.ts';
import { createGame, step } from '../src/engine/game.ts';
import { Rng } from '../src/engine/rng.ts';
import type { GameState } from '../src/engine/types.ts';

describe('山札の構成(SPEC 2.2)', () => {
  it('家事30枚・思春期が21枚目・巣立ちが22〜32枚目', () => {
    const sudachiAt = new Set<number>();
    for (let seed = 0; seed < 500; seed++) {
      const deck = buildDeck(new Rng(seed));
      expect(deck).toHaveLength(32);
      const events = deck.filter((c) => c.kind === 'event');
      expect(events).toHaveLength(30);
      expect(new Set(events.map((e) => e.id)).size).toBe(30);
      expect(deck.findIndex((c) => c.kind === 'shishunki')).toBe(20);
      expect(deck.filter((c) => c.kind === 'shishunki')).toHaveLength(1);
      expect(deck.filter((c) => c.kind === 'sudachi')).toHaveLength(1);
      const i = deck.findIndex((c) => c.kind === 'sudachi');
      expect(i).toBeGreaterThanOrEqual(21);
      expect(i).toBeLessThanOrEqual(31);
      sudachiAt.add(i);
    }
    // 巣立ちは山Bの11か所のどこにでも入りうる
    expect([...sudachiAt].sort((a, b) => a - b)).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);
  });

  it('cards.json の家事は重さ1・2・3が各10枚', () => {
    for (const w of [1, 2, 3]) expect(EVENT_CARDS.filter((e) => e.weight === w)).toHaveLength(10);
  });

  it('家事は20〜30ラウンド。思春期はラウンドに数えず、21ラウンド目から終盤', () => {
    const rounds = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      let s: GameState = createGame({ seed });
      while (s.phase !== 'ended') {
        if (s.phase === 'event') {
          expect(s.lateGame).toBe(s.round >= 21);
          s = step(s, { type: 'confirmEvent', useJikka: false });
        } else if (s.phase === 'consult') {
          s = step(s, { type: 'endConsult' });
        } else if (s.phase === 'promise') {
          const h = s.round % 2 === 1;
          s = step(s, {
            type: 'submitPromises',
            promises: { husband: h ? 'me' : 'you', wife: h ? 'you' : 'me' },
          });
        } else if (s.phase === 'action') {
          // 交互にお願いを成立させる(疲労が溜まらず、ダウンしない)
          const h = s.round % 2 === 1;
          s = step(s, {
            type: 'submitActions',
            actions: { husband: { card: h ? 'do' : 'delegate' }, wife: { card: h ? 'delegate' : 'do' } },
          });
        } else {
          s = step(s, { type: 'next' });
        }
      }
      if (s.ending.kind === 'success' || s.ending.kind === 'completed') rounds.add(s.round);
    }
    expect(Math.min(...rounds)).toBe(20);
    expect(Math.max(...rounds)).toBe(30);
  });
});
