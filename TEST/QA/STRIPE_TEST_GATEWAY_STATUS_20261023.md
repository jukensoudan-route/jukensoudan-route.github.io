# ROUTEQ正式01｜Stripe TEST専用経路・引継ぎチェックポイント

記録日：2026-10-23。対象は隔離TEST環境のみ。**Stripe TEST外部実結合は未検収（NO-GO）**。

## 作成済み・確認済み

- GitHub: `jukensoudan-route/jukensoudan-route.github.io` / `test/qa-full-copy-isolated-20261021`
- GAS project scriptId: `1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ`
- GAS test Sheet ID: `11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8`
- 独立した新Render Freeサービス：`routeq-qa-stripe-isolated-test` / `srv-dbdktd5g1s2s73bru26g`。Singapore、GitHub指定TEST branch、autoDeploy=NO、`ROUTEQ_QA_STRIPE_TEST_ENABLED=OFF`、初回デプロイLive（アプリ機能は無効）。
- 新Stripe **TEST専用**Webhook：`we_1UThKWIRwv4Jy7ltIEC0HAu5`、`livemode=false`、`https://routeq-qa-stripe-isolated-test.onrender.com/stripe/webhook`。購読対象は `checkout.session.completed`、`checkout.session.async_payment_succeeded`。**現在 disabled（有効化していない）**。
- Stripe Webhook署名秘密は新Renderサービスへ転送設定済み。秘密値はログ・報告・GitHubに記載していない。
- 既存のPAY-04 `routeq-payment-isolated-test` と既存 `kikeroute-stripe-webhook`、本番GAS/Sheet/GitHub main は変更なし。
- `webhook/routeq-qa-test-gateway.js` に署名検証、TEST Stripe Checkout再取得、検収marker・利用者・商品・金額の照合、HMAC付きGAS呼出を追加。
- `TEST/QA/gas/isolated-v2/13_stripe_test_signed_ingress.gs` と既存 `doPost` の専用入口、既存Stripe付与への検収用ガード付き橋渡しをGitHub TESTブランチに追加。
- NodeオフラインGateway試験、GAS署名検証試験、既存安全回帰テストをGitHub CIで確認。**これは実GAS配置・Stripe実決済の証拠ではない。**

## 安全停止中の構成

1. Renderのテスト処理フラグ OFF。
2. 新Stripe TEST Webhook `status=disabled`。
3. GAS TEST webhook ingressフラグ未設定（デフォルトOFF）。
4. GASの外部HTTP拒否・LINE実送信禁止・LIVE決済禁止は変更なし。
5. `ROUTEQ_QA_STRIPE_TEST_SECRET_KEY`（Stripe TEST専用の読取権限のある秘密鍵）とRender/GAS共通HMAC秘密は未設定・未確認。
6. 新13 .gs／既存doPost分岐／Stripe能力許可分岐を、実GASへ配置・保存・デプロイした証拠はまだない。

## 次の作業（人間認証・権限確認が必要になり得る）

1. GitHub最新HEAD再照合、GASの最新保存済みコードを全文取得、保護ファイル／バックアップを変更しないことを確認。
2. GASへTEST専用差分3箇所のみ安全に反映・保存し、Apps Script APIで原本とのハッシュ照合を行う。新13ファイル、既存 `doPost` 専用分岐、Stripe能力許可分岐。実GAS未反映なら外部検収は開始しない。
3. 32文字以上の暗号論的にランダムな共通HMAC秘密を、Render/GAS双方の設定UIで秘密値を公開せず登録する。Stripe TESTシークレットキーはTEST限定・必要最小権限で登録する。アカウントを横断しない。
4. 新規GAS TEST Webアプリのみを安全にデプロイし、その `/exec?action=routeqQaStripeTestWebhook` URLを新Renderサービスに設定。失敗時はフラグをOFFのまま。
5. 安全条件を逐一確認し、専用Stripe TEST Webhookだけを有効化、Render TEST処理だけON、GAS受信だけON。既存PAY-04/本番系統には一切触れない。
6. **新規** Stripe TEST Checkoutを架空ユーザー `U_ROUTEQ_ISOLATED_MOCK_20261023`、TEST marker `ROUTEQ_QA_ISOLATED_STRIPE_TEST_20261023`、`ticket3` / 1000円で作成し、テストカードで決済。以前の支払済みTESTセッションは流用・再付与しない。
7. Stripe → 専用Render → HMAC検証GAS → TEST Payments/Usersの一意性・付与・回復ジャーナルを実測。再配送で二重付与0件を検収。
8. 検収終了後は新Stripe Webhook disabled、Render/GASテスト処理OFFに戻す。商用GOには別途最終判断。

## 本人承認に伴う境界

本番変更、Stripe LIVE、実課金、LINE実送信、OpenAI API有料呼出、保護ファイル変更、旧PAY-04サービス転用は禁止。実環境認証が足りないときは未検収として停止し、推測でPASSにしない。
