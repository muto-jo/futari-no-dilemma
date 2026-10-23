import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/engine/types.ts';
import { ACCEPT, AI_TYPES, AiMatch, ASK, DECLINE, type AiTypeId } from '../src/ui/aiMatch.ts';
import { lastLog, setup, type Setup } from './helpers.ts';

/** 人間が夫、AIが妻。1枚目を公開した状態から始める */
function match(typeId: AiTypeId | null, o: Setup = {}, seed = 1): AiMatch {
  const m = new AiMatch({ humanRole: 'husband', humanName: 'たろう', typeId, seed });
  m.game = setup(o);
  return m;
}

const said = (m: AiMatch) => m.lines.map((l) => `${l.speaker ?? '-'}:${l.text}`);

describe('AIのタイプ(SPEC 5.2)', () => {
  it('A〜F の6タイプ', () => {
    expect(AI_TYPES.map((t) => `${t.id} ${t.label}/${t.strategy}`)).toEqual([
      'A 思いやりさん/思いやり',
      'B 頑張りすぎさん/頑張りすぎ',
      'C きっちり半分さん/約束交代',
      'D 黙ってお返しさん/しっぺ返し',
      'E ふざけ屋さん/ふざけパパ',
      'F 甘え上手さん/甘え上手',
    ]);
  });

  it('おまかせはタイプを伏せて「AI」と表示する', () => {
    const m = new AiMatch({ humanRole: 'wife', humanName: 'はなこ', typeId: null, seed: 3 });
    expect(m.surprise).toBe(true);
    expect(m.names).toEqual({ husband: 'AI', wife: 'はなこ' });
    expect(AI_TYPES).toContain(m.type);
  });
});

describe('相談フェイズ', () => {
  it('人間のお願いを、思いやりさんは(相手が疲れていれば)受ける', () => {
    const m = match('A', { players: { husband: { tired: 4 } } });
    m.confirmEvent(false);
    expect(m.stage).toEqual({ kind: 'open' });
    m.humanRequests();
    expect(m.stage).toEqual({ kind: 'done', request: { from: 'husband', accepted: true } });
    expect(said(m)).toContain(`wife:${ACCEPT}`);
    m.endConsult();
    m.choosePromise('you');
    // AIは合意どおり「私がやる」
    expect(m.game.phase === 'action' && m.game.promises).toEqual({ husband: 'you', wife: 'me' });
  });

  it('甘え上手さんは毎回お願いしてきて、頼まれても断る', () => {
    const m = match('F');
    m.confirmEvent(false);
    expect(m.stage).toEqual({ kind: 'aiAsks', alsoRequest: true });
    expect(said(m)).toEqual([`wife:${ASK}`]);
    m.answer(false);
    expect(m.stage).toEqual({ kind: 'done', request: { from: 'wife', accepted: false } });
    m.endConsult();
    m.choosePromise('together');
    expect(m.game.phase === 'action' && m.game.promises.wife).toBe('together');

    const n = match('F', { players: { husband: { tired: 5 } } });
    n.confirmEvent(false);
    n.humanRequests(); // 私も休みたい → 疲れている夫が頼む
    expect(n.stage).toEqual({ kind: 'done', request: { from: 'husband', accepted: false } });
    expect(said(n)).toContain(`wife:${DECLINE}`);
  });

  it('2人とも休みたいとき、AIのほうが疲れていればAIが頼み、人間が答える', () => {
    const m = match('F', { players: { husband: { tired: 1 }, wife: { tired: 5 } } });
    m.confirmEvent(false);
    m.humanRequests();
    expect(m.stage).toEqual({ kind: 'aiAsks', alsoRequest: false });
    m.answer(true);
    expect(m.stage).toEqual({ kind: 'done', request: { from: 'wife', accepted: true } });
    m.endConsult();
    m.choosePromise('me');
    expect(m.game.phase === 'action' && m.game.promises).toEqual({ husband: 'me', wife: 'you' });
  });

  it('黙ってお返しさんは相談しない。約束なしで、お願いには返事をしない', () => {
    const m = match('D', { players: { husband: { tired: 6 } } });
    m.confirmEvent(false);
    expect(m.stage).toEqual({ kind: 'open' });
    m.humanRequests();
    expect(m.stage).toEqual({ kind: 'done', request: { from: 'husband', accepted: false } });
    expect(said(m)).toContain('wife:……');
    m.endConsult();
    m.choosePromise('you');
    expect(m.game.phase === 'action' && m.game.promises.wife).toBeNull();
  });

  it('人間がダウン中なら自動でお願いする', () => {
    const m = match('B', { players: { husband: { tired: 7 } } });
    m.confirmEvent(false);
    expect(m.stage).toEqual({ kind: 'done', request: { from: 'husband', accepted: true } });
    m.endConsult();
    expect(m.humanPromises()).toEqual(['you']);
  });

  it('2人ともダウンなら、お願いは成り立たない', () => {
    // 疲労が違っても、ダウン中の人はどちらも頼む側になる(dilemma_c.py と同じ)
    const m = match('F', { players: { husband: { tired: 7 }, wife: { tired: 8 } } });
    m.confirmEvent(false);
    expect(m.stage).toEqual({ kind: 'done', request: null });
  });

  it('お願いしないで進むこともできる', () => {
    const m = match('A');
    m.confirmEvent(false);
    m.skipRequest();
    m.endConsult();
    m.choosePromise('together');
    expect(m.game.phase === 'action' && m.game.promises.wife).toBe('together');
  });
});

