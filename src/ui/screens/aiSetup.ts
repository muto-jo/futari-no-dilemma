// AIと対戦の準備: 自分の役・名前・AIのタイプを選び、役割カードを配る
import { ROLES, type Role } from '../../engine/types.ts';
import { AI_TYPES, AiMatch, type AiTypeId } from '../aiMatch.ts';
import type { Nav } from '../app.ts';
import { button, h } from '../dom.ts';
import { nameTag, playerClass, resetLogView } from '../parts.ts';
import { initialNameFor, randomNameFor, ROLE_LABEL, roleCardInfo } from '../text.ts';
import { randomSeed } from './setup.ts';

/** 「設定を変える」で戻ったときのために覚えておく */
const picked: {
  role: Role;
  typeId: AiTypeId | null;
  /** null はまだ決めていない(最初の表示で決める) */
  name: string | null;
  /** この画面で名前を入力した。入力済みなら、役を入れ替えても名前はそのまま */
  typed: boolean;
} = { role: 'husband', typeId: null, name: null, typed: false };

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
  // 保存済みの名前がなければ、選んでいる役の候補からランダムに
  if (picked.name === null) picked.name = initialNameFor(picked.role, nav.names[picked.role]);
  const nameInput = h('input', {
    id: 'name-me',
    type: 'text',
    value: dealt ? dealt.names[dealt.human] : picked.name,
    maxlength: 12,
    autocomplete: 'off',
    disabled: locked,
    oninput: () => {
      picked.name = nameInput.value;
      picked.typed = true;
    },
  });

  const deal = () => {
    const role = picked.role;
    const name = nameInput.value.trim() || randomNameFor(role);
    picked.name = name;
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
        // まだ名前を入力していなければ、選んだ役の名前(保存済みか候補から)に入れ替える
        if (!picked.typed && r !== picked.role) {
          picked.name = initialNameFor(r, nav.names[r]);
          nameInput.value = picked.name;
        }
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
