// reference/dilemma_c.py の STRATS の移植。名前も Python と同じにする
import { PARAMS } from '../params.ts';
import type { Rng } from '../rng.ts';
import type { AiView } from './view.ts';

export type Decide = (v: AiView, rng: Rng) => boolean;

export interface Strategy {
  readonly name: string;
  /** お願いするか。null は約束カードを使わない戦略 */
  readonly request: Decide | null;
  /** 頼まれたら受けるか */
  readonly accept: Decide | null;
  /** やるか(true)任せるか(false) */
  readonly act: Decide;
}

/** 自分の番か(奇数ラウンドは夫、偶数ラウンドは妻) */
const myTurn = (v: AiView) => (v.round % 2 === 1) === (v.role === 'husband');

// ---- 約束カードを使わない戦略(行動だけ決める) -----------------------
const allc: Decide = () => true;
const alld: Decide = () => false;
const rand: Decide = (_v, rng) => rng.random() < 0.5;
const tft: Decide = (v) => (v.opp.length > 0 ? v.opp[v.opp.length - 1]! : true);
const gtft: Decide = (v, rng) => {
  if (v.opp.length === 0 || v.opp[v.opp.length - 1]) return true;
  return rng.random() < 1 / 3;
};
const tf2t: Decide = (v) => !(v.opp.length >= 2 && !v.opp[v.opp.length - 1] && !v.opp[v.opp.length - 2]);
const grim: Decide = (v) => v.opp.every((x) => x);
const pavlov: Decide = (v) => {
  if (v.my.length === 0) return true;
  const myLast = v.my[v.my.length - 1]!;
  return v.opp[v.opp.length - 1] ? myLast : !myLast;
};
const prober: Decide = (v) => {
  const n = v.my.length;
  if (n < 3) return [false, true, true][n]!;
  if (v.opp[1] && v.opp[2]) return false;
  return v.opp[v.opp.length - 1]!;
};
const brink: Decide = (v) => v.family <= v.w + 2;
const weight: Decide = (v) => v.w === 1;
const grudgeMgr: Decide = (v) => v.oppGrudge >= 3;
// Python は round >= DIVORCE_FROM(21)。思春期は21ラウンド目の前に必ず出るので終盤フラグと同じ
const endgame: Decide = (v, rng) => (v.lateGame ? false : tft(v, rng));
const alternate: Decide = (v) => myTurn(v);

// ---- 約束カードを使う戦略 ---------------------------------------------
const no: Decide = () => false;
const yes: Decide = () => true;

const reqTired: Decide = (v) => v.myTired >= PARAMS.aiRequestTired;
/** 相手が本当に疲れていて、自分が限界でなければ受ける */
const accFair: Decide = (v) => v.oppTired >= 3 && v.myTired + v.w < PARAMS.downTired;
const keep: Decide = (v) => v.myPromise === 'together' || v.myPromise === 'me';
const keepTft: Decide = (v, rng) => (v.oppWrongedMe ? false : keep(v, rng));
const joker: Decide = (v, rng) => {
  if (v.myPromise === 'you') return false;
  return rng.random() >= 0.25;
};
const liar: Decide = () => false;
const reqTurn: Decide = (v) => !myTurn(v);
const accTurn: Decide = (v) => myTurn(v);
const accUnlessWronged: Decide = (v, rng) => accFair(v, rng) && !v.oppWrongedMe;

const plain = (name: string, act: Decide): Strategy => ({ name, request: null, accept: null, act });
const talk = (name: string, request: Decide, accept: Decide, act: Decide): Strategy => ({
  name,
  request,
  accept,
  act,
});

export const STRATEGIES: readonly Strategy[] = [
  plain('常に協力', allc),
  plain('常に裏切り', alld),
  plain('ランダム', rand),
  plain('しっぺ返し', tft),
  plain('寛容TFT', gtft),
  plain('2回でTFT', tf2t),
  plain('グラッジャー', grim),
  plain('パブロフ', pavlov),
  plain('探り屋', prober),
  plain('崖っぷち', brink),
  plain('重さ選び', weight),
  plain('不満管理', grudgeMgr),
  plain('終盤裏切り', endgame),
  plain('交代制(約束なし)', alternate),
  talk('思いやり', reqTired, accFair, keep),
  talk('思いやりTFT', reqTired, accUnlessWronged, keepTft),
  talk('頑張りすぎ', no, yes, keep),
  talk('約束交代', reqTurn, accTurn, keep),
  talk('甘え上手', yes, no, keep),
  talk('ふざけパパ', reqTired, accFair, joker),
  talk('口だけ', reqTired, accFair, liar),
];

export function strategy(name: string): Strategy {
  const s = STRATEGIES.find((x) => x.name === name);
  if (!s) throw new Error(`unknown strategy: ${name}`);
  return s;
}

export const usesPromise = (s: Strategy): boolean => s.request !== null;
