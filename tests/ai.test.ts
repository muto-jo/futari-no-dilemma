import { describe, expect, it } from 'vitest';
import { aiAction, aiConsult, aiUsesJikka, settleRequests } from '../src/engine/ai/play.ts';
import { strategy, STRATEGIES } from '../src/engine/ai/strategies.ts';
import { pairKey, ranking, runTournament } from '../src/engine/ai/tournament.ts';
import { buildView } from '../src/engine/ai/view.ts';
import { step } from '../src/engine/game.ts';
import { Rng } from '../src/engine/rng.ts';
import type { GameState } from '../src/engine/types.ts';
import { lastLog, playRound, setup, type Setup } from './helpers.ts';

function consultState(o: Setup) {
  const s = step(setup(o), { type: 'confirmEvent', useJikka: false });
  if (s.phase !== 'consult') throw new Error('consult');
  return s;
}

describe('AIの見る情報', () => {
  it('履歴・疲労・不満と、前のラウンドに不満を付けられたか', () => {
    // 1ラウンド目: 夫がやって妻が任せる(夫に不満+1)。2ラウンド目は重さ1
    const s0 = playRound(setup({ weight: 2 }), {
      promises: ['together', 'you'],
      actions: ['do', 'delegate'],
    });
    const s = step(step(s0, { type: 'next' }), { type: 'confirmEvent', useJikka: false });
    if (s.phase !== 'consult') throw new Error('consult');
    const h = buildView(s, 'husband');
    expect(h).toMatchObject({ my: [true], opp: [false], myTired: 1, oppTired: 0, myGrudge: 1, oppWrongedMe: true, round: 2, w: 1 });
    expect(buildView(s, 'wife').oppWrongedMe).toBe(false);
  });
});

describe('相談フェイズ(dilemma_c.py の play())', () => {
  const omoiyari = strategy('思いやり');

  it('疲れたら頼み、相手が受ければ 私がやる / あなたに頼む', () => {
    const s = consultState({ players: { husband: { tired: 4 }, wife: { tired: 0 } } });
    // 妻は「相手が疲労3以上・自分が限界でない」ので受ける
    const r = aiConsult(s, { husband: omoiyari, wife: omoiyari }, new Rng(1));
    expect(r.request).toEqual({ from: 'husband', accepted: true });
    expect(r.promises).toEqual({ husband: 'you', wife: 'me' });
  });

  it('お願いが不成立なら「一緒にやる」。約束を使わない戦略は null', () => {
    const s = consultState({ players: { husband: { tired: 4 } } });
    const r = aiConsult(s, { husband: omoiyari, wife: strategy('甘え上手') }, new Rng(1));
    expect(r.request).toEqual({ from: 'husband', accepted: false });
    expect(r.promises).toEqual({ husband: 'together', wife: 'together' });
    const t = aiConsult(s, { husband: omoiyari, wife: strategy('しっぺ返し') }, new Rng(1));
    expect(t.request).toEqual({ from: 'husband', accepted: false });
    expect(t.promises).toEqual({ husband: 'together', wife: null });
  });

  it('ダウン中は必ず頼み、約束は「あなたに頼む」', () => {
    const s = consultState({ players: { husband: { tired: 7 }, wife: { tired: 0 } } });
    const r = aiConsult(s, { husband: strategy('しっぺ返し'), wife: strategy('しっぺ返し') }, new Rng(1));
    expect(r.request).toEqual({ from: 'husband', accepted: false });
    expect(r.promises).toEqual({ husband: 'you', wife: null });
  });

  it('2人とも休みたいときは疲労が多いほうが頼む。同じなら乱数', () => {
    const s = consultState({ players: { husband: { tired: 5 }, wife: { tired: 4 } } });
    expect(settleRequests(s, { husband: true, wife: true }, new Rng(1))).toEqual({ husband: true, wife: false });
    const tie = consultState({ players: { husband: { tired: 4 }, wife: { tired: 4 } } });
    const firsts = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const r = settleRequests(tie, { husband: true, wife: true }, new Rng(seed));
      expect(r.husband !== r.wife).toBe(true);
      firsts.add(r.husband ? 'husband' : 'wife');
    }
    expect(firsts.size).toBe(2);
    const bothDown = consultState({ players: { husband: { tired: 8 }, wife: { tired: 8 } } });
    expect(settleRequests(bothDown, { husband: true, wife: true }, new Rng(1))).toEqual({ husband: true, wife: true });
  });
});

