// 画面の共通部品
import { PARAMS } from '../engine/params.ts';
import { ROLES, type EventCard, type GameState, type PerRole, type Role, type RoundLog } from '../engine/types.ts';
import { describeRound } from './describe.ts';
import { h, type Child } from './dom.ts';
import { OUTCOME_LABEL } from './reflect.ts';
import { ACTION_NAME, PROMISE_NAME, ROLE_LABEL, roleCardInfo } from './text.ts';

/** 2人を区別する中立な2色(CSS の --p-husband / --p-wife) */
export const playerClass = (r: Role) => `p-${r}`;

/** 「あなた: たろう(夫役)」の表示(AIと対戦・オンライン対戦) */
export function youAre(me: Role, names: PerRole<string>): HTMLElement {
  return h('p', { class: `you-are ${playerClass(me)}` }, 'あなた: ', nameTag(me, names), h('b', null, `${ROLE_LABEL[me]}役`));
}

export function nameTag(r: Role, names: PerRole<string>): HTMLElement {
  return h('span', { class: `name-tag ${playerClass(r)}` }, names[r]);
}

/** トークンを丸で並べる。limit はダウン・爆発の目安 */
function tokens(n: number, limit: number, label: string): HTMLElement {
  const slots = Math.max(n, limit);
  const dots: HTMLElement[] = [];
  for (let i = 0; i < slots; i++) {
    dots.push(h('span', { class: `dot${i < n ? ' on' : ''}${i === limit - 1 ? ' limit' : ''}` }));
  }
  return h(
    'div',
    { class: 'tokens', 'aria-label': `${label} ${n}(${limit}で${label === '疲労' ? 'ダウン' : 'あふれる'})` },
    h('span', { class: 'tokens-label' }, label),
    h('span', { class: 'dots', 'aria-hidden': 'true' }, dots),
    h('span', { class: 'tokens-num' }, n),
  );
}

