import { ROLES, type ScoreBreakdown } from '../../engine/types.ts';
import type { Nav } from '../app.ts';
import { describeEnding } from '../describe.ts';
import { button, h } from '../dom.ts';
import type { Hotseat } from '../hotseat.ts';
import { logView, nameTag, panel, playerClass } from '../parts.ts';

const QUESTIONS = [
  'あなたが「お願い」を言い出せなかった場面はありましたか?',
  '相手の疲労トークンに気づいたのはいつでしたか?',
  '実際の家では、どのタイプに近いですか?',
];

/** マイナスは全角の「−」で表す(ほかの表示とそろえる) */
const num = (n: number) => (n < 0 ? `−${-n}` : String(n));

const ROWS: [string, (s: ScoreBreakdown) => string][] = [
  ['自由時間', (s) => num(s.free)],
  ['思い出', (s) => num(s.memory)],
  ['信頼', (s) => num(s.trust)],
  ['残った疲労', (s) => (s.tired ? `−${s.tired}` : '0')],
  ['満足度', (s) => num(s.satisfaction)],
  ['家族成功ボーナス', (s) => (s.bonus ? `+${s.bonus}` : '—')],
];

export function renderResult(nav: Nav, hs: Hotseat): HTMLElement {
  const g = hs.game;
  if (g.phase !== 'ended') throw new Error('result before end');
  const e = g.ending;
  const names = hs.names;
  const t = describeEnding(e, g.family, names);
  const finishedNormally = e.kind === 'success' || e.kind === 'completed';

  const table = h(
    'table',
    { class: 'score-table' },
    h('thead', null, h('tr', null, h('th', null, ''), ROLES.map((r) => h('th', { class: playerClass(r) }, names[r])))),
    h(
      'tbody',
      null,
      finishedNormally ? ROWS.map(([label, f]) => h('tr', null, h('th', null, label), ROLES.map((r) => h('td', null, f(e.scores[r]))))) : null,
      h('tr', { class: 'total' }, h('th', null, '得点'), ROLES.map((r) => h('td', null, num(e.scores[r].total)))),
    ),
  );

  return h(
    'main',
    { class: 'screen' },
    h('header', { class: 'bar-head' }, h('h1', null, '結果')),
    h(
      'section',
      { class: `result-head ${e.kind}` },
      h('h2', null, t.title),
      h('p', null, t.message),
      e.rank
        ? h('div', { class: 'rank' }, h('span', null, '家族ランク'), h('b', null, e.rank), h('span', null, `2人の合計 ${num(e.familyTotal)}点`))
        : null,
      e.mvp.length === 1 ? h('p', { class: 'mvp' }, '今回のMVP: ', nameTag(e.mvp[0]!, names)) : null,
      e.mvp.length === 2 ? h('p', { class: 'mvp' }, '今回のMVP: 2人とも(同点)') : null,
    ),
    panel(
      '得点の内訳',
      table,
      finishedNormally ? h('p', { class: 'note' }, '満足度 = 自由時間 + 思い出 + 信頼 − 残った疲労') : null,
    ),
    panel('振り返り', h('ol', { class: 'questions' }, QUESTIONS.map((q) => h('li', null, q)))),
    logView(g.history, names),
    h(
      'div',
      { class: 'actions' },
      button('もう一度', () => nav.go({ name: 'setup', dealt: null }), 'btn primary big'),
      button('タイトルへ', () => nav.go({ name: 'title' }), 'btn big'),
    ),
  );
}
