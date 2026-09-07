# MarkSheet の開発

- 機能とファイル・採点仕様は `mark-sheet-requirements.md` に従う。
- UIを設計・実装・変更・レビューする際は、`.agents/skills/emil-design-eng/SKILL.md` を読み、`emil-design-eng` を適用する。
- マークの連続入力とキーボード操作は即座に反映し、演出による待ち時間を設けない。大量の行を順番に出現させない。
- `prefers-reduced-motion`、タッチ操作、キーボード、スクリーンリーダーに対応する。
- 利用者の解答・正答・テンプレートはブラウザー内でのみ処理し、外部へ送信しない。
- UIレビューは `Before / After / Why` の表で記録する。
- Node.js 24系・npmを使用する。Windows PowerShellでは必要に応じて `npm.cmd` / `npx.cmd` を使う。
- 完了前に `npm run check` と `npm run test:e2e` を実行し、実際の公開確認・実機検証とは区別して報告する。
