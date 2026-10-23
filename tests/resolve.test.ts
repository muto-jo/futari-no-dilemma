import { describe, expect, it } from 'vitest';
import { canDeclareOvertime, createGame, GameError, legalPromises, rankOf, step } from '../src/engine/game.ts';
import type { GameState } from '../src/engine/types.ts';
import { deepFreeze, ev, lastLog, playRound, setup } from './helpers.ts';

function ended(s: GameState) {
  if (s.phase !== 'ended') throw new Error(`not ended: ${s.phase}`);
  return s.ending;
}

describe('処理表(SPEC 2.5)', () => {
  it('2人ともやる: 家庭+w、思い出+w、疲労+ceil(w/2)。2人とも「一緒にやる」なら信頼+1', () => {
    const s = playRound(setup({ weight: 3, players: { husband: { tired: 3 } } }), {
      actions: ['do', 'do'],
    });
    expect(s.family).toBe(13);
    expect(s.players.husband).toMatchObject({ memory: 3, trust: 1, tired: 3 + 2 - 1 });
    expect(s.players.wife).toMatchObject({ memory: 3, trust: 1, tired: 0 + 2 - 1 });
    expect(lastLog(s).outcome).toEqual({ kind: 'bothDo', together: true });
  });

  it('2人ともやる: 約束が「一緒にやる」同士でなければ信頼は付かない', () => {
    for (const promises of [['me', 'you'], ['together', 'me'], [null, null]] as const) {
      const s = playRound(setup(), { promises: [...promises], actions: ['do', 'do'] });
      expect(s.players.husband.trust).toBe(0);
      expect(s.players.wife.trust).toBe(0);
      expect(lastLog(s).outcome).toEqual({ kind: 'bothDo', together: false });
    }
  });

  it('お願い成立: 家庭±0、やった人は疲労+w、任せた人は休養(疲労−2)、各自信頼+2、自由時間なし', () => {
    const s = playRound(setup({ weight: 2, players: { wife: { tired: 5 } } }), {
      promises: ['me', 'you'],
      actions: ['do', 'delegate'],
    });
    expect(s.family).toBe(10);
    expect(s.players.husband).toMatchObject({ tired: 0 + 2 - 1, trust: 2, grudge: 0 });
    expect(s.players.wife).toMatchObject({ tired: 5 - 2 - 1, trust: 2, free: 0 });
    expect(lastLog(s).outcome).toEqual({ kind: 'agreed', doer: 'husband', slacker: 'wife' });
    expect(lastLog(s).rest).toEqual({ husband: 0, wife: 2 });
  });

  it('任せた人がダウン中: 家庭−1、やった人に不満は付かない', () => {
    const s = playRound(setup({ weight: 2, players: { wife: { tired: 7 } } }), {
      promises: ['together', 'you'],
      actions: ['do', 'delegate'],
    });
    expect(s.family).toBe(9);
    expect(s.players.husband).toMatchObject({ tired: 1, grudge: 0 });
    expect(s.players.wife).toMatchObject({ tired: 6, free: 0, trust: 0 });
    expect(lastLog(s).outcome.kind).toBe('slackerDown');
  });

  it('残業を宣言して任せた: 家庭±0、やった人に不満は付かない、任せた人に自由時間なし', () => {
    const s = playRound(setup({ weight: 2 }), {
      promises: ['you', 'together'],
      actions: ['overtime', 'do'],
    });
    expect(s.family).toBe(10);
    expect(s.players.wife.grudge).toBe(0);
    expect(s.players.husband.free).toBe(0);
    expect(s.players.husband.roleCardUsed).toBe(true);
    expect(lastLog(s).outcome.kind).toBe('overtime');
    expect(lastLog(s).overtimeUsedBy).toBe('husband');
  });

  it('上記以外の片方だけ: やった人は疲労+wと不満+1、任せた人は自由時間+w', () => {
    const s = playRound(setup({ weight: 2 }), {
      promises: ['together', 'you'],
      actions: ['do', 'delegate'],
    });
    expect(s.family).toBe(10);
    expect(s.players.husband).toMatchObject({ tired: 1, grudge: 1 });
    expect(s.players.wife).toMatchObject({ free: 2, grudge: 0 });
    expect(lastLog(s).outcome).toEqual({ kind: 'plain', doer: 'husband', slacker: 'wife' });
  });

  it('2人とも任せる: 家庭−(w+1)', () => {
    const s = playRound(setup({ weight: 2 }), { promises: ['you', 'you'], actions: ['delegate', 'delegate'] });
    expect(s.family).toBe(7);
    expect(s.players.husband.grudge + s.players.wife.grudge).toBe(0);
    expect(lastLog(s).outcome).toEqual({ kind: 'bothDelegate' });
  });

  describe('片方だけの判定順(お願い成立 > ダウン > 残業 > それ以外)', () => {
    it('お願い成立はダウンより先', () => {
      const s = playRound(setup({ weight: 2, players: { wife: { tired: 7 } } }), {
        promises: ['me', 'you'],
        actions: ['do', 'delegate'],
      });
      expect(lastLog(s).outcome.kind).toBe('agreed');
      expect(s.family).toBe(10);
      expect(s.players.wife.tired).toBe(7 - 2 - 1);
    });

    it('お願い成立は残業より先(残業は使用済みになる)', () => {
      const s = playRound(setup({ weight: 2 }), { promises: ['you', 'me'], actions: ['overtime', 'do'] });
      expect(lastLog(s).outcome.kind).toBe('agreed');
      expect(s.players.husband).toMatchObject({ trust: 2, roleCardUsed: true });
    });

    it('2人とも任せた場合も、残業は宣言したら使用済み', () => {
      const s = playRound(setup({ weight: 2 }), { promises: ['you', 'you'], actions: ['overtime', 'delegate'] });
      expect(lastLog(s).outcome.kind).toBe('bothDelegate');
      expect(s.family).toBe(7);
      expect(s.players.husband.roleCardUsed).toBe(true);
    });
  });
});

