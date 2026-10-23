import { describe, expect, it } from 'vitest';
import { step } from '../src/engine/game.ts';
import type { GameState } from '../src/engine/types.ts';
import { factsOf } from '../src/ui/reflect.ts';
import { ev, playRound, setup } from './helpers.ts';

describe('振り返りの事実', () => {
  it('お願い成立・約束・負担を数える', () => {
    // 1: 夫がやって妻が休む(お願い成立) 2: 2人でやる 3: 妻が約束したのに任せる
    let s: GameState = setup({ weight: 3, rest: [ev(2), ev(1), { kind: 'sudachi' }] });
    s = step(playRound(s, { promises: ['me', 'you'], actions: ['do', 'delegate'] }), { type: 'next' });
    s = step(playRound(s, { actions: ['do', 'do'] }), { type: 'next' });
    s = playRound(s, { promises: ['together', 'together'], actions: ['do', 'delegate'] });
    const f = factsOf(s.history);
    expect(f.rounds).toBe(3);
    expect(f.agreed).toBe(1);
    expect(f.bothDo).toBe(1);
    expect(f.players.wife).toMatchObject({ rested: 1, promised: 2, kept: 1, did: 1, load: 1 });
    // 夫: 3 + 1 + 1 の疲労を引き受けた
    expect(f.players.husband).toMatchObject({ rested: 0, promised: 3, kept: 3, did: 3, load: 5 });
  });

  it('疲労が初めて4以上になったラウンドと、疲労の最大を数える', () => {
    // 夫が重さ3を1人でやり続ける: ラウンド後の疲労 2 → 4 → 6
    let s: GameState = setup({ weight: 3, rest: [ev(3), ev(3), { kind: 'sudachi' }] });
    for (let i = 0; i < 3; i++) {
      s = playRound(s, { promises: ['me', 'you'], actions: ['do', 'delegate'] });
      if (s.phase === 'resolved') s = step(s, { type: 'next' });
    }
    const f = factsOf(s.history);
    // 3ラウンド目の始めに疲労4
    expect(f.players.husband.firstTired).toBe(3);
    expect(f.players.husband.maxTired).toBe(6);
    expect(f.players.wife.firstTired).toBeNull();
  });
});
