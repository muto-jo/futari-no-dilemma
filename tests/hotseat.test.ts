import { describe, expect, it } from 'vitest';
import type { Ending } from '../src/engine/types.ts';
import { describeEnding, describeRound } from '../src/ui/describe.ts';
import { Hotseat } from '../src/ui/hotseat.ts';
import { ev, lastLog, setup } from './helpers.ts';

const names = { husband: 'たろう', wife: 'はなこ' };

describe('1台で2人の手順(SPEC 5.1)', () => {
  it('1人ずつ選び、前の人の選択は stage に出ない。「同時に公開」でエンジンに渡る', () => {
    const hs = new Hotseat(setup({ weight: 2 }), names);
    hs.confirmEvent(false);
    hs.endConsult();
    hs.startSecret();
    expect(hs.stage).toEqual({ kind: 'handoff', who: 'husband' });
    hs.ready();
    expect(hs.choosingPromises()).toEqual(['together', 'me', 'you']);
    hs.pickPromise('me');
    expect(hs.stage).toEqual({ kind: 'passed', who: 'husband', next: 'wife' });
    expect(JSON.stringify(hs.stage)).not.toContain('me"');
    hs.passOn();
    expect(hs.stage).toEqual({ kind: 'handoff', who: 'wife' });
    hs.ready();
    hs.pickPromise('you');
    expect(hs.stage).toEqual({ kind: 'allChosen' });
    hs.reveal();
    expect(hs.game.phase).toBe('action');
    expect(hs.game.phase === 'action' && hs.game.promises).toEqual({ husband: 'me', wife: 'you' });

    hs.startSecret();
    hs.ready();
    // 夫は残業を持っている
    expect(hs.choosingActions()).toEqual([{ card: 'do' }, { card: 'delegate' }, { card: 'delegate', overtime: true }]);
    hs.pickAction({ card: 'do' });
    hs.passOn();
    hs.ready();
    expect(hs.choosingActions()).toEqual([{ card: 'do' }, { card: 'delegate' }]);
    hs.pickAction({ card: 'delegate' });
    hs.reveal();
    expect(hs.game.phase).toBe('resolved');
    expect(lastLog(hs.game).outcome.kind).toBe('agreed');
  });

  it('ダウン中の人は選ぶ手順を飛ばし、固定のカードになる', () => {
    const hs = new Hotseat(setup({ players: { husband: { tired: 7 } } }), names);
    hs.confirmEvent(false);
    hs.endConsult();
    hs.startSecret();
    expect(hs.stage).toEqual({ kind: 'handoff', who: 'wife' });
    hs.ready();
    hs.pickPromise('me');
    expect(hs.stage).toEqual({ kind: 'allChosen' });
    hs.reveal();
    expect(hs.game.phase === 'action' && hs.game.promises).toEqual({ husband: 'you', wife: 'me' });
  });

  it('相談なしなら、イベント公開のあとすぐ約束カードへ進む', () => {
    const hs = new Hotseat(setup({ weight: 2, rest: [ev(1), { kind: 'sudachi' }] }), names, false);
    hs.confirmEvent(false);
    expect(hs.game.phase).toBe('promise');
    hs.startSecret();
    hs.ready();
    hs.pickPromise('together');
    hs.passOn();
    hs.ready();
    hs.pickPromise('together');
    hs.reveal();
    hs.startSecret();
    hs.ready();
    hs.pickAction({ card: 'do' });
    hs.passOn();
    hs.ready();
    hs.pickAction({ card: 'do' });
    hs.reveal();
    hs.next();
    hs.confirmEvent(false);
    expect(hs.game.phase).toBe('promise');
    expect(hs.game.round).toBe(2);
  });

  it('2人ともダウンなら、すぐ「2人とも選びました」', () => {
    const hs = new Hotseat(setup({ players: { husband: { tired: 7 }, wife: { tired: 9 } } }), names);
    hs.confirmEvent(false);
    hs.endConsult();
    hs.startSecret();
    expect(hs.stage).toEqual({ kind: 'allChosen' });
  });

  it('選べないカードは受け付けない', () => {
    const hs = new Hotseat(setup({ players: { husband: { tired: 7 } } }), names);
    hs.confirmEvent(false);
    hs.endConsult();
    hs.startSecret();
    expect(() => hs.pickPromise('me')).toThrow(); // まだ受け取っていない
    hs.ready();
    hs.pickPromise('together');
    hs.reveal();
    hs.startSecret();
    hs.ready();
    expect(() => hs.pickAction({ card: 'delegate', overtime: true })).toThrow(); // 妻は残業を持っていない
  });
});

describe('画面の文', () => {
  it('ラウンドの結果を名前入りで書く', () => {
    const hs = new Hotseat(setup({ weight: 2 }), names);
    hs.confirmEvent(false);
    hs.endConsult();
    hs.startSecret();
    hs.ready();
    hs.pickPromise('together');
    hs.passOn();
    hs.ready();
    hs.pickPromise('together');
    hs.reveal();
    hs.startSecret();
    hs.ready();
    hs.pickAction({ card: 'do' });
    hs.passOn();
    hs.ready();
    hs.pickAction({ card: 'delegate' });
    hs.reveal();
    const t = describeRound(lastLog(hs.game), names);
    expect(t.title).toBe('第1ラウンド テスト2(重さ2)');
    expect(t.reveal).toEqual(['たろう: 約束「一緒にやる」 / 行動「やる」', 'はなこ: 約束「一緒にやる」 / 行動「任せる」']);
    expect(t.lines.join('\n')).toContain('はなこは「一緒にやる」を出していたので、たろうの不満が+2に。');
  });

  it('離婚の文は不満を溜めさせた側の名前と点を事実として書く', () => {
    const e: Ending = {
      kind: 'divorce',
      causer: 'wife',
      scores: {
        husband: { free: 0, memory: 0, trust: 0, tired: 0, satisfaction: 0, bonus: 0, total: 0 },
        wife: { free: 0, memory: 0, trust: 0, tired: 0, satisfaction: 0, bonus: 0, total: -10 },
      },
      familyTotal: -10,
      rank: null,
      mvp: [],
    };
    const t = describeEnding(e, 5, names);
    expect(t.title).toBe('離婚');
    expect(t.message).toContain('たろうの不満');
    expect(t.message).toContain('(はなこ)は−10点');
  });
});
