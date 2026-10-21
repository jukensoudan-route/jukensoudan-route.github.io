# ROUTEQ Q&A｜第3段階 オフライン模擬シート試験（2026-10-21）

**対象:** `isolated-v2/訂正シート最優先・直接参照.gs`、`isolated-v2/Stripe連携.gs` の保存済みコードを取得し、実関数をJavaScriptで呼び出した。シートはインメモリのモック。GAS実行・実Sheet書込み・LINE送信・Stripe通信・課金・デプロイなし。

## 結果：14/14 合格

| 分野 | ケース | 判定 |
|---|---|---|
| Users | 既存ユーザー1番目の行検索 | PASS |
| Users | 既存ユーザー2番目の行検索 | PASS |
| Users | 未登録ユーザー検索 | PASS |
| Users | 無料試用ユーザー新規行登録 | PASS |
| Users | 無料試用残回数=1 | PASS |
| Users | 無料試用累計付与=1 | PASS |
| Users | 無料試用未使用フラグ | PASS |
| Users | 登録後ユーザーIDで再検索 | PASS |
| Users | データ行なし検索 | PASS |
| Payments | Session IDから登録済行を検索 | PASS |
| Payments | Payment Intent IDから登録済行を検索 | PASS |
| Payments | 未登録Sessionを検出 | PASS |
| Payments | Session ID空欄を拒否 | PASS |
| Payments | Payment Intent ID空欄を拒否 | PASS |

## 判定範囲

**内部の単体模擬動作 PASS。基本機能のエンドツーエンド動作は未合格。**
`createFreeTrialRouteUser_`は1行の追加と基本列の値を検証したが、同時実行・無料試用の二重付与防止までは検証していない。Stripeは**決済識別子の検索だけ**を検証し、支払真正性・実際のチケット付与・冪等性・途中失敗復旧の検証ではない。`doPost`、`saveQuestionForWeb_`、`applyPaidStripeSession_` 等の副作用入口のブロックを解除しておらず、現在も安全停止する。

**残作業:** 質問保存から利用回数更新までの原子的整合、回答確認UI/最終回答保存、Stripeの重複付与・障害復旧、遅延返信状態機械をTEST用モックで段階別に再現する。GASへの配置・デプロイ・外部操作禁止を継続。
