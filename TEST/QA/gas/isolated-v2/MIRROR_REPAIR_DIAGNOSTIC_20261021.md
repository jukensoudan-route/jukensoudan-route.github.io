# ROUTEQ｜ミラー検収指摘対応：TEST安全診断経路（2026-10-21）

対象：`isolated-v2/訂正シート最優先・直接参照.gs` のTESTブランチのみ。原本・main・本番GAS変更なし。実GAS配置なし。

## 今回変更
- `doGet()`：隔離Script ID・Sheet ID・外部送信OFF・LIVE決済OFFの検査後、**TEST環境の識別と機能停止状態を正しく返す**。従来の「本番同等の機能が正常稼働」表示は削除。
- `doPost()`：同一の安全ガード検査後、`action=testPing` のみ読み取り専用診断応答を返す。元の`usage`, `validateQuestion`, `submit`, `createCheckout`, `confirmCheckout` は従来どおり強制停止し、外部通信・書込み・Stripe・LINEには到達しない。
- `testPing` 応答は `ok`, `type`, `requestId`, `environment`, `externalSend=false`, `livePayment=false` の診断データに限定。

## オフライン実関数モック検査：5件PASS
1. TEST環境のステータス表示
2. TEST診断POSTとrequestIdの反映
3. 質問保存の禁止
4. 決済開始の禁止
5. 本番Script IDの拒否

JavaScript構文PASS。GitHub保存・再取得照合PASS。Google Apps Script／Spreadsheet／HTMLサービスはJavaScriptモックとして再現。実際のGAS、LINE、Stripe、OpenAI、Sheetsに接続していない。

## 未解決
質問受付・質問保存、回答承認、LINE実送信、Stripe TEST決済、チケット付与、AI回答は依然として未検収。診断経路の合格を本番同等ミラー機能の合格に読み替えてはならない。外部副作用経路はすべて引き続き停止。TEST GASの実配置・実実行・デプロイは別途安全審査が必要。