describe('役割カードのAIの使い方', () => {
  it('実家ヘルプは重さ3で使う', () => {
    expect(aiUsesJikka(setup({ weight: 3 }), 'wife')).toBe(true);
    expect(aiUsesJikka(setup({ weight: 2 }), 'wife')).toBe(false);
    expect(aiUsesJikka(setup({ weight: 3 }), 'husband')).toBe(false);
  });

  it('残業は、ダウンしていないときに最初に「任せる」を出したラウンドで使う', () => {
    let s: GameState = step(consultState({}), { type: 'endConsult' });
    s = step(s, { type: 'submitPromises', promises: { husband: null, wife: null } });
    if (s.phase !== 'action') throw new Error('action');
    expect(aiAction(s, 'husband', strategy('常に裏切り'), new Rng(1))).toEqual({ card: 'delegate', overtime: true });
    expect(aiAction(s, 'wife', strategy('常に裏切り'), new Rng(1))).toEqual({ card: 'delegate', overtime: false });
    expect(aiAction(s, 'husband', strategy('常に協力'), new Rng(1))).toEqual({ card: 'do' });
    const after = step(s, {
      type: 'submitActions',
      actions: { husband: { card: 'delegate', overtime: true }, wife: { card: 'do' } },
    });
    expect(lastLog(after).outcome.kind).toBe('overtime');
  });
});

describe('総当たり(SPEC 6.2 の目安)', () => {
  const t = runTournament({ gamesPerPair: 100 });
  const same = (name: string) => {
    const p = t.pairs.get(pairKey(name, name))!;
    return {
      success: p.results.success / p.games,
      collapse: p.results.collapse / p.games,
      divorce: p.results.divorce / p.games,
      total: (p.husbandScore + p.wifeScore) / p.games,
    };
  };

  it('Python と同じ21戦略を移植している', () => {
    expect(STRATEGIES).toHaveLength(21);
  });

  it('総当たりの平均点1位は思いやり', () => {
    expect(ranking(t)[0]!.name).toBe('思いやり');
  });

  it('思いやり同士: 家族成功100%、2人の合計 159〜179', () => {
    const x = same('思いやり');
    expect(x.success).toBe(1);
    expect(x.total).toBeGreaterThanOrEqual(159);
    expect(x.total).toBeLessThanOrEqual(179);
  });

  it('しっぺ返し同士: 家族成功95%以上、2人の合計 98〜118', () => {
    const x = same('しっぺ返し');
    expect(x.success).toBeGreaterThanOrEqual(0.95);
    expect(x.total).toBeGreaterThanOrEqual(98);
    expect(x.total).toBeLessThanOrEqual(118);
  });

  it('約束交代同士: 家族成功100%、2人の合計 120〜140', () => {
    const x = same('約束交代');
    expect(x.success).toBe(1);
    expect(x.total).toBeGreaterThanOrEqual(120);
    expect(x.total).toBeLessThanOrEqual(140);
  });

  it('ふざけパパ同士: 離婚 55〜77%', () => {
    const x = same('ふざけパパ');
    expect(x.divorce).toBeGreaterThanOrEqual(0.55);
    expect(x.divorce).toBeLessThanOrEqual(0.77);
  });

  it('常に裏切り同士: 共倒れ100%', () => {
    expect(same('常に裏切り').collapse).toBe(1);
  });
});