describe('約束破り', () => {
  it('「一緒にやる」で任せたら相手の不満+2。表の+1とは足さずに max', () => {
    const s = playRound(setup({ weight: 2 }), { promises: ['together', 'together'], actions: ['do', 'delegate'] });
    expect(s.players.husband.grudge).toBe(2);
    expect(s.players.wife.free).toBe(2);
    expect(lastLog(s).promiseBroken).toEqual(['wife']);
    expect(lastLog(s).grudgeAdded).toEqual({ husband: 2, wife: 0 });
  });

  it('「私がやる」で任せても約束破り。2人とも任せたなら相手だけに+2', () => {
    const s = playRound(setup({ weight: 2 }), { promises: ['me', 'you'], actions: ['delegate', 'delegate'] });
    expect(s.players.wife.grudge).toBe(2);
    expect(s.players.husband.grudge).toBe(0);
    expect(lastLog(s).promiseBroken).toEqual(['husband']);
  });

  it('2人とも「一緒にやる」で2人とも任せたら、お互いに+2', () => {
    const s = playRound(setup({ weight: 2 }), { actions: ['delegate', 'delegate'] });
    expect(s.players.husband.grudge).toBe(2);
    expect(s.players.wife.grudge).toBe(2);
  });

  it('残業を宣言しても約束破りの不満は付く', () => {
    const s = playRound(setup({ weight: 2 }), { promises: ['together', 'together'], actions: ['overtime', 'do'] });
    expect(lastLog(s).outcome.kind).toBe('overtime');
    expect(s.players.wife.grudge).toBe(2);
  });

  it('「あなたに頼む」や約束なしで任せても約束破りではない', () => {
    const s = playRound(setup({ weight: 2 }), { promises: ['you', null], actions: ['delegate', 'delegate'] });
    expect(lastLog(s).promiseBroken).toEqual([]);
  });
});

describe('睡眠', () => {
  it('疲労 = max(0, 疲労 − 休養 − 1)', () => {
    const s = playRound(setup({ weight: 1, players: { husband: { tired: 4 }, wife: { tired: 1 } } }), {
      promises: ['you', 'me'],
      actions: ['delegate', 'do'],
    });
    expect(s.players.husband.tired).toBe(4 - 2 - 1);
    expect(s.players.wife.tired).toBe(1 + 1 - 1);

    const t = playRound(setup({ weight: 1, players: { husband: { tired: 1 } } }), {
      promises: ['you', 'me'],
      actions: ['delegate', 'do'],
    });
    expect(t.players.husband.tired).toBe(0);
  });
});