describe('役割カードと行動', () => {
  it('AIは実家ヘルプを重さ3で使う。人間が持っていれば人間が決める', () => {
    const m = match('A', { weight: 3, roleCards: { husband: 'overtime', wife: 'jikka' } });
    expect(m.humanHasJikka()).toBe(false);
    m.confirmEvent(false);
    expect(m.game.phase === 'consult' && m.game.turn.jikkaUsedBy).toBe('wife');

    const n = match('A', { weight: 3, roleCards: { husband: 'jikka', wife: 'overtime' } });
    expect(n.humanHasJikka()).toBe(true);
    n.confirmEvent(false);
    expect(n.game.phase === 'consult' && n.game.turn.jikkaUsedBy).toBeNull();
  });

  it('人間が行動を決めると、AIの行動と同時に公開される', () => {
    const m = match('A');
    m.confirmEvent(false);
    m.skipRequest();
    m.endConsult();
    m.choosePromise('together');
    expect(m.humanActions()).toEqual([{ card: 'do' }, { card: 'delegate' }, { card: 'delegate', overtime: true }]);
    m.chooseAction({ card: 'do' });
    expect(m.game.phase).toBe('resolved');
    // 思いやりさんは「一緒にやる」を守る
    expect(lastLog(m.game).actions).toEqual({ husband: 'do', wife: 'do' });
  });
});

describe('どのタイプとも最後まで遊べる', () => {
  for (const t of [...AI_TYPES.map((x) => x.id), null] as const) {
    it(`タイプ ${t ?? 'おまかせ'}`, () => {
      for (let seed = 0; seed < 30; seed++) {
        const m = new AiMatch({ humanRole: seed % 2 ? 'husband' : 'wife', humanName: 'わたし', typeId: t, seed });
        let guard = 0;
        while (m.game.phase !== 'ended') {
          if (guard++ > 1000) throw new Error('stuck');
          const g: GameState = m.game;
          if (g.phase === 'event') m.confirmEvent(seed % 3 === 0);
          else if (g.phase === 'consult') {
            const st = m.stage!;
            if (st.kind === 'open') (seed % 2 ? m.humanRequests() : m.skipRequest());
            else if (st.kind === 'aiAsks') m.answer(seed % 4 < 2);
            else m.endConsult();
          } else if (g.phase === 'promise') m.choosePromise(m.humanPromises()[seed % m.humanPromises().length]!);
          else if (g.phase === 'action') m.chooseAction(m.humanActions()[(seed + g.round) % m.humanActions().length]!);
          else m.next();
        }
      }
    });
  }
});
