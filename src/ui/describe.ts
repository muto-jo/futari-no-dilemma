// 処理ログと終わり方を、画面に出す文に変える(DOMに依存しない)
import { ROLES, opp, type Ending, type PerRole, type Role, type RoundLog } from '../engine/types.ts';
import { ACTION_NAME, PROMISE_NAME } from './text.ts';

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

export interface RoundText {
  title: string;
  /** 約束と行動の公開内容 */
  reveal: string[];
  /** 何が起きたか */
  lines: string[];
}

export function describeRound(l: RoundLog, names: PerRole<string>): RoundText {
  const n = (r: Role) => names[r];
  const title = `第${l.round}ラウンド ${l.event.name}(重さ${l.weight})`;
  const reveal = ROLES.map((r) => {
    const parts = [`約束「${PROMISE_NAME(l.promises[r])}」`, `行動「${ACTION_NAME[l.actions[r]]}」`];
    if (l.overtimeUsedBy === r) parts.push('残業を宣言');
    return `${n(r)}: ${parts.join(' / ')}${l.down[r] ? '(ダウン中)' : ''}`;
  });

  const lines: string[] = [];
  if (l.jikkaUsedBy) lines.push(`${n(l.jikkaUsedBy)}が実家ヘルプを使い、重さが${l.event.weight}→${l.weight}に。`);
  const o = l.outcome;
  switch (o.kind) {
    case 'bothDo':
      lines.push(`2人でやりました。家庭${signed(l.familyDelta)}、思い出+${l.weight}ずつ、疲労+${l.tiredGain.husband}ずつ。`);
      if (o.together) lines.push('「一緒にやる」のとおり。信頼+1ずつ。');
      break;
    case 'bothDelegate':
      lines.push(`2人とも任せたので、家事が回りませんでした。家庭${signed(l.familyDelta)}。`);
      break;
    case 'agreed':
      lines.push(
        `お願い成立。${n(o.doer)}がやり(疲労+${l.weight})、${n(o.slacker)}はひと休み(疲労−${l.rest[o.slacker]})。信頼+2ずつ。`,
      );
      break;
    case 'slackerDown':
      lines.push(`${n(o.doer)}がやりました(疲労+${l.weight})。${n(o.slacker)}はダウン中なので不満は付きません。心配で家庭−1。`);
      break;
    case 'overtime':
      lines.push(`${n(o.slacker)}は残業。${n(o.doer)}がやりました(疲労+${l.weight})。不満は付かず、自由時間もなし。`);
      break;
    case 'plain':
      lines.push(
        `${n(o.doer)}がやりました(疲労+${l.weight}、不満+1)。${n(o.slacker)}は自由時間+${l.freeGain[o.slacker]}。`,
      );
      break;
  }
  for (const r of l.promiseBroken) {
    lines.push(`${n(r)}は「${PROMISE_NAME(l.promises[r])}」を出していたので、${n(opp(r))}の不満が+2に。`);
  }
  for (const x of l.explosions) {
    lines.push(`${n(x.victim)}の不満があふれて爆発。${n(x.causer)}の自由時間が半分に(−${x.freeLost})。${n(x.victim)}の不満は0に戻りました。`);
  }
  lines.push(`ひと晩眠って、疲労は ${ROLES.map((r) => `${n(r)} ${l.tiredAfter[r]}`).join(' / ')}。`);
  return { title, reveal, lines };
}

export interface EndingText {
  title: string;
  message: string;
}

export function describeEnding(e: Ending, family: number, names: PerRole<string>): EndingText {
  switch (e.kind) {
    case 'success':
      return {
        title: '家族成功!',
        message: `子どもが巣立ちました。家庭ゲージ${family}で、2人とも家族成功ボーナス+15。`,
      };
    case 'completed':
      return {
        title: '完走',
        message: `子どもが巣立ちました。家庭ゲージは${family}(10以上なら家族成功でした)。`,
      };
    case 'collapse':
      return {
        title: '共倒れ',
        message: '家庭ゲージが0以下になり、家庭が回らなくなりました。2人とも0点です。',
      };
    case 'divorce': {
      const c = e.causer ?? 'husband';
      return {
        title: '離婚',
        message: `終盤に${names[opp(c)]}の不満が溜まりきり、2人は別々の道を選びました。ルールにより、不満を溜めさせた側(${names[c]})は−10点、もう1人は0点です。`,
      };
    }
  }
}
