// オンライン対戦(SPEC 5.3): 部屋を作る/入る画面と、ゲーム画面
import { jikkaHolder, canDeclareOvertime, legalActions, legalPromises } from '../../engine/game.ts';
import { ROLES, type Role } from '../../engine/types.ts';
import { joinTrystero, type Strategy } from '../../net/link.ts';
import { CHAT_MAX, actionOf, type ActionToken, type ChoiceToken, type Preset } from '../../net/protocol.ts';
import { OnlineSession } from '../../net/session.ts';
import type { Nav, Screen } from '../app.ts';
import { button, h } from '../dom.ts';
import { eventCard, logView, nameTag, panel, playerClass, resetLogView, statusPanel } from '../parts.ts';
import { loadOnlineName, saveOnlineName } from '../storage.ts';
import { PROMISE_NAME, PROMISE_SPEECH, randomName, ROLE_LABEL, roleCardInfo } from '../text.ts';
import { actionChoice } from './game.ts';
import {
  choicePanel,
  downNotices,
  endedView,
  gameHeader,
  jikkaLabel,
  promiseReveal,
  resolvedView,
  shishunkiNotice,
  type Choice,
} from './shared.ts';

export interface OnlineScreen {
  readonly name: 'online';
  readonly session: OnlineSession | null;
  readonly code: string | null;
  readonly strategy: Strategy;
  /** 待ち始めた時刻(つながらないときの案内に使う) */
  readonly since: number;
}

// 合言葉は見間違えやすい文字(0/O、1/I/L)を使わない
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

export const normalizeCode = (s: string): string =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LEN);

/** 部屋の設定(描き直しても残す) */
const form = {
  role: 'husband' as Role,
  strategy: 'nostr' as Strategy,
  /** 相談フェイズを使うか(部屋を作る人が決める) */
  consult: true,
  /** null はまだ決めていない(最初の表示で決める) */
  name: null as string | null,
  code: '',
  busy: false,
  error: '',
};
/** 選びかけのカードとチャットの下書き(相手の通信で描き直しても消えないように) */
const draft = { key: '', choice: null as string | null, chat: '', chatFocused: false };
let lastKey: string | null = null;
let hintTimer: ReturnType<typeof setTimeout> | null = null;

/** つながらないまま、この時間が過ぎたら方式の切り替えを案内する */
const HINT_AFTER_MS = 20_000;

export function renderOnline(nav: Nav, s: OnlineScreen): HTMLElement {
  if (hintTimer) clearTimeout(hintTimer);
  if (!s.session) return lobby(nav);
  const session = s.session;
  if (!session.game || !session.names || !session.myRole) return waiting(nav, s, session);
  return gameView(nav, s, session);
}

// ---- 部屋を作る/入る --------------------------------------------------

