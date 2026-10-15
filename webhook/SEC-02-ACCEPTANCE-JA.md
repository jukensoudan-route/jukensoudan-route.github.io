# SEC-02｜決済Webhook安全化 検収・引継ぎ（2026-10-15）
対象：既存 `webhook/server.js`、修正ブランチ `fix/stripe-webhook-safety-gates-20261015`。**ドラフト専用。旧 `main` はRender自動デプロイ対象のため変更禁止。**

## 実装済み（ドラフトPR #55のみ）
- Stripe署名検証後、LIVE/TEST・Checkout session状態・`payment_status=paid`を検査
- Q&A商品コード `ticket3`, `ticket10` に対応したJPY金額・付与数・本人参照・PaymentIntentの検査
- 現行表示/Stripe TEST実績に基づく **1,000円/3回、3,000円/10回** を採用（請求価格そのものは変更しない）
- GAS側のHTTP 200だけでは成功扱いせず、`requestId`・`ok`・`paymentStatus=paid`・付与/既付与状態・残数を検査
- 起動時の`SELFTEST_SESSION_ID`によるGAS自動呼出しを撤去
- `npm test` (Node標準テスト) を `webhook/package.json` へ追加、`npm start` 維持

## 静的・隔離検証
- GitHub保存済みのテスト2ファイル、全**32/32ケース**を隔離JS実行環境で実行して合格。
- `server.js`構文チェック合格、処理順序（署名→安全判定→GAS）を確認。
- **Node実機の`npm test` / Stripe TESTを用いたネットワーク試験 / 現行GASデプロイとのE2E は未実施・未合格。**

## 台帳監査と未解決
- Google Sheets `Payments` は34件、TEST Session 33件はStripe TESTの支払/商品/金額/LINE参照一致。
- 2026-10-15確認の`StripeEvents`行は0。9/29保存版に書込み処理は見当たらないが、現行GASの確認が必要。
- `Users`5行のうち1行に `累計付与149 - 使用126 - 残2 = 差21`。顧客ID等は本PRに記録しない。
- バックアップ10/04 03:12は`付与143・使用122・残3` (差18)、同日09:13は`付与146・使用123・残2` (差21)。
- 同期間に3回券の支払済み・付与済み記録と質問1回の使用あり。**付与累計が+3されたのに残数が+3されなかった差異**を示す。原因は未確定。手動調整・途中失敗の可能性の調査に留め、残数を自動補正しない。
- 9/29保存版GASで`SessionID/PaymentIntent/ScriptLock`は確認済み。ただし現在稼働するGAS原本との差分は未確認。保存版ではUsersとPayments更新が別書込みであり、障害後の一貫性確認が必要。
- Library `/ROUTE-QA-Backup/GAS/2026-10-01` は資料検索パッチZIPであり、Stripe連携の最新GAS原本とは扱わない。

## マージ・本番反映までの最小検収条件
1. 03：稼働GASの`Code.gs`/`Stripe連携.js`/`appsscript.json`を読み取り専用で取得し、9/29保存版・09/30以降の料金/TEST修正と差分照合。
2. 03＋04：`confirmCheckout`の`requestId`応答仕様と`GAS HtmlService`実出力を、秘密情報を隠して確認。
3. 01＋04：`cd webhook && npm test`、署名不正/未払い/TEST流入0/重複再送0/並列付与0/金額不一致/部分失敗回復を、**独立TEST**で二重検証。
4. 04：有効なLIVE Stripeエンドポイント・Render鍵の環境とGASの照会キーの整合性を確認。現コネクタはStripe TESTのみでLIVEは検証不可。
5. 03＋08：21回差の事実原因と返金・調整運用の承認書を作る。無承認の台帳補正禁止。
6. 00：上記の検収後に**本番マージと公開を個別承認**。それまではドラフト維持。

**注意**：このWebHookガードは既存GAS付与処理の代替ではない。GASの現行原本、台帳トランザクション、実LIVE接続が未検収の状態でサービスイン合格を出さない。
