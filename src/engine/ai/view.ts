import { opp, type GameState, type PromiseCard, type Role } from '../types.ts';

/** AI戦略が見る情報。dilemma_c.py の S() に対応する */
export interface AiView {
  readonly role: Role;
  /** 自分の過去の行動(true = やる) */
  readonly my: readonly boolean[];
  /** 相手の過去の行動 */
  readonly opp: readonly boolean[];
  readonly family: number;
  /** 実家ヘルプ適用後の重さ */
  readonly w: number;
  readonly round: number;
  readonly lateGame: boolean;
  readonly myGrudge: number;
  readonly oppGrudge: number;
  readonly myTired: number;
  readonly oppTired: number;
  /** 前のラウンドに相手のせいで不満が付いた */
  readonly oppWrongedMe: boolean;
  /** 行動を決めるときだけ入る */
  readonly myPromise?: PromiseCard | null;
  readonly oppPromise?: PromiseCard | null;
}

type TurnState = Extract<GameState, { phase: 'consult' | 'promise' | 'action' }>;

export function buildView(s: TurnState, role: Role): AiView {
  const o = opp(role);
  const last = s.history[s.history.length - 1];
  const view: AiView = {
    role,
    my: s.history.map((l) => l.actions[role] === 'do'),
    opp: s.history.map((l) => l.actions[o] === 'do'),
    family: s.family,
    w: s.turn.weight,
    round: s.round,
    lateGame: s.lateGame,
    myGrudge: s.players[role].grudge,
    oppGrudge: s.players[o].grudge,
    myTired: s.players[role].tired,
    oppTired: s.players[o].tired,
    oppWrongedMe: last !== undefined && last.grudgeAdded[role] > 0,
  };
  if (s.phase !== 'action') return view;
  return { ...view, myPromise: s.promises[role], oppPromise: s.promises[o] };
}
