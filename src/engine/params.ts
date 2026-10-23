// SPEC 2.7 のパラメータ。値は reference/dilemma_c.py と一致させること
export const PARAMS = {
  /** 家庭ゲージの初期値 */
  initialFamily: 10,
  /** 家族成功の条件(巣立ち時の家庭ゲージがこの値以上) */
  successFamily: 10,
  /** 家族成功ボーナス */
  successBonus: 15,
  /** ダウンの疲労(この値以上でダウン) */
  downTired: 7,
  /** 睡眠での回復 */
  sleepRecovery: 1,
  /** お願い成立の休養 */
  restRecovery: 2,
  /** 信頼(一緒にやる) */
  trustTogether: 1,
  /** 信頼(お願い成立) */
  trustSplit: 2,
  /** 爆発・離婚の不満(この値以上) */
  grudgeLimit: 4,
  /** 約束破りの不満 */
  promiseBreakGrudge: 2,
  /** 離婚させた側の得点 */
  divorcePenalty: -10,
  /** AIがお願いを出す疲労の目安(この値以上) */
  aiRequestTired: 4,
} as const;

// SPEC 2.2 の山札の構成
export const DECK = {
  /** 重さごとの家事イベントの枚数 */
  eventsPerWeight: 10,
  /** 山A(思春期より前)の枚数 */
  pileA: 20,
} as const;

// SPEC 2.6 の家族ランク(2人の合計点の下限)。暫定値(SPEC 7.2)
export const RANKS = [
  { rank: 'S', min: 150 },
  { rank: 'A', min: 110 },
  { rank: 'B', min: 60 },
  { rank: 'C', min: Number.NEGATIVE_INFINITY },
] as const;
