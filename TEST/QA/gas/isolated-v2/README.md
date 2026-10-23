# ROUTEQ｜isolated-v2 変更版検収（2026-10-21）

**状態：静的構文PASS／デプロイ禁止・機能検収未完了**

対象：既存のユーザー提供原本11ファイル。原本・元TEST候補・mainは不変。v2の11ファイルはGitHubに保存・読み戻し済み。

## 今回実装した変更
1. 11ファイルを原本からTEST専用別コピーに再構築。全11ファイルがJavaScript構文検査PASS。
2. 同時配置時に衝突した7つの関数について、`コード.gs`側の旧宣言だけ `routeqQaArchived_` 接頭辞に変更して原文の関数本体は保全。返信モード側の7関数を共通名として保持。静的関数名重複0件。
3. 直接の `UrlFetchApp.fetch` を `routeqQaRejectExternalFetch_` に置換（ネットワーク全禁止）、`ScriptApp.newTrigger/deleteTrigger` を拒否、主要 `DriveApp`読み書き入口を拒否。元の機能を実行していない。
4. `SpreadsheetApp.getActiveSpreadsheet` をTEST用シート取得関数に、直接`SpreadsheetApp.openById`をTEST IDのみ許可する関数に変更。外部マスタIDアクセスはTEST版に切り替えるまで拒否。
5. 公開Web/LINE送信/Stripe処理/手動チケット付与/ファイル登録/自動バックアップ/遅延返信の主要エントリに環境検査と強制停止を挿入。
6. `00_isolation_guard.gs` はスクリプトID `1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ` およびTESTシートID `11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8` の一致を必須化。`02_external_boundary.gs`、`03_isolated_v2_stops.gs`を同フォルダに配置。

## 未完了・追加検収
- **重要：強制停止ガードのため、v2は基本動作しない。** 安全側に倒した静的候補であり、工程④⑤の最終合格や商用完了ではない。
- 直接呼出し以外の間接送信、外部サービスとライブラリ経由の副作用を全件追跡する必要がある。
- 学校判定マスタ、資料DB、Vector Store、Settings/Questions/Users/Payments等の**TEST用データ実体とヘッダー整合**を検証する。
- 本番版と復元原本の版一致、Script PropertiesのTEST専用設定、TEST用GASスクリプトとシートの紐付けは未確認。
- `onOpen/onEdit`などイベントの実行経路、関数参照、状態遷移、Stripe冪等性、LINE送信禁止、実アクセスを伴わないモック検収が未実施。
- 本番もTESTもGASへのコード反映はしていない。TESTへのデプロイ前に機能別ゲートと所有者承認が必要。

## 判断
v2を本番またはTEST GASへコピー・実行・デプロイしない。原本・main・本番LINE・Stripe LIVE・外部APIは無変更。次は静的経路解析と隔離TESTデータマッピングを行い、安全に有効化できる個別内部機能のみ区分する。

## 追加の一括静的検査
- v2の11コードファイルを連結してJavaScript構文検査：**PASS**（265,988文字）。
- 関数宣言215件、同名宣言0件。
- 検査対象テキストに直接の `UrlFetchApp.*`、`ScriptApp.newTrigger/deleteTrigger`、`DriveApp.*`、`SpreadsheetApp.openById/getActiveSpreadsheet` の残存呼出なし（ただし文字列解析に基づき、Apps Script実行安全性の保証ではない）。
- エントリの強制停止が残るため**機能検収は未完了**、**デプロイ不可**。


---

## 2026-10-23 更新：旧検収記録と現状の区別

この文書の上記「2026-10-21」部分は**当時の検収記録**であり、現状の全工程を示すものではありません。現状判断には以下の追加実績を併せて参照すること。

- 正式価格：3回券 **1,000円／3回**、10回券 **3,000円／10回**。対象コード更新コミット `d4a368151ebfb09dc0fa60bad670c45b6b95d13b`。TEST GAS内の該当2ファイルへの反映は別作業の実施報告で確認されているが、このGitHub README更新自体はGASを再読出し・実行していない。
- Questionsの送信IDは既存R〜V列ではなく**W列**。GitHubコード・TEST Sheetのヘッダー修正に関する従前の検収を継承する。
- B-03A事前安全検査：機能別ゲートの読取検査、接続先URL事前検査、サービス間の許可混同拒否、直接通信経路の静的検査、正式価格・停止コードの自動回帰試験を追加。直近CI実行 `39881606420` は成功。
- **B-03Aの許可付き外部通信の実装は未完了**。TESTフラグONでも外部通信禁止境界を解除しない。新規 `04_test_request_preflight.gs` はGitHubにあり、指定GASへの保存は未確認。
- **未検収**：GAS・Sheetの実機能動作、Stripe TEST決済・回数付与、OpenAI API実呼出、LINE実送信、最終独立検収、本番移行。これらを完了済みと誤認しないこと。
- `03_isolated_v2_stops.gs`、`02_external_boundary.gs` の強制停止は継続。新たな本番変更・実決済・外部送信は実施していない。**商用化判定NO-GO**。

この更新は管理文書のみを変更する。実GAS保存・関数実行・デプロイ・外部送信は行わない。
