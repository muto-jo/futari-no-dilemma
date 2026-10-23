// 画面の切り替え。状態が変わったら今の画面を描き直す
import type { GameState, PerRole } from '../engine/types.ts';
import type { AiMatch } from './aiMatch.ts';
import type { Hotseat } from './hotseat.ts';
import { renderAiGame } from './screens/aiGame.ts';
import { renderAiSetup } from './screens/aiSetup.ts';
import { renderGame } from './screens/game.ts';
import { renderOnline, type OnlineScreen } from './screens/online.ts';
import { renderResult } from './screens/result.ts';
import { renderRules } from './screens/rules.ts';
import { renderSetup } from './screens/setup.ts';
import { renderTitle } from './screens/title.ts';
import { loadNames, saveNames } from './storage.ts';

export type Screen =
  | { readonly name: 'title' }
  | { readonly name: 'rules'; readonly back: Screen }
  | { readonly name: 'setup'; readonly dealt: Hotseat | null }
  | { readonly name: 'game'; readonly play: Hotseat }
  | { readonly name: 'aiSetup'; readonly dealt: AiMatch | null }
  | { readonly name: 'aiGame'; readonly match: AiMatch }
  | OnlineScreen
  | {
      readonly name: 'result';
      readonly game: Extract<GameState, { phase: 'ended' }>;
      readonly names: PerRole<string>;
      /** AI戦なら相手のAI(結果画面でタイプを明かす) */
      readonly ai: AiMatch | null;
      /** オンライン対戦の結果か(「もう一度」の行き先) */
      readonly online?: boolean;
    };

export interface Nav {
  /** 別の画面へ(先頭までスクロールする) */
  go(screen: Screen): void;
  /** 今の画面を描き直す。scrollTop で先頭に戻す */
  render(scrollTop?: boolean): void;
  readonly names: PerRole<string>;
  setNames(names: PerRole<string>): void;
}

export function startApp(root: HTMLElement): void {
  let screen: Screen = { name: 'title' };
  let names = loadNames();

  const draw = (scrollTop: boolean) => {
    root.replaceChildren(view(screen, nav));
    if (scrollTop) window.scrollTo(0, 0);
  };
  const nav: Nav = {
    go(s) {
      // オンライン対戦の画面を離れるときは退出する(ルール画面を見て戻るときは除く)
      const cur = screen;
      if (cur.name === 'online' && cur.session) {
        const stays = (s.name === 'online' && s.session === cur.session) || (s.name === 'rules' && s.back === cur);
        if (!stays) cur.session.leave();
      }
      screen = s;
      draw(true);
    },
    render(scrollTop = false) {
      draw(scrollTop);
    },
    get names() {
      return names;
    },
    setNames(n) {
      names = n;
      saveNames(n);
    },
  };

  // 遊んでいる途中で閉じたり再読み込みしたりしないように
  window.addEventListener('beforeunload', (e) => {
    const playing =
      (screen.name === 'game' && screen.play.game.phase !== 'ended') ||
      (screen.name === 'aiGame' && screen.match.game.phase !== 'ended') ||
      (screen.name === 'online' && screen.session !== null && screen.session.status !== 'closed');
    if (playing) e.preventDefault();
  });

  draw(true);
}

function view(s: Screen, nav: Nav): HTMLElement {
  switch (s.name) {
    case 'title':
      return renderTitle(nav);
    case 'rules':
      return renderRules(nav, s.back);
    case 'setup':
      return renderSetup(nav, s.dealt);
    case 'game':
      return renderGame(nav, s.play);
    case 'aiSetup':
      return renderAiSetup(nav, s.dealt);
    case 'aiGame':
      return renderAiGame(nav, s.match);
    case 'online':
      return renderOnline(nav, s);
    case 'result':
      return renderResult(nav, s.game, s.names, s.ai, s.online ?? false);
  }
}
