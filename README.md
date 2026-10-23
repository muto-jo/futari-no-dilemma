# ふたりのジレンマ

夫役と妻役に分かれて家事・育児を乗り切る、2人用の協力カードゲームのWeb版です。
「疲れたからお願い」「いいよー」と頼み合い、約束を守る夫婦が一番得をします。

- 遊ぶ: https://muto-jo.github.io/futari-no-dilemma/
- ルールと仕様: [docs/SPEC.md](docs/SPEC.md)

## 遊び方

スマートフォンのブラウザで開いて遊べます(PCのブラウザでも遊べます)。

- **1台で2人**: 1台の端末を2人で回して遊びます。約束カードと行動カードは1人ずつ、相手に見えないように選びます
- **AIと対戦**: 1人で、6つのタイプのAIと遊びます。どんな考え方のAIかは、対戦のあとで明かされます
- **オンライン対戦**: 準備中です

アクセス解析や広告はありません。ブラウザに保存するのは、プレイヤー名などの設定だけです。

## 開発

Node.js 22.12 以上が必要です。

```sh
npm install
npm run dev     # 開発サーバー
npm test        # テスト(Vitest)
npm run sim     # AI戦略の総当たりシミュレーション
npm run build   # 本番ビルド(dist/)
```

`main` ブランチに push すると、GitHub Actions がテストとビルドを行い、GitHub Pages に公開します。

| パス | 内容 |
| --- | --- |
| `src/engine/` | ゲームのルール(画面や通信に依存しない) |
| `src/engine/ai/` | AI戦略(`reference/dilemma_c.py` から移植) |
| `src/ui/` | 画面 |
| `data/cards.json` | カードの名前と文面 |
| `reference/` | バランス調整に使ったPythonシミュレーターと結果(ビルドには含めない) |

## ライセンス

- コード: PolyForm Noncommercial License 1.0.0(`LICENSE`)
- カード文面・ルール文・画像などのコンテンツ: CC BY-NC 4.0(`LICENSE-CONTENT`)

パパ育コミュなど非営利の場での利用は自由です。製品化・商用利用をご希望の方はご連絡ください。
