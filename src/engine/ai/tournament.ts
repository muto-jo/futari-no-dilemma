// AI戦略の総当たり。dilemma_c.py の main() に対応する
import { Rng } from '../rng.ts';
import type { EndKind, PerRole, Role, RoleCard } from '../types.ts';
import { playAiGame } from './play.ts';
import { STRATEGIES, type Strategy } from './strategies.ts';

/** Python と同じ割り当て(残業は夫。実家ヘルプは誰が持っても同じ使い方) */
export const PYTHON_ROLE_CARDS: PerRole<RoleCard> = { husband: 'overtime', wife: 'jikka' };

export interface PairResult {
  readonly games: number;
  readonly results: Record<EndKind, number>;
  readonly husbandScore: number;
  readonly wifeScore: number;
  /** 相談でお願いが受け入れられた回数 */
  readonly requestsAccepted: number;
  readonly downs: number;
  readonly promiseBreaks: number;
}

export interface StrategyResult {
  readonly games: number;
  readonly score: number;
  readonly results: Record<EndKind, number>;
  readonly causedDivorce: number;
  readonly sufferedDivorce: number;
}

export interface TournamentResult {
  readonly names: readonly string[];
  /** キーは `${夫の戦略}|${妻の戦略}` */
  readonly pairs: ReadonlyMap<string, PairResult>;
  readonly strategies: ReadonlyMap<string, StrategyResult>;
}

export interface TournamentOptions {
  readonly gamesPerPair?: number;
  readonly seed?: number;
  /** 'python' は残業を夫に固定(既定)。'random' はエンジンの既定どおりランダムに配る */
  readonly roleCards?: 'python' | 'random';
  readonly strategies?: readonly Strategy[];
}

export const pairKey = (h: string, w: string) => `${h}|${w}`;

const emptyResults = (): Record<EndKind, number> => ({ success: 0, completed: 0, collapse: 0, divorce: 0 });

export function runTournament(opts: TournamentOptions = {}): TournamentResult {
  const n = opts.gamesPerPair ?? 100;
  const rng = new Rng(opts.seed ?? 2026);
  const list = opts.strategies ?? STRATEGIES;
  const roleCards = (opts.roleCards ?? 'python') === 'python' ? PYTHON_ROLE_CARDS : undefined;

  const agg = new Map<string, { games: number; score: number; results: Record<EndKind, number>; causedDivorce: number; sufferedDivorce: number }>();
  for (const s of list) {
    agg.set(s.name, { games: 0, score: 0, results: emptyResults(), causedDivorce: 0, sufferedDivorce: 0 });
  }
  const pairs = new Map<string, PairResult>();

  for (const h of list) {
    for (const w of list) {
      const p = { games: n, results: emptyResults(), husbandScore: 0, wifeScore: 0, requestsAccepted: 0, downs: 0, promiseBreaks: 0 };
      for (let i = 0; i < n; i++) {
        const g = playAiGame({ husband: h, wife: w }, rng, { roleCards });
        const e = g.ending;
        const sides: [Strategy, Role][] = [[h, 'husband'], [w, 'wife']];
        for (const [st, role] of sides) {
          const x = agg.get(st.name)!;
          x.games++;
          x.score += e.scores[role].total;
          x.results[e.kind]++;
          if (e.kind === 'divorce') {
            if (e.causer === role) x.causedDivorce++;
            else x.sufferedDivorce++;
          }
        }
        p.results[e.kind]++;
        p.husbandScore += e.scores.husband.total;
        p.wifeScore += e.scores.wife.total;
        for (const l of g.history) {
          if (l.request?.accepted) p.requestsAccepted++;
          p.downs += Number(l.down.husband) + Number(l.down.wife);
          p.promiseBreaks += l.promiseBroken.length;
        }
      }
      pairs.set(pairKey(h.name, w.name), p);
    }
  }
  return { names: list.map((s) => s.name), pairs, strategies: agg };
}

/** 平均点の高い順 */
export function ranking(t: TournamentResult): { name: string; average: number }[] {
  return t.names
    .map((name) => {
      const x = t.strategies.get(name)!;
      return { name, average: x.score / x.games };
    })
    .sort((a, b) => b.average - a.average);
}
