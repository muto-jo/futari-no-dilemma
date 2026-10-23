// 振り返り(SPEC 4)の問いに添える事実を、処理ログから数える(DOMに依存しない)
import { PARAMS } from '../engine/params.ts';
import { ROLES, type PerRole, type RoundLog } from '../engine/types.ts';
import { perRole } from '../engine/game.ts';

export interface PlayerFacts {
  /** お願い成立で休めた回数 */
  readonly rested: number;
  readonly downs: number;
  /** 疲労が初めて目安(4)以上になったラウンド(ラウンドの始めの疲労で数える) */
  readonly firstTired: number | null;
  readonly maxTired: number;
  /** 「一緒にやる」「私がやる」を出した回数 */
  readonly promised: number;
  /** そのうち、出したとおりに「やる」を出した回数 */
  readonly kept: number;
  /** 「やる」を出した回数 */
  readonly did: number;
  /** 家事で増えた疲労の合計(どれだけ家事を引き受けたか) */
  readonly load: number;
}

export interface Facts {
  readonly rounds: number;
  readonly agreed: number;
  readonly bothDo: number;
  readonly bothDelegate: number;
  readonly explosions: number;
  readonly players: PerRole<PlayerFacts>;
}

/** 「疲れてきた」とみなす目安。AIが「お願い」を出す疲労と同じ */
export const TIRED_SIGN = PARAMS.aiRequestTired;

export function factsOf(history: readonly RoundLog[]): Facts {
  const players = perRole(() => ({
    rested: 0,
    downs: 0,
    firstTired: null as number | null,
    maxTired: 0,
    promised: 0,
    kept: 0,
    did: 0,
    load: 0,
  }));
  const before = { husband: 0, wife: 0 };
  let agreed = 0;
  let bothDo = 0;
  let bothDelegate = 0;
  let explosions = 0;

  for (const l of history) {
    const o = l.outcome;
    if (o.kind === 'agreed') {
      agreed++;
      players[o.slacker].rested++;
    }
    if (o.kind === 'bothDo') bothDo++;
    if (o.kind === 'bothDelegate') bothDelegate++;
    explosions += l.explosions.length;
    for (const r of ROLES) {
      const p = players[r];
      if (p.firstTired === null && before[r] >= TIRED_SIGN) p.firstTired = l.round;
      p.maxTired = Math.max(p.maxTired, before[r], l.tiredAfter[r]);
      if (l.down[r]) p.downs++;
      const pr = l.promises[r];
      if (pr === 'together' || pr === 'me') {
        p.promised++;
        if (l.actions[r] === 'do') p.kept++;
      }
      if (l.actions[r] === 'do') p.did++;
      p.load += l.tiredGain[r];
      before[r] = l.tiredAfter[r];
    }
  }
  return { rounds: history.length, agreed, bothDo, bothDelegate, explosions, players };
}

/** ログの見出しに使う、結果の短い名前 */
export const OUTCOME_LABEL: Readonly<Record<RoundLog['outcome']['kind'], string>> = {
  bothDo: '2人でやった',
  bothDelegate: '2人とも任せた',
  agreed: 'お願い成立',
  slackerDown: 'ダウン中を支えた',
  overtime: '残業',
  plain: '片方がやった',
};
