// AI戦略の総当たり(SPEC 6.2)。reference/simulation_results_trust_1_2.txt と見比べるための出力
// 使い方: npm run sim -- [--games=100] [--seed=2026] [--roles=python|random]
import { PARAMS } from '../src/engine/params.ts';
import { pairKey, ranking, runTournament } from '../src/engine/ai/tournament.ts';
import { usesPromise, STRATEGIES } from '../src/engine/ai/strategies.ts';

// @types/node を入れないため、process は最小限の型で受ける
const argv: readonly string[] = (globalThis as { process?: { argv: string[] } }).process?.argv ?? [];
const arg = (name: string): string | undefined =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const n = Number(arg('games') ?? 100);
const seed = Number(arg('seed') ?? 2026);
const roles = arg('roles') === 'random' ? 'random' : 'python';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const f1 = (x: number) => x.toFixed(1);
// 全角を幅2として左寄せ
const width = (s: string) => [...s].reduce((w, c) => w + (c.charCodeAt(0) > 0xff ? 2 : 1), 0);
const padEnd = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - width(s)));
const padStart = (s: string, w: number) => ' '.repeat(Math.max(0, w - width(s))) + s;

const started = Date.now();
const t = runTournament({ gamesPerPair: n, seed, roleCards: roles });
const k = t.names.length;

console.log(`信頼の加点: 一緒にやる ${PARAMS.trustTogether} / お願い成立 ${PARAMS.trustSplit}`);
console.log(`役割カード: ${roles === 'python' ? '残業=夫・実家ヘルプ=妻(Pythonと同じ)' : 'ランダムに配る'} / seed ${seed}`);
console.log(`=== ${k}戦略 総当たり(${k * k}組 × ${n}戦 = ${k * k * n}ゲーム) ===`);
console.log(
  padEnd('戦略', 20) + ['平均点', '家族成功', '共倒れ', '離婚させた', '離婚された'].map((h) => padStart(h, 11)).join(''),
);
const promiseUsers = new Set(STRATEGIES.filter(usesPromise).map((s) => s.name));
for (const { name, average } of ranking(t)) {
  const x = t.strategies.get(name)!;
  const g = x.games;
  const mark = promiseUsers.has(name) ? '*' : ' ';
  console.log(
    padEnd(mark + name, 20) +
      [f1(average), pct(x.results.success / g), pct(x.results.collapse / g), pct(x.causedDivorce / g), pct(x.sufferedDivorce / g)]
        .map((v) => padStart(v, 11))
        .join(''),
  );
}
console.log('(*は相談・約束をする戦略)');

console.log('\n--- 同じ戦略同士の夫婦 ---');
for (const name of t.names) {
  const p = t.pairs.get(pairKey(name, name))!;
  const sum = (p.husbandScore + p.wifeScore) / n;
  console.log(
    `${name}: 成功${pct(p.results.success / n)} 共倒れ${pct(p.results.collapse / n)} 離婚${pct(p.results.divorce / n)} ` +
      `点 夫${f1(p.husbandScore / n)}/妻${f1(p.wifeScore / n)}(合計${f1(sum)}) | 1戦あたり ` +
      `お願い成立${f1(p.requestsAccepted / n)} ダウン${f1(p.downs / n)} 約束破り${f1(p.promiseBreaks / n)}`,
  );
}

let h = 0;
let w = 0;
for (const p of t.pairs.values()) {
  h += p.husbandScore;
  w += p.wifeScore;
}
console.log(`\n役割差: 夫の平均点 ${f1(h / (k * k * n))} / 妻の平均点 ${f1(w / (k * k * n))}`);
console.log(`(${((Date.now() - started) / 1000).toFixed(1)}秒)`);