function lobby(nav: Nav): HTMLElement {
  // 前にオンラインで使った名前がなければ、候補からランダムに選ぶ(役名の「夫」「妻」と紛れないように)
  if (form.name === null) form.name = loadOnlineName() ?? randomName();
  const nameInput = h('input', {
    id: 'online-name',
    type: 'text',
    value: form.name,
    maxlength: 12,
    autocomplete: 'off',
    oninput: () => {
      form.name = nameInput.value;
    },
  });
  const codeInput = h('input', {
    id: 'online-code',
    type: 'text',
    value: form.code,
    maxlength: 8,
    autocomplete: 'off',
    autocapitalize: 'characters',
    inputmode: 'text',
    placeholder: '例: K7QH3M',
    oninput: () => {
      form.code = normalizeCode(codeInput.value);
    },
  });

  const toggle = <T extends string>(label: string, options: readonly { value: T; label: string }[], get: () => T, set: (v: T) => void) => {
    const buttons = options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: 'choice compact',
          'aria-pressed': String(get() === o.value),
          onclick: () => {
            set(o.value);
            buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i]!.value === o.value)));
          },
        },
        h('span', { class: 'choice-label' }, o.label),
      ),
    );
    return h('div', { class: 'field', role: 'group', 'aria-label': label }, h('div', { class: 'field-label' }, label), h('div', { class: 'choices row' }, buttons));
  };

  const myName = () => nameInput.value.trim().slice(0, 12) || randomName();

  const start = async (isHost: boolean) => {
    if (form.busy) return;
    const code = isHost ? newCode() : form.code;
    if (!isHost && code.length !== CODE_LEN) {
      form.error = `合言葉は${CODE_LEN}文字です。`;
      nav.render();
      return;
    }
    const name = myName();
    form.name = name;
    saveOnlineName(name);
    form.busy = true;
    form.error = '';
    nav.render();
    try {
      const link = await joinTrystero(form.strategy, code);
      const session = new OnlineSession({ isHost, name, link, hostRole: form.role, consult: form.consult });
      session.onChange = () => nav.render();
      resetLogView();
      nav.go({ name: 'online', session, code, strategy: form.strategy, since: Date.now() });
    } catch (e) {
      console.error(e);
      form.error = '接続の準備に失敗しました。通信環境を確かめて、もう一度お試しください。';
      nav.render();
    } finally {
      form.busy = false;
    }
  };

  return h(
    'main',
    { class: 'screen' },
    h('header', { class: 'bar-head' }, button('戻る', () => nav.go({ name: 'title' }), 'btn small ghost'), h('h1', null, 'オンライン対戦')),
    h(
      'p',
      { class: 'lead' },
      '2台のスマホをつないで遊びます。部屋を作った人が合言葉を相手に伝え、相手はそれを入力して入ります。',
    ),
    panel(
      'あなた',
      h('div', { class: 'field' }, h('label', { for: 'online-name' }, 'あなたの名前'), nameInput),
      toggle(
        '接続の方式(2人とも同じものを選んでください)',
        [
          { value: 'nostr' as Strategy, label: '標準' },
          { value: 'torrent' as Strategy, label: '予備' },
        ],
        () => form.strategy,
        (v) => (form.strategy = v),
      ),
      h('p', { class: 'note' }, 'つながらないときは、2人とも「予備」に切り替えて、部屋を作り直してください。'),
    ),
    panel(
      '部屋を作る',
      toggle(
        'あなたの役',
        ROLES.map((r) => ({ value: r, label: `${ROLE_LABEL[r]}役` })),
        () => form.role,
        (r) => (form.role = r),
      ),
      toggle(
        '相談フェイズ',
        [
          { value: 'on', label: 'あり' },
          { value: 'off', label: 'なし' },
        ],
        () => (form.consult ? 'on' : 'off'),
        (v) => (form.consult = v === 'on'),
      ),
      h('p', { class: 'note' }, '「なし」にすると、相談をせずに約束カード → 行動カードへ進みます。'),
      h('div', { class: 'actions' }, button('部屋を作る', () => void start(true), 'btn primary big', { disabled: form.busy })),
    ),
    panel(
      '部屋に入る',
      h('div', { class: 'field' }, h('label', { for: 'online-code' }, '合言葉'), codeInput),
      h('div', { class: 'actions' }, button('入る', () => void start(false), 'btn primary big', { disabled: form.busy })),
    ),
    form.error ? h('p', { class: 'notice down' }, form.error) : null,
    h(
      'p',
      { class: 'note' },
      'ゲームのやり取りは端末どうしで直接行います(P2P)。つながるまでの仲介にだけ公開のサーバーを使います。声で相談したいときは、電話や通話アプリを別に使ってください。',
    ),
  );
}

// ---- 相手を待つ ------------------------------------------------------

function waiting(nav: Nav, s: OnlineScreen, session: OnlineSession): HTMLElement {
  const leave = () => {
    session.leave();
    nav.go({ name: 'online', session: null, code: null, strategy: s.strategy, since: Date.now() });
  };
  const late = Date.now() - s.since > HINT_AFTER_MS;
  if (!late) hintTimer = setTimeout(() => nav.render(), HINT_AFTER_MS - (Date.now() - s.since) + 50);
  const strategyLabel = s.strategy === 'nostr' ? '標準' : '予備';

  return h(
    'main',
    { class: 'screen' },
    h('header', { class: 'bar-head' }, button('やめる', leave, 'btn small ghost'), h('h1', null, 'オンライン対戦')),
    session.status === 'closed'
      ? h('section', { class: 'notice down' }, h('p', null, session.closeReason ?? '接続を終了しました。'))
      : session.isHost
        ? h(
            'section',
            { class: 'handoff-box' },
            h('p', { class: 'handoff-what' }, '合言葉'),
            h('p', { class: 'room-code', 'aria-label': `合言葉 ${s.code}` }, s.code),
            h('p', null, 'この合言葉を相手に伝えてください。相手が入ると始まります。'),
            h('p', { class: 'note' }, `接続の方式: ${strategyLabel} / 相談フェイズ: ${session.consult ? 'あり' : 'なし'}`),
          )
        : h(
            'section',
            { class: 'handoff-box' },
            h('h2', null, '部屋を探しています…'),
            h('p', null, `合言葉: ${s.code}`),
            h('p', { class: 'note' }, `接続の方式: ${strategyLabel}`),
          ),
    late && session.status !== 'closed'
      ? h(
          'section',
          { class: 'notice' },
          h('p', null, 'なかなかつながらないときは、2人とも「やめる」で戻り、接続の方式を切り替えて、部屋を作り直してください。合言葉と方式が2人で同じかも確かめてください。'),
        )
      : null,
    h('div', { class: 'actions' }, button('やめる', leave, 'btn big')),
  );
}

