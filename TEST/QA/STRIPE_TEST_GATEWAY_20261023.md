# ROUTEQ正式01｜Stripe TEST外部結合・独立ゲートウェイ準備（2026-10-23）

**状態：コード準備・オフライン試験のみ。未デプロイ、Stripe TEST Checkout→実GAS未検収、商用NO-GO。**

## 決定事項
- 既存PAY-04専用Renderサービス \`routeq-payment-isolated-test\`（TESTブランチ \`test/payment-isolated-20261018\`、別Sheet）を流用・再設定しない。
- 既存 \`kikeroute-stripe-webhook\`（main）にも触れない。
- 新たな**独立Render TESTサービス**を使用する前提で \`webhook/routeq-qa-test-gateway.js\` を用意する。新サービス作成・Webhook URL登録・GASデプロイは未実行。
- 起動は \`cd webhook && node routeq-qa-test-gateway.js\`。依存インストールは \`cd webhook && npm ci\`。
- **デフォルトOFF**。環境変数 \`ROUTEQ_QA_STRIPE_TEST_ENABLED=ON\` でのみ検収可能。Stripe TESTキー以外拒否。
- Stripe署名は受信時にraw bodyを用いて検証。正しいTESTイベントでも、Stripe TEST APIでCheckout Sessionを再取得し、livemode=false/商品・金額・通貨・架空LINEユーザーID・厳密な検収markerを再検証。
- GASへの転送では全payloadと有効時刻のHMAC-SHA256を付与する。GAS側も環境・HMAC・時間・商品・宛先を再検査し、既存二重付与防止機構を使用する。
- LIVE決済禁止、LINE実送信禁止、OpenAI有料API呼出禁止。別TESTユーザー・既存Stripeセッションも拒否。

## 必須設定（値は記録・表示しない）
新しい専用Render TESTサービスのみ：
- \`ROUTEQ_QA_STRIPE_TEST_ENABLED\` : 初期 \`OFF\`
- \`ROUTEQ_QA_STRIPE_TEST_WEBHOOK_SECRET\` : 新規専用Webhookの \`whsec_...\`
- \`ROUTEQ_QA_STRIPE_TEST_SECRET_KEY\` : Stripe TEST限定キー（LIVEキー禁止）
- \`ROUTEQ_QA_STRIPE_TEST_GATEWAY_SECRET\` : GAS側と同じ32文字以上のランダム秘密
- \`ROUTEQ_QA_STRIPE_TEST_GAS_URL\` : 隔離TEST GAS Webアプリの \`/exec?action=routeqQaStripeTestWebhook\`

隔離TEST GAS Script Propertiesのみ：
- \`ROUTEQ_QA_STRIPE_TEST_INGRESS_ENABLED\` : 初期 \`OFF\`
- \`ROUTEQ_QA_STRIPE_TEST_GATEWAY_SECRET\` : Render専用サービスと同じ秘密
- 既存ガードの \`ROUTEQ_QA_ENVIRONMENT=ISOLATED_TEST\`、専用Sheet ID、\`ROUTEQ_QA_EXTERNAL_SEND=DISABLED\`、\`ROUTEQ_QA_LIVE_PAYMENT=DISABLED\` を維持

## 実行前に必要な確認
1. GAS最新HEADと対象プロジェクトIDを再読取し、保護ファイルとバックアップを変更していないこと。新規13モジュールと \`doPost\` 入口、およびStripe付与のTEST専用許可分岐のソース一致を照合する。
2. 新しい専用Renderサービスと**新規Stripe TEST専用Webhook**を作り、従来の2件は変更しない。最初はOFF。
3. 新規TESTシークレットの設定は管理UIで行い、秘密値をチャット、GitHub、ログへ貼らない。テストキーのlivemode=falseを再確認。
4. 固定TESTユーザーのPayments/Usersの事前値とセッションIDをバックアップ記録し、架空TEST対象だけに新規 \`ticket3\` Checkoutを作成。TEST決済でイベント配送を確認する。
5. GASのPayments「支払済」「付与済」・ジャーナル・Users 3回増加・Webhookの再配送で二重付与0件を検収する。
6. 検収完了後も独立サービスをOFFに戻す。商用移行や本番変更を自動実施しない。

**制限**：WebアプリがContentServiceのJSONを返す場合、Render側はその応答を厳密にパースして \`ok===true\` のときだけWebhookを受理。GAS再デプロイ・認証の本人操作が必要な場合は安全停止する。