describe('不満チェック', () => {
  it('思春期より前は爆発: causer の自由時間を半分(切り捨て)にし、不満を0に戻す', () => {
    const s = playRound(setup({ weight: 2, players: { husband: { grudge: 3 }, wife: { free: 7 } } }), {
      promises: ['together', 'you'],
      actions: ['do', 'delegate'],
    });
    expect(s.phase).toBe('resolved');
    expect(s.players.husband.grudge).toBe(0);
    expect(s.players.wife.free).toBe(4); // (7 + 2) / 2 の切り捨て
    expect(lastLog(s).explosions).toEqual([{ victim: 'husband', causer: 'wife', freeLost: 5 }]);
  });

  it('思春期より後は離婚: 即座に終了。causer は−10、もう1人は0', () => {
    const s = playRound(setup({ weight: 2, lateGame: true, players: { husband: { grudge: 3, free: 20 } } }), {
      promises: ['together', 'you'],
      actions: ['do', 'delegate'],
    });
    const e = ended(s);
    expect(e.kind).toBe('divorce');
    expect(e.causer).toBe('wife');
    expect(e.scores.wife.total).toBe(-10);
    expect(e.scores.husband.total).toBe(0);
    expect(e.rank).toBeNull();
    expect(e.mvp).toEqual([]);
  });

  it('夫→妻の順に判定する(2人同時に4以上)', () => {
    const before = { husband: { grudge: 2, free: 5 }, wife: { grudge: 2, free: 9 } };
    const s = playRound(setup({ weight: 2, players: before }), { actions: ['delegate', 'delegate'] });
    expect(lastLog(s).explosions.map((x) => x.victim)).toEqual(['husband', 'wife']);
    expect(s.players.wife.free).toBe(4);
    expect(s.players.husband.free).toBe(2);

    const late = playRound(setup({ weight: 2, lateGame: true, players: before }), {
      actions: ['delegate', 'delegate'],
    });
    expect(ended(late).causer).toBe('wife');
  });
});

describe('共倒れ', () => {
  it('家庭ゲージが0以下で終了。2人とも0点', () => {
    const s = playRound(setup({ weight: 2, family: 3, players: { husband: { free: 10 } } }), {
      promises: ['you', 'you'],
      actions: ['delegate', 'delegate'],
    });
    const e = ended(s);
    expect(e.kind).toBe('collapse');
    expect(e.scores.husband.total).toBe(0);
    expect(e.scores.wife.total).toBe(0);
    expect(e.rank).toBeNull();
  });

  it('家庭ゲージ1なら続く', () => {
    const s = playRound(setup({ weight: 1, family: 3, players: {} }), {
      promises: ['you', 'you'],
      actions: ['delegate', 'delegate'],
    });
    expect(s.family).toBe(1);
    expect(s.phase).toBe('resolved');
  });

  it('離婚の判定は共倒れより先', () => {
    const s = playRound(
      setup({ weight: 2, family: 1, lateGame: true, players: { husband: { grudge: 2 }, wife: { grudge: 2 } } }),
      { actions: ['delegate', 'delegate'] },
    );
    expect(ended(s).kind).toBe('divorce');
  });
});

describe('終了と得点(SPEC 2.6)', () => {
  const toEnd = (s: GameState) => step(s, { type: 'next' });

  it('巣立ち・家庭ゲージ10以上は家族成功: 満足度 + 15', () => {
    const s = toEnd(playRound(setup({ weight: 2, rest: [{ kind: 'sudachi' }] }), { actions: ['do', 'do'] }));
    const e = ended(s);
    expect(e.kind).toBe('success');
    // 思い出2 + 信頼1 − 疲労0
    expect(e.scores.husband).toEqual({ free: 0, memory: 2, trust: 1, tired: 0, satisfaction: 3, bonus: 15, total: 18 });
    expect(e.familyTotal).toBe(36);
    expect(e.mvp).toEqual(['husband', 'wife']);
  });

  it('満足度から残った疲労を引く。MVPは個人の得点が高いほう', () => {
    const s = toEnd(
      playRound(setup({ weight: 2, rest: [{ kind: 'sudachi' }] }), {
        promises: ['together', 'you'],
        actions: ['do', 'delegate'],
      }),
    );
    const e = ended(s);
    expect(e.kind).toBe('success');
    expect(e.scores.husband.total).toBe(-1 + 15);
    expect(e.scores.wife.total).toBe(2 + 15);
    expect(e.mvp).toEqual(['wife']);
  });

  it('巣立ち・家庭ゲージ9以下は完走: 満足度のみ。MVPなし', () => {
    const s = toEnd(playRound(setup({ weight: 2, family: 7, rest: [{ kind: 'sudachi' }] }), { actions: ['do', 'do'] }));
    const e = ended(s);
    expect(s.family).toBe(9);
    expect(e.kind).toBe('completed');
    expect(e.scores.wife.total).toBe(3);
    expect(e.rank).toBe('C');
    expect(e.mvp).toEqual([]);
  });

  it('家族ランク: S 150以上 / A 110〜149 / B 60〜109 / C 0〜59', () => {
    expect([150, 149, 110, 109, 60, 59, 0].map(rankOf)).toEqual(['S', 'A', 'A', 'B', 'B', 'C', 'C']);
  });
});

