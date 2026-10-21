# ROUTEQ｜第2段階オフライン動作確認（2026-10-21）

対象：GitHub TEST専用ブランチに保存された isolated-v2 のGAS原本由来11ファイルと安全補助3ファイル（合計14ファイル）を単一JavaScript環境に結合。GASクラス（ScriptApp、PropertiesService、SpreadsheetApp）をモックし、**実ソースの関数を評価・実行**した。外部通信・本番GAS操作・Sheets書込み・Stripe・LINEの実行はなし。

## 実施結果：14件／14件合格

### 安全停止9件（すべて停止動作合格）
1. doPost() 質問受付停止
2. doGet() Web受付停止
3. sendCurrentAnswerToLine() 手動LINE送信停止
4. createStripeCheckoutForWeb_() 決済受付停止
5. applyPaidStripeSession_() 決済付与停止
6. processRouteDelayedReplies_() 遅延返信停止
7. grantRouteTicket_() 手動チケット付与停止
8. setupReviewSheet() 回答確認初期化停止
9. registerSelectedRouteMaterialFile() 資料登録停止

### 内部ロジック5件（すべて合格）
10. extractRouteInternalScore_('内申160点です') == 160
11. extractRouteInternalScore_('内申300点です') == null
12. normalizeRouteSchoolNameForBenchmark_('兵庫県立 西宮高等学校') == '西宮高校'
13. 資料DBシートなしのgetRouteMaterialContext_() が空文字を返す
14. QuestionsシートなしのgetRouteCorrectionContext_() が空文字を返す

モックのSpreadsheetApp.openById呼出は2件のみ、指定されたTEST ID用モック以外へのアクセスなし。実通信0、データ書込み0。

## 限界／次の検収
- 質問が正常保存されること、回答確認UIが稼働すること、遅延返信・決済・チケット付与が正常に機能することは**未合格**。現在は明示的に強制停止させている。
- 実TESTのSettings/Users/Questions/Payments/学校判定マスタの内容、列、Script Properties、GAS権限・トリガー、エラー復旧は未検証。
- 次は副作用なしのモックSheetで参照と書込みの内部経路を個別に検証し、実GAS配置前のリスクを整理する。
- **静的＋オフライン模擬試験合格のみ。TEST GAS配置/実デプロイ不可。** 本番および既存TESTシステムは無変更。
