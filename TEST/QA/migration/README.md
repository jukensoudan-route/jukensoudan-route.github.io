# 2026-10-28 移行追加候補（未配備）

対象は既存の隔離TEST GASと既存TESTブランチのみ。新規GAS不要。
このディレクトリを追加しても、GAS保存・公開・外部通信・質問受付は開通しない。

## 質問選択肢の準備済み変更

`16_question_options_readonly.gs` は既存の `assertRouteqQaTestEnvironment_` と
`openRouteqQaTestSpreadsheet_` を使い、既存TESTの「質問選択ツリー」A:Eだけを読む。
書込み、Sheets初期化、外部HTTP、認証、質問保存、決済、LINE送信は行わない。
空マスタ、見出し不一致、不完全な有効行、同一キーの異なる表示名ではエラーを返す。
本番へのフォールバックはない。JSON/JSONP契約は既存Webと同じ。

2026-10-28の読取結果ではTESTマスタは見出し1行だけ。
本番ソースのデータ元は本番親Sheetsの「質問選択ツリー」だが、この候補は参照しない。
候補の静的検収と実接続検収を区別する。

実行: `node TEST/QA/migration/question-options.test.cjs`
ガードfixtureは履歴 `72b437a7e0625e33beaf3d8af30326ba3ec9fd27` の既存ガード。
`isolation-guard.fixture.txt` はオフライン検査専用。GASへ追加しない。

## 配備承認後の具体的手順

担当: 同じ1.0/1.1継続担当。対象Script ID:
`1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ`。

1. 最新HEADとGAS編集版を再取得。競合時は上書きせず差分を確認。
2. 既存TESTツリーのA2:E3が空であることを再確認し、下記の明示的な架空fixtureだけを登録する承認を受ける。
3. 新規プロジェクトを作らず、既存隔離GASへ候補1モジュールを追加保存。
4. 既存 `doGet()` だけを `doGet(e)` に変更し、環境assert直後に以下の分岐を追加する。
5. 一般POST停止、v4 usage、Stripe入口、全外部HTTP停止、保護ファイル、権限を維持する。
6. 既存Web Appのバージョンだけ更新する個別承認を受ける。URL・実行者・公開範囲は変えない。
7. 新版のJSON/JSONPを実測し、fixture表示、空・不正callbackの安全停止を検収。
8. PASS後だけ、TESTフロントのTEST用QUESTION_OPTIONS_URLへ既存TEST Web App URLを指定。
9. 既存Vercel Previewへの更新承認後、画面の大項目→テーマ→質問反映を検収。

```javascript
  var p = e && e.parameter ? e.parameter : {};
  if (String(p.action || '') === 'getQuestionOptions') {
    return routeqQaQuestionOptions_(e);
  }
```

架空fixture候補（A2:E3、既存セルを上書きしない）:

```json
[["isolated-test","隔離TEST（架空）","接続確認","【架空TEST】選択肢表示と画面連動を確認します。","TRUE"],
 ["isolated-test","隔離TEST（架空）","接続確認","【架空TEST】実送信せず入力画面を確認します。","TRUE"]]
```

完了条件: TEST専用取得と画面連動の実測PASS、POST停止・送信0・課金0。
これだけで本番の全選択肢と同等、LINE本人確認済み、通常質問受付済みとは判定しない。

## 継続する重要ゲート

- フロントLIFFログインとGAS側本人確認は別物。TEST表示をその事実に合わせた。
- 現フロントはAccess Tokenを送るが、GASのprofile取得分岐にはチャネルID照合がない。
  外部停止を外す前に、TESTチャネル2012200375への結合を検証する実装が必要。
  ID Tokenを使う場合もサーバーでLINEへ検証し、失敗時の別方式fallbackや未検証decodeを使わない。
  仕様根拠: https://developers.line.biz/en/docs/line-login/verify-id-token/
- 実本人のトークンをGAS/LINEに送る範囲・記録しない条件・試験本人の特定を個別承認する。
- 通常submitは停止中。本人確認、確認トークン、質問ID、1回消費、障害補償を
  固定AI回答・LINE送信禁止の下で結合し、実フォーム経由の検収が必要。
- 現在の旧CIは削除済み `TEST/QA/gas/isolated-v2/offline-tests/` を参照するためFAIL。
  この新しい単体検査のPASSでCI全体をPASSに読み替えない。
- 本番/main/実顧客/実課金/LINE実送信/無断デプロイ/重要設定変更は禁止。