describe('イベント公開・ダウン・役割カード', () => {
  it('疲労7以上でダウン。約束は「あなたに頼む」、行動は「任せる」で固定', () => {
    let s: GameState = step(setup({ players: { husband: { tired: 7 }, wife: { tired: 6 } } }), {
      type: 'confirmEvent',
      useJikka: false,
    });
    expect(s.phase === 'consult' && s.turn.down).toEqual({ husband: true, wife: false });
    s = step(s, { type: 'endConsult' });
    expect(legalPromises(s, 'husband')).toEqual(['you']);
    const promise = s;
    expect(() =>
      step(promise, { type: 'submitPromises', promises: { husband: 'together', wife: 'together' } }),
    ).toThrow(GameError);
    expect(() => step(promise, { type: 'submitPromises', promises: { husband: null, wife: null } })).toThrow(GameError);
    s = step(s, { type: 'submitPromises', promises: { husband: 'you', wife: 'together' } });
    const action = s;
    expect(canDeclareOvertime(action, 'husband')).toBe(false);
    expect(() =>
      step(action, { type: 'submitActions', actions: { husband: { card: 'do' }, wife: { card: 'do' } } }),
    ).toThrow(GameError);
    expect(() =>
      step(action, {
        type: 'submitActions',
        actions: { husband: { card: 'delegate', overtime: true }, wife: { card: 'do' } },
      }),
    ).toThrow(GameError);
  });

  it('実家ヘルプ: w = max(1, w − 1)。1回だけ使える', () => {
    const s = step(setup({ weight: 3, rest: [ev(1), { kind: 'sudachi' }] }), { type: 'confirmEvent', useJikka: true });
    expect(s.phase === 'consult' && s.turn).toMatchObject({ weight: 2, jikkaUsedBy: 'wife' });
    expect(s.players.wife.roleCardUsed).toBe(true);
    expect(() => step(s, { type: 'confirmEvent', useJikka: true })).toThrow(GameError);

    const one = step(setup({ weight: 1 }), { type: 'confirmEvent', useJikka: true });
    expect(one.phase === 'consult' && one.turn.weight).toBe(1);

    const used = setup({ players: { wife: { roleCardUsed: true } } });
    expect(() => step(used, { type: 'confirmEvent', useJikka: true })).toThrow(GameError);
  });

  it('残業は持ち主が「任せる」のときだけ。1回だけ使える', () => {
    const s = setup({ rest: [ev(1), { kind: 'sudachi' }] });
    expect(() => playRound(s, { actions: ['do', 'overtime'] })).toThrow(GameError); // 妻は持っていない
    expect(() => playRound(s, { actions: ['overtime', 'overtime'] })).toThrow(GameError);
    const once = step(playRound(s, { promises: ['you', 'me'], actions: ['overtime', 'do'] }), { type: 'next' });
    expect(() => playRound(once, { promises: ['you', 'me'], actions: ['overtime', 'do'] })).toThrow(GameError);
  });

  it('役割カードは2人に1枚ずつ、ランダムに配る', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const { players } = createGame({ seed });
      expect(new Set([players.husband.roleCard, players.wife.roleCard])).toEqual(new Set(['overtime', 'jikka']));
      seen.add(players.husband.roleCard);
    }
    expect(seen.size).toBe(2);
  });

  it('フェイズ違いの入力はエラー', () => {
    expect(() => step(setup(), { type: 'next' })).toThrow(GameError);
    expect(() => step(setup(), { type: 'endConsult' })).toThrow(GameError);
  });
});

describe('不変性と再現性', () => {
  it('入力の状態を書き換えない', () => {
    const s = deepFreeze(setup({ weight: 3, players: { husband: { grudge: 3, free: 5 } } }));
    expect(() => playRound(s, { jikka: true, actions: ['do', 'delegate'] })).not.toThrow();
  });

  it('同じ seed と同じ入力なら同じ結果', () => {
    const run = () => {
      let s = createGame({ seed: 12345 });
      // 夫がやり続けてもダウンしない3ラウンドだけ進める
      for (let i = 0; i < 3 && s.phase === 'event'; i++) {
        s = step(playRound(s, { promises: ['me', 'you'], actions: ['do', 'delegate'] }), { type: 'next' });
      }
      return s;
    };
    expect(run()).toEqual(run());
    expect(createGame({ seed: 1 }).deck).not.toEqual(createGame({ seed: 2 }).deck);
  });
});
