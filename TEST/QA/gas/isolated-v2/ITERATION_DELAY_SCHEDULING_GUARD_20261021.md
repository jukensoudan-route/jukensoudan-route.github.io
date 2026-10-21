# ROUTEQ｜反復修正：遅延返信予約の半端な書込み防止（2026-10-21）

## 検出
`回答モード切替.gs:scheduleRouteDelayedReply_` は、予約情報を Script Properties に `setProperty` した後で `ensureRouteDelayedReplyTrigger_` に進む。TESTのトリガー変更が禁止されているため、後段で停止しても予約データだけが残存し得た。

## 修正
関数冒頭に `assertRouteqQaTestEnvironment_()` と `routeqQaBlockSensitiveEntry_('scheduleRouteDelayedReply_')` を追加。TEST専用の安全なスケジューラ未整備の間は、予約情報への副作用の前にfail-closed停止させる。GitHub TESTブランチのみ変更。実GAS/本番/原本変更なし。

## オフライン実ソース検収
- 更新後JavaScript構文PASS、GitHub保存後再取得一致PASS
- 安全なScript ID／Script Propertiesモックで予約を呼び出すと敏感操作停止エラーを返す
- 書込みモック `setProperty` 呼出0回、トリガー変更0回
- **判定：中途半端な予約書込み防止の単体試験PASS。本来の遅延返信処理は未検収。**

## 次の課題
TEST専用の遅延ジョブ保存・模擬時計・冪等な実行管理を用意し、正常系と再実行/途中障害を検証する。LINE実送信、Stripe LIVE、本番環境の操作は引き続き行わない。