// ---- ゲーム ------------------------------------------------------------

function gameView(nav: Nav, s: OnlineScreen, session: OnlineSession): HTMLElement {
  const g = session.game!;
  const names = session.names!;
  const me = session.myRole!;
  const peer = session.peerRole!;
  const self: Screen = s;
  const key = session.key!;
  if (draft.key !== key) {
    draft.key = key;
    draft.choice = null;
  }
  if (lastKey !== key) {
    lastKey = key;
    queueMicrotask(() => window.scrollTo(0, 0));
  }

  const banner =
    session.status === 'reconnecting'
      ? h('section', { class: 'notice down', role: 'status' }, h('p', null, '接続が切れました。相手が戻ってくるのを待っています…(1分たっても戻らなければ終了します)'))
      : session.status === 'closed' && g.phase !== 'ended'
        ? h(
            'section',
            { class: 'notice down', role: 'alert' },
            h('p', null, session.closeReason ?? '接続を終了しました。'),
            button('タイトルへ', () => nav.go({ name: 'title' }), 'btn'),
          )
        : null;

  return h(
    'main',
    { class: 'screen' },
    gameHeader(nav, g, self),
    banner,
    statusPanel(g, names),
    phaseView(nav, session, me, peer),
    logView(g.history, names),
  );
}

function waitingNote(text: string): HTMLElement {
  return h('p', { class: 'waiting' }, text);
}

