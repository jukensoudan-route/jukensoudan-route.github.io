# ROUTEQ｜isolated-v2 オフライン動作試験1（2026-10-21）

GitHub保存済みの `00_isolation_guard.gs`、`02_external_boundary.gs`、`03_isolated_v2_stops.gs` を読み取り、JavaScript上でGoogle Apps Scriptオブジェクトをモックして**実関数を評価・実行**した。Apps Script実行・GAS配置・ネットワーク接続・決済・LINE送信はしていない。

## 結果：13件／13件合格

1. 正しい隔離環境設定を許可
2. 異なるScript IDを拒否
3. 本番環境名を拒否
4. 本番Sheet IDを拒否
5. 外部送信を有効化する設定を拒否
6. LIVE決済を有効化する設定を拒否
7. HTTP外部通信を拒否
8. トリガー変更を拒否
9. Drive操作を拒否
10. 手動LINE送信等のセンシティブ入口を拒否
11. 本番Sheet IDでのシート開封を拒否
12. TEST Sheet IDでのシート開封を許可（モックで開いた回数1）
13. 外部エンドポイント5種の分類ロジック一致

モック記録：外部HTTP 0回、Drive 0回、トリガー操作 0回。Google Spreadsheet操作はモックのみ1回。

## 判定と未完了
**オフライン安全停止ガード試験 PASS。**

この試験は正しい内部機能（質問保存、回答確認、学校判定、遅延返信、Stripe TEST決済、チケット付与）の稼働を証明しない。TEST GASのScript Properties・権限・Spreadsheetバインド・デプロイ状態も未検証。これらは別検収とし、LINE送信や外部決済等の実行は禁止継続。

原本・main・本番GAS／TEST GAS／LINE／Stripeへの変更なし。
