export type Role = 'husband' | 'wife';
export const ROLES: readonly Role[] = ['husband', 'wife'];
export const opp = (r: Role): Role => (r === 'husband' ? 'wife' : 'husband');

export type PerRole<T> = Readonly<Record<Role, T>>;

/** 約束カード。null は約束カードを出さない(約束を使わないAI戦略) */
export type PromiseCard = 'together' | 'me' | 'you';
export type ActionCard = 'do' | 'delegate';
export type RoleCard = 'overtime' | 'jikka';

export interface EventCard {
  readonly kind: 'event';
  readonly id: string;
  readonly name: string;
  readonly weight: 1 | 2 | 3;
  readonly flavor: string;
}
export type DeckCard = EventCard | { readonly kind: 'shishunki' } | { readonly kind: 'sudachi' };

export interface PlayerState {
  readonly name: string;
  readonly free: number;
  readonly memory: number;
  readonly trust: number;
  readonly tired: number;
  readonly grudge: number;
  readonly roleCard: RoleCard;
  readonly roleCardUsed: boolean;
}

/** 相談フェイズのお願い(記録用。拘束力はない) */
export interface ConsultRequest {
  readonly from: Role;
  readonly accepted: boolean;
}

export interface ActionChoice {
  readonly card: ActionCard;
  /** 残業の使用宣言(「任せる」のときだけ) */
  readonly overtime?: boolean;
}

/** 片方だけがやったときの判定結果(SPEC 2.5 の上から順) */
export type OneSidedKind = 'agreed' | 'slackerDown' | 'overtime' | 'plain';
export type Outcome =
  | { readonly kind: 'bothDo'; readonly together: boolean }
  | { readonly kind: 'bothDelegate' }
  | { readonly kind: OneSidedKind; readonly doer: Role; readonly slacker: Role };

export interface Explosion {
  /** 不満が溜まった人 */
  readonly victim: Role;
  /** 不満を溜めさせた人 */
  readonly causer: Role;
  /** causer が失った自由時間 */
  readonly freeLost: number;
}

/** 1ラウンドの処理結果。画面のログと振り返りに使う */
export interface RoundLog {
  readonly round: number;
  readonly lateGame: boolean;
  readonly event: EventCard;
  /** 実家ヘルプ適用後の重さ */
  readonly weight: number;
  readonly jikkaUsedBy: Role | null;
  readonly down: PerRole<boolean>;
  readonly request: ConsultRequest | null;
  readonly promises: PerRole<PromiseCard | null>;
  readonly actions: PerRole<ActionCard>;
  readonly overtimeUsedBy: Role | null;
  readonly outcome: Outcome;
  readonly familyDelta: number;
  readonly familyAfter: number;
  /** やったことで増えた疲労 */
  readonly tiredGain: PerRole<number>;
  /** お願い成立の休養(睡眠とは別の回復量) */
  readonly rest: PerRole<number>;
  /** 睡眠と休養のあとの疲労 */
  readonly tiredAfter: PerRole<number>;
  readonly memoryGain: PerRole<number>;
  readonly freeGain: PerRole<number>;
  readonly trustGain: PerRole<number>;
  /** そのラウンドに付いた不満(約束破りとの max 済み) */
  readonly grudgeAdded: PerRole<number>;
  /** 約束を破った人 */
  readonly promiseBroken: readonly Role[];
  readonly explosions: readonly Explosion[];
}

export type EndKind = 'success' | 'completed' | 'collapse' | 'divorce';
export type Rank = 'S' | 'A' | 'B' | 'C';

export interface ScoreBreakdown {
  readonly free: number;
  readonly memory: number;
  readonly trust: number;
  readonly tired: number;
  /** 満足度 = 自由時間 + 思い出 + 信頼 − 残った疲労 */
  readonly satisfaction: number;
  readonly bonus: number;
  readonly total: number;
}

export interface Ending {
  readonly kind: EndKind;
  /** 離婚のときだけ */
  readonly causer: Role | null;
  readonly scores: PerRole<ScoreBreakdown>;
  readonly familyTotal: number;
  /** 共倒れ・離婚は null */
  readonly rank: Rank | null;
  /** 家族成功のときの MVP。同点なら2人 */
  readonly mvp: readonly Role[];
}

/** 公開後、ダウン判定まで済んだラウンドの情報 */
export interface Turn {
  readonly event: EventCard;
  readonly weight: number;
  readonly jikkaUsedBy: Role | null;
  readonly down: PerRole<boolean>;
}

interface Base {
  readonly seed: number;
  readonly rngState: number;
  readonly deck: readonly DeckCard[];
  /** 次にめくる山札の位置 */
  readonly deckPos: number;
  /** 家事のラウンド数(思春期は数えない) */
  readonly round: number;
  readonly lateGame: boolean;
  readonly family: number;
  readonly players: PerRole<PlayerState>;
  readonly history: readonly RoundLog[];
}

export type GameState =
  | (Base & { readonly phase: 'event'; readonly event: EventCard })
  | (Base & { readonly phase: 'consult'; readonly turn: Turn })
  | (Base & { readonly phase: 'promise'; readonly turn: Turn; readonly request: ConsultRequest | null })
  | (Base & {
      readonly phase: 'action';
      readonly turn: Turn;
      readonly request: ConsultRequest | null;
      readonly promises: PerRole<PromiseCard | null>;
    })
  | (Base & { readonly phase: 'resolved'; readonly last: RoundLog })
  | (Base & { readonly phase: 'ended'; readonly last: RoundLog | null; readonly ending: Ending });

export type Phase = GameState['phase'];

export type GameInput =
  /** イベント公開。実家ヘルプの持ち主が使うか */
  | { readonly type: 'confirmEvent'; readonly useJikka: boolean }
  | { readonly type: 'endConsult'; readonly request?: ConsultRequest | null }
  | { readonly type: 'submitPromises'; readonly promises: PerRole<PromiseCard | null> }
  | { readonly type: 'submitActions'; readonly actions: PerRole<ActionChoice> }
  | { readonly type: 'next' };
