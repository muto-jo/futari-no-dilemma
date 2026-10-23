import cards from '../../data/cards.json' with { type: 'json' };
import type { ActionCard, PerRole, PromiseCard, Role, RoleCard } from '../engine/types.ts';

export const ROLE_LABEL: PerRole<string> = { husband: '夫', wife: '妻' };
export const DEFAULT_NAMES: PerRole<string> = { husband: '夫', wife: '妻' };

const promiseCard = (id: PromiseCard) => {
  const c = cards.promiseCards.find((x) => x.id === id);
  if (!c) throw new Error(`promise card ${id}`);
  return c;
};

export const PROMISE_NAME = (p: PromiseCard | null): string => (p === null ? '約束なし' : promiseCard(p).name);
export const PROMISE_SPEECH = (p: PromiseCard): string => promiseCard(p).speech;

export const ACTION_NAME: Readonly<Record<ActionCard, string>> = {
  do: cards.actionCards.find((c) => c.id === 'do')!.name,
  delegate: cards.actionCards.find((c) => c.id === 'delegate')!.name,
};

const ROLE_CARD_ID: Readonly<Record<RoleCard, string>> = { overtime: 'R_ZANGYO', jikka: 'R_JIKKA' };
export const roleCardInfo = (c: RoleCard) => {
  const x = cards.roleCards.find((r) => r.id === ROLE_CARD_ID[c]);
  if (!x) throw new Error(`role card ${c}`);
  return x;
};

export const progressCard = (id: 'P_SHISHUNKI' | 'P_SUDACHI') => {
  const x = cards.progressCards.find((p) => p.id === id);
  if (!x) throw new Error(`progress card ${id}`);
  return x;
};

/** 「夫(たろう)」のような表示。名前が役割名と同じなら役割名だけ */
export function roleAndName(r: Role, names: PerRole<string>): string {
  const label = ROLE_LABEL[r];
  return names[r] === label ? label : `${label}(${names[r]})`;
}