function phaseView(nav: Nav, session: OnlineSession, me: Role, peer: Role): HTMLElement {
  const g = session.game!;
  const names = session.names!;
  const closed = session.status === 'closed';

  switch (g.phase) {
    case 'event': {
      const holder = jikkaHolder(g);
      return h(
        'div',
        { class: 'phase' },
        shishunkiNotice(g),
        eventCard(g.event),
        holder === me
          ? panel(
              '実家ヘルプ',
              h('p', null, `あなたは実家ヘルプを使えます。${roleCardInfo('jikka').text}`),
              h(
                'div',
                { class: 'actions' },
                button(jikkaLabel(g.event.weight), () => session.decideJikka(true), 'btn', { disabled: closed }),
                button(session.consult ? '使わずに相談へ' : '使わずに進む', () => session.decideJikka(false), 'btn primary', {
                  disabled: closed,
                }),
              ),
            )
          : waitingNote(`${names[peer]}が実家ヘルプを使うか決めています…`),
      );
    }
    case 'consult':
      return h(
        'div',
        { class: 'phase' },
        shishunkiNotice(g),
        eventCard(g.turn.event, g.turn.weight),
        downNotices(g, names),
        chatPanel(session, me),
        h(
          'div',
          { class: 'actions' },
          session.iAmReady
            ? waitingNote(session.peerReady ? '約束カードへ進みます…' : `${names[peer]}の「相談終了」を待っています…`)
            : button('相談終了', () => session.ready(), 'btn primary big', { disabled: closed }),
          !session.iAmReady && session.peerReady ? h('p', { class: 'note' }, `${names[peer]}は相談を終えました。`) : null,
        ),
      );
    case 'promise':
    case 'action': {
      const isPromise = g.phase === 'promise';
      const pick = session.myPick;
      const peerNote = session.peerPicked ? `${names[peer]}は選び終わりました。` : `${names[peer]}は選んでいます…`;
      let body: HTMLElement;
      if (pick === null) {
        const choices: (Choice & { token: ChoiceToken })[] = isPromise
          ? legalPromises(g, me).map((p) => ({ key: p, token: p, label: PROMISE_NAME(p), sub: `「${PROMISE_SPEECH(p)}」` }))
          : [
              ...legalActions(g, me).map((card) => ({ ...actionChoice({ card }), token: card as ChoiceToken })),
              ...(canDeclareOvertime(g, me) ? [{ ...actionChoice({ card: 'delegate', overtime: true }), token: 'overtime' as ChoiceToken }] : []),
            ];
        body = choicePanel(
          me,
          names,
          isPromise ? 'の約束カード' : 'の行動カード',
          choices,
          (k) => {
            const c = choices.find((x) => x.key === k);
            if (c) void session.pick(c.token);
          },
          { initial: draft.choice, onSelect: (k) => (draft.choice = k) },
        );
      } else {
        const label = isPromise ? PROMISE_NAME(pick as 'together') : actionChoice(actionOf(pick as ActionToken)).label;
        body = panel(
          isPromise ? '約束カード' : '行動カード',
          h('p', null, `あなたは「${label}」を選びました。`),
          waitingNote(session.peerPicked ? '公開します…' : `${names[peer]}が選ぶのを待っています…`),
        );
      }
      // 相談なしの部屋では相談の画面を通らないので、そこで出すお知らせをここで出す
      const noConsultNotices =
        !session.consult && isPromise
          ? [
              shishunkiNotice(g),
              h('p', { class: 'note' }, 'この部屋は相談なしです。約束カードを選んでください。'),
              ...downNotices(g, names),
            ]
          : [];
      return h(
        'div',
        { class: 'phase' },
        noConsultNotices,
        eventCard(g.turn.event, g.turn.weight),
        g.phase === 'action' ? promiseReveal(g, names) : null,
        body,
        pick === null ? h('p', { class: 'note' }, `${peerNote} 選んだカードは、2人とも選び終わってから同時に公開します。`) : null,
      );
    }
    case 'resolved':
      return resolvedView(
        g,
        names,
        () => session.ready(),
        session.iAmReady ? (session.peerReady ? '次のラウンドへ進みます…' : `${names[peer]}を待っています…`) : null,
      );
    case 'ended':
      return endedView(g, names, () => {
        session.leave();
        nav.go({ name: 'result', game: g, names, ai: null, online: true });
      });
  }
}

function chatPanel(session: OnlineSession, me: Role): HTMLElement {
  const g = session.game!;
  const names = session.names!;
  const closed = session.status === 'closed';
  const lines = session.chat.filter((c) => c.round === g.round);
  const input = h('input', {
    type: 'text',
    class: 'chat-input',
    value: draft.chat,
    maxlength: CHAT_MAX,
    placeholder: 'ひとこと送る',
    'aria-label': 'チャット',
    autocomplete: 'off',
    disabled: closed,
    oninput: () => (draft.chat = input.value),
    onfocus: () => (draft.chatFocused = true),
    onblur: () => (draft.chatFocused = false),
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.isComposing) send();
    },
  });
  const send = () => {
    if (!draft.chat.trim()) return;
    session.say(draft.chat);
    draft.chat = '';
  };
  const preset = (p: Preset, label: string) => button(label, () => session.say('', p), 'btn small', { disabled: closed });
  if (draft.chatFocused) {
    queueMicrotask(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }
  return panel(
    '相談',
    h('p', null, '疲れていたら「お願いしていい?」と頼めます。相手の疲労トークンも見てみましょう。'),
    lines.length
      ? h(
          'ul',
          { class: 'dialogue' },
          lines.map((l) =>
            h(
              'li',
              { class: `say ${playerClass(l.from)}${l.from === me ? ' me' : ''}` },
              nameTag(l.from, names),
              h('span', { class: 'bubble' }, l.text),
            ),
          ),
        )
      : null,
    h('div', { class: 'presets' }, preset('ask', 'お願いしていい?'), preset('ok', 'やるよー'), preset('no', 'ごめん、無理')),
    h('div', { class: 'chat-row' }, input, button('送る', send, 'btn small', { disabled: closed })),
    h('p', { class: 'note' }, '声で相談したいときは、電話や通話アプリを別に使ってください。'),
  );
}