/** me を渡すと、その人の枠に「あなた」の印を付ける(AIと対戦・オンライン対戦) */
export function statusPanel(g: GameState, names: PerRole<string>, me: Role | null = null): HTMLElement {
  const fam = g.family;
  const scale = Math.max(20, fam);
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / scale) * 100))}%`;
  const phaseNote = g.lateGame
    ? '終盤(思春期のあと)。巣立ちはいつ来てもおかしくない。不満が4つで離婚'
    : '序盤。巣立ちはまだ先。不満が4つで爆発';

  return h(
    'section',
    { class: 'status', 'aria-label': '現在の状況' },
    h(
      'div',
      { class: 'family' },
      h('div', { class: 'family-head' }, h('span', null, '家庭ゲージ'), h('b', { class: 'family-num' }, fam)),
      h(
        'div',
        { class: 'bar', role: 'img', 'aria-label': `家庭ゲージ ${fam}。10以上で家族成功` },
        h('span', { class: `bar-fill${fam >= PARAMS.successFamily ? ' ok' : ''}`, style: `width:${pct(fam)}` }),
        h('span', { class: 'bar-goal', style: `left:${pct(PARAMS.successFamily)}` }),
      ),
      h('div', { class: 'note' }, '10以上で巣立ちを迎えると家族成功'),
    ),
    h('div', { class: `phase-note${g.lateGame ? ' late' : ''}` }, phaseNote),
    h('div', { class: 'players' }, ROLES.map((r) => playerBox(g, r, names, me))),
  );
}

function playerBox(g: GameState, r: Role, names: PerRole<string>, me: Role | null): HTMLElement {
  const p = g.players[r];
  const down = p.tired >= PARAMS.downTired;
  const card = roleCardInfo(p.roleCard);
  return h(
    'div',
    { class: `player ${playerClass(r)}${r === me ? ' me' : ''}` },
    r === me ? h('span', { class: 'badge you' }, 'あなた') : null,
    h(
      'div',
      { class: 'player-head' },
      h('span', { class: 'player-name' }, names[r]),
      h('span', { class: 'player-role' }, `${ROLE_LABEL[r]}役`),
      down ? h('span', { class: 'badge down' }, 'ダウン') : null,
    ),
    tokens(p.tired, PARAMS.downTired, '疲労'),
    tokens(p.grudge, PARAMS.grudgeLimit, '不満'),
    h(
      'dl',
      { class: 'scores' },
      h('div', null, h('dt', null, '自由時間'), h('dd', null, p.free)),
      h('div', null, h('dt', null, '思い出'), h('dd', null, p.memory)),
      h('div', null, h('dt', null, '信頼'), h('dd', null, p.trust)),
    ),
    h('div', { class: `role-card${p.roleCardUsed ? ' used' : ''}` }, `${card.name}${p.roleCardUsed ? '(使用済み)' : ''}`),
  );
}

export function weightPips(w: number): HTMLElement {
  const pips: HTMLElement[] = [];
  for (let i = 0; i < 3; i++) pips.push(h('span', { class: `pip${i < w ? ' on' : ''}` }));
  return h('span', { class: 'pips', 'aria-hidden': 'true' }, pips);
}

export function eventCard(e: EventCard, weight: number = e.weight): HTMLElement {
  return h(
    'article',
    { class: 'event-card', 'aria-label': `家事カード ${e.name} 重さ${weight}` },
    h('div', { class: 'event-weight' }, weightPips(weight), h('span', null, weight === e.weight ? `重さ${weight}` : `重さ${e.weight}→${weight}`)),
    h('h2', { class: 'event-name' }, e.name),
    h('p', { class: 'event-flavor' }, e.flavor),
  );
}

export function panel(title: Child, ...body: (Child | Child[])[]): HTMLElement {
  return h('section', { class: 'panel' }, title ? h('h3', null, title) : null, ...body);
}

export function roundResult(l: RoundLog, names: PerRole<string>): HTMLElement {
  const t = describeRound(l, names);
  return panel(
    '公開',
    h('ul', { class: 'reveal' }, ROLES.map((r, i) => h('li', { class: playerClass(r) }, t.reveal[i]))),
    h('ul', { class: 'lines' }, t.lines.map((x) => h('li', null, x))),
  );
}

let logOpen = false;

/** 開閉できるログ(新しい順) */
export function logView(history: readonly RoundLog[], names: PerRole<string>): HTMLElement | null {
  if (history.length === 0) return null;
  const details = h(
    'details',
    { class: 'log', open: logOpen },
    h('summary', null, `これまでのログ(${history.length}ラウンド)`),
    [...history].reverse().map((l) => logRound(l, names)),
  );
  details.addEventListener('toggle', () => {
    logOpen = details.open;
  });
  return details;
}

export function resetLogView(): void {
  logOpen = false;
}

const plus = (label: string, n: number) => (n > 0 ? `${label}+${n}` : null);

/** ログの1ラウンド: 見出し(結果と家庭ゲージの変化)、2人それぞれの変化、くわしい説明 */
function logRound(l: RoundLog, names: PerRole<string>): HTMLElement {
  const t = describeRound(l, names);
  const familyBefore = l.familyAfter - l.familyDelta;
  return h(
    'div',
    { class: 'log-round' },
    h(
      'div',
      { class: 'log-head' },
      h('b', null, `第${l.round}ラウンド`),
      h('span', null, `${l.event.name}(重さ${l.weight})`),
      h('span', { class: `tag ${l.outcome.kind}` }, OUTCOME_LABEL[l.outcome.kind]),
    ),
    h('div', { class: 'log-family' }, `家庭ゲージ ${familyBefore} → ${l.familyAfter}`),
    h(
      'ul',
      { class: 'log-players' },
      ROLES.map((r) => {
        const changes = [
          `疲労→${l.tiredAfter[r]}`,
          plus('不満', l.grudgeAdded[r]),
          plus('自由時間', l.freeGain[r]),
          plus('思い出', l.memoryGain[r]),
          plus('信頼', l.trustGain[r]),
        ].filter((x): x is string => x !== null);
        return h(
          'li',
          { class: playerClass(r) },
          h('b', null, names[r]),
          ` 「${PROMISE_NAME(l.promises[r])}」→「${ACTION_NAME[l.actions[r]]}」${l.down[r] ? '(ダウン中)' : ''}`,
          h('span', { class: 'log-changes' }, changes.join(' ')),
        );
      }),
    ),
    h('ul', { class: 'log-lines' }, t.lines.map((x) => h('li', null, x))),
  );
}

/** 家庭ゲージの推移(結果画面) */
export function familyChart(history: readonly RoundLog[]): HTMLElement | null {
  if (history.length === 0) return null;
  const values = [PARAMS.initialFamily, ...history.map((l) => l.familyAfter)];
  const max = Math.max(20, ...values);
  const min = Math.min(0, ...values);
  const W = 300;
  const H = 120;
  const pad = 8;
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + ((max - v) / (max - min)) * (H - pad * 2);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'family-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `家庭ゲージの推移: ${values.join('、')}`);
  const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    svg.append(e);
    return e;
  };
  el('line', { x1: pad, x2: W - pad, y1: y(0), y2: y(0), class: 'axis' });
  el('line', { x1: pad, x2: W - pad, y1: y(PARAMS.successFamily), y2: y(PARAMS.successFamily), class: 'goal' });
  el('polyline', { points: values.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'line' });
  const last = values[values.length - 1]!;
  el('circle', { cx: x(values.length - 1), cy: y(last), r: 4, class: 'dot-end' });
  return h(
    'figure',
    { class: 'chart' },
    svg,
    h('figcaption', { class: 'note' }, `家庭ゲージの推移(はじめ ${values[0]} → 最後 ${last})。点線は家族成功の目安(10)`),
  );
}
