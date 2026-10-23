// AIと対戦の準備: 自分の役・名前・AIのタイプを選び、役割カードを配る
import { ROLES, type Role } from '../../engine/types.ts';
import { AI_TYPES, AiMatch, type AiTypeId } from '../aiMatch.ts';
import type { Nav } from '../app.ts';
import { button, h } from '../dom.ts';
import { nameTag, playerClass, resetLogView } from '../parts.ts';
import { DEFAULT_NAMES, ROLE_LABEL, roleCardInfo } from '../text.ts';
import { randomSeed } from './setup.ts';

/** 「設定を変える」で戻ったときのために覚えておく */
const picked: { role: Role; typeId: AiTypeId | null } = { role: 'husband', typeId: null };

function segmented<T extends string | null>(
  label: string,
  options: readonly { value: T; label: string }[],
  current: T,
  onPick: (v: T) => void,
  disabled: boolean,
  row = false,
): HTMLElement {
  const buttons = options.map((o) =>
    h(
      'button',
      {
        type: 'button',
        class: 'choice compact',
        'aria-pressed': String(o.value === current),
        disabled,
        onclick: () => {
          onPick(o.value);
          buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i]!.value === o.value)));
        },
      },
      h('span', { class: 'choice-label' }, o.label),
    ),
  );
  return h('div', { class: 'field', role: 'group', 'aria-label': label }, h('div', { class: 'field-label' }, label), h('div', { class: row ? 'choices row' : 'choices' }, buttons));
}

export function renderAiSetup(nav: Nav, dealt: AiMatch | null): HTMLElement {
  const locked = dealt !== null;
  const nameInput = h('input', {
    id: 'name-me',
    type: 'text',
    value: nav.names[picked.role],
    maxlength: 12,
    autocomplete: 'off',
    disabled: locked,
  });

  const deal = () => {
    const role = picked.role;
    const name = nameInput.value.trim() || DEFAULT_NAMES[role];
    nav.setNames({ ...nav.names, [role]: name });
    const m = new AiMatch({ humanRole: role, humanName: name, typeId: picked.typeId, seed: randomSeed() });
    nav.go({ name: 'aiSetup', dealt: m });
  };

  const settings = h(
    'section',
    { class: 'panel' },
    h('h3', null, 'あなた'),
    segmented(
      'あなたの役',
      ROLES.map((r) => ({ value: r, label: `${ROLE_LABEL[r]}役` })),
      picked.role,
      (r) => {
        // 名前が既定のままなら、選んだ役の保存済みの名前に合わせる
        if (nameInput.value === nav.names[picked.role]) nameInput.value = nav.names[r];
        picked.role = r;
      },
      locked,
      true,
    ),
    h('div', { class: 'field' }, h('label', { for: 'name-me' }, 'あなたの名前'), nameInput),
  );

  const opponent = h(
    'section',
    { class: 'panel' },
    h('h3', null, '相手のAI'),
    h('p', { class: 'note' }, 'どんな考え方のAIかは、対戦のあとで明かします。'),
    segmented<AiTypeId | null>(
      '相手のAI',
      [...AI_TYPES.map((t) => ({ value: t.id, label: `${t.id} ${t.label}` })), { value: null, label: 'おまかせ(タイプは対戦後に明かす)' }],
      picked.typeId,
      (v) => {
        picked.typeId = v;
      },
      locked,
    ),
  );

  const body: HTMLElement[] = [settings, opponent];
  if (dealt === null) {
    body.push(h('div', { class: 'actions' }, button('役割カードを配る', deal, 'btn primary big')));
  } else {
    body.push(
      h(
        'section',
        { class: 'panel' },
        h('h3', null, '役割カード'),
        h('p', { class: 'note' }, '1人1枚。ゲーム中に1回だけ使えます。'),
        ROLES.map((r) => {
          const c = roleCardInfo(dealt.game.players[r].roleCard);
          return h(
            'div',
            { class: `role-deal ${playerClass(r)}` },
            h('div', null, nameTag(r, dealt.names), ' に ', h('b', null, `「${c.name}」`)),
            h('p', null, c.text),
            h('p', { class: 'note' }, c.timing),
          );
        }),
      ),
      h(
        'div',
        { class: 'actions' },
        button(
          'ゲームを始める',
          () => {
            resetLogView();
            nav.go({ name: 'aiGame', match: dealt });
          },
          'btn primary big',
        ),
        button('設定を変える', () => nav.go({ name: 'aiSetup', dealt: null }), 'btn'),
      ),
    );
  }

  return h(
    'main',
    { class: 'screen' },
    h('header', { class: 'bar-head' }, button('戻る', () => nav.go({ name: 'title' }), 'btn small ghost'), h('h1', null, 'AIと対戦')),
    body,
  );
}
