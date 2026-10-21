# ROUTEQ｜反復修正・再検査1：シート識別検証（2026-10-21）

**変更先** GitHub TEST branch `test/qa-full-copy-isolated-20261021` の `isolated-v2/` のみ。本番GAS、原本11ファイル、main、LINE、Stripe、Google Sheetsの実データは無変更。

## 問題
- `回答モード切替.gs` の `questions.getParent()` 3箇所は呼出元が渡すスプレッドシートを無条件に信頼していたため、TEST隔離Scriptから本番オブジェクトが渡った場合に隔離を迂回し得た。
- `部分訂正.gs` の `applyRoutePartialCorrection_(..., spreadsheet, ...)` は渡された任意のSpreadsheetオブジェクトに直接書込む経路が存在した。

## 修正
- `03_isolated_v2_stops.gs` に `routeqQaAssertAllowedSpreadsheet_(ss)` を追加。環境ガードとSpreadsheet.getId()が隔離TEST IDに一致することを必須化。
- `回答モード切替.gs` の3箇所すべてに親シートID検査を追加。
- `部分訂正.gs` は適用関数の先頭で受領シートのIDを照合し、不一致の場合に書込み前停止。

## 再検査
- 変更3ファイルのJavaScript構文：PASS
- GitHubコミット後のファイル再取得・全文照合：PASS
- オフラインの実ヘルパー評価：TEST用オブジェクト許可、非TEST ID拒否、null拒否、getId欠落拒否の4件全件PASS。
- **Google Apps Script実動作ではない**。利用者画面・質問保存・決済・LINEの同等性は未検証。後続では各入口のデータ参照と副作用を同様に点検する。

**判定：シートIDガードの単体模擬検収PASS／全体ミラー未合格。**
