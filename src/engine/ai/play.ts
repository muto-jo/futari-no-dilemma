// AIの判断(相談・約束・行動・役割カード)と、AI同士の1ゲーム。dilemma_c.py の play() に対応する
import { canDeclareOvertime, createGame, jikkaHolder, perRole, step } from '../game.ts';
import type { Rng } from '../rng.ts';
import {
  ROLES,
  opp,
  type ActionChoice,
  type ConsultRequest,
  type GameState,
  type PerRole,
  type PromiseCard,
  type Role,
  type RoleCard,
} from '../types.ts';
import { usesPromise, type Strategy } from './strategies.ts';
import { buildView } from './view.ts';

type ConsultState = Extract<GameState, { phase: 'consult' }>;
type ActionState = Extract<GameState, { phase: 'action' }>;

/** 実家ヘルプ: 最初に重さ3が出たときに使う */
export function aiUsesJikka(s: GameState, r: Role): boolean {
  return s.phase === 'event' && jikkaHolder(s) === r && s.event.weight === 3;
}

/** 自分からお願いしたいか(ダウン中は必ず頼む) */
export function aiWantsRequest(s: ConsultState, r: Role, st: Strategy, rng: Rng): boolean {
  return s.turn.down[r] || (st.request !== null && st.request(buildView(s, r), rng));
}

/** 頼まれたら受けるか。ダウン中と約束を使わない戦略は受けない */
export function aiAccepts(s: ConsultState, r: Role, st: Strategy, rng: Rng): boolean {
  if (s.turn.down[r] || st.accept === null) return false;
  return st.accept(buildView(s, r), rng);
}

/**
 * 2人とも休みたいときに、実際に言い出す人を決める。
 * 疲れているほうが頼む。同じなら乱数で決める(2人ともダウンなら、どちらも言い出さない)
 */
export function settleRequests(s: ConsultState, wants: PerRole<boolean>, rng: Rng): PerRole<boolean> {
  if (!(wants.husband && wants.wife)) return wants;
  const { down } = s.turn;
  const th = s.players.husband.tired;
  const tw = s.players.wife.tired;
  if (th === tw && !(down.husband && down.wife)) {
    const first = rng.pick(ROLES);
    return perRole((r) => (r === first ? true : down[r]));
  }
  if (th === tw) return down;
  const more: Role = th > tw ? 'husband' : 'wife';
  return perRole((r) => (r === more ? true : down[r]));
}

/** 相談の結果から約束カードを決める */
export function promisesFrom(
  s: ConsultState,
  request: ConsultRequest | null,
  strategies: PerRole<Strategy | null>,
): PerRole<PromiseCard | null> {
  return perRole((r) => {
    if (s.turn.down[r]) return 'you';
    if (request?.accepted) return request.from === r ? 'you' : 'me';
    const st = strategies[r];
    return st !== null && usesPromise(st) ? 'together' : null;
  });
}

/** AI同士の相談フェイズ */
export function aiConsult(
  s: ConsultState,
  strategies: PerRole<Strategy>,
  rng: Rng,
): { request: ConsultRequest | null; promises: PerRole<PromiseCard | null> } {
  const wants = settleRequests(
    s,
    perRole((r) => aiWantsRequest(s, r, strategies[r], rng)),
    rng,
  );
  let request: ConsultRequest | null = null;
  for (const r of ROLES) {
    if (wants[r] && !wants[opp(r)]) {
      request = { from: r, accepted: aiAccepts(s, opp(r), strategies[opp(r)], rng) };
    }
  }
  return { request, promises: promisesFrom(s, request, strategies) };
}

/** 行動。残業は、ダウンしていないときに最初に「任せる」を出したラウンドで使う */
export function aiAction(s: ActionState, r: Role, st: Strategy, rng: Rng): ActionChoice {
  if (s.turn.down[r]) return { card: 'delegate' };
  const doIt = st.act(buildView(s, r), rng);
  if (doIt) return { card: 'do' };
  return { card: 'delegate', overtime: canDeclareOvertime(s, r) };
}

export interface SelfPlayOptions {
  readonly roleCards?: PerRole<RoleCard>;
}

/** AI同士で1ゲーム遊ぶ。ゲームの seed も rng から取る */
export function playAiGame(
  strategies: PerRole<Strategy>,
  rng: Rng,
  opts: SelfPlayOptions = {},
): Extract<GameState, { phase: 'ended' }> {
  let s = createGame({ seed: rng.uint32(), roleCards: opts.roleCards });
  for (;;) {
    switch (s.phase) {
      case 'event': {
        const cur = s;
        s = step(s, { type: 'confirmEvent', useJikka: ROLES.some((r) => aiUsesJikka(cur, r)) });
        break;
      }
      case 'consult': {
        const { request, promises } = aiConsult(s, strategies, rng);
        s = step(s, { type: 'endConsult', request });
        s = step(s, { type: 'submitPromises', promises });
        break;
      }
      case 'promise':
        throw new Error('unreachable');
      case 'action': {
        const cur = s;
        const actions = perRole((r) => aiAction(cur, r, strategies[r], rng));
        s = step(s, { type: 'submitActions', actions });
        break;
      }
      case 'resolved':
        s = step(s, { type: 'next' });
        break;
      case 'ended':
        return s;
    }
  }
}
