// 画面の共通部品
import { PARAMS } from '../engine/params.ts';
import { ROLES, type EventCard, type GameState, type PerRole, type Role, type RoundLog } from '../engine/types.ts';
import { describeRound } from './describe.ts';
import { h, type Child } from './dom.ts';
import { ROLE_LABEL, roleCardInfo } from './text.ts';

/** 2人を区別する中立な2色(CSS の --p-husband / --p-wife) */
export const playerClass = (r: Role) => `p-${r}`;

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

export function statusPanel(g: GameState, names: PerRole<string>): HTMLElement {
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
    h('div', { class: 'players' }, ROLES.map((r) => playerBox(g, r, names))),
  );
}

function playerBox(g: GameState, r: Role, names: PerRole<string>): HTMLElement {
  const p = g.players[r];
  const down = p.tired >= PARAMS.downTired;
  const card = roleCardInfo(p.roleCard);
  return h(
    'div',
    { class: `player ${playerClass(r)}` },
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
    [...history].reverse().map((l) => {
      const t = describeRound(l, names);
      return h(
        'div',
        { class: 'log-round' },
        h('h4', null, t.title),
        h('ul', null, [...t.reveal, ...t.lines].map((x) => h('li', null, x))),
      );
    }),
  );
  details.addEventListener('toggle', () => {
    logOpen = details.open;
  });
  return details;
}

export function resetLogView(): void {
  logOpen = false;
}
