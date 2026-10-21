# ROUTEQ｜直接危険API残存の除去と回帰検査（2026-10-21）

対象は `test/qa-full-copy-isolated-20261021` の `TEST/QA/gas/isolated-v2/` のみ。本番GAS、Sheets、LINE、Stripe、OpenAI、Driveへの接続・配置・送信・変更は行っていない。

## 隔離境界監査

過去の3回監査でP0候補となっていた次の直接呼出しが保存ソースに残っていることを再確認した。

- `資料ファイル登録.gs`: `ScriptApp.getOAuthToken()`
- `自動バックアップ.gs`: `file.setTrashed(true)`

両関数は先頭の強制停止により通常経路では到達不能だったが、内部関数の直呼び、将来の変更、引数評価順による権限取得を防ぐため、直接呼出しを隔離拒否ヘルパーへ置換した。

## 最小修正

- OAuthトークン取得は `routeqQaRejectOAuthTokenAccess_()` で環境検査後に必ず停止する。
- 古いバックアップの削除は `routeqQaRejectDriveMutation_(file)` で必ず停止し、`setTrashed` を呼ばない。
- 構文回帰試験に、直接の `UrlFetchApp.*`、`DriveApp.*`、`ScriptApp.newTrigger/deleteTrigger/getOAuthToken`、`.setTrashed()` が全14 GASファイルに存在しないことを追加した。
- 外部境界試験にOAuthトークン拒否を追加した。

## 実測

- 14/14 GAS個別構文：PASS
- 全14 GAS連結構文：PASS
- グローバル関数230件、重複0件：PASS
- 直接危険API残存検査：PASS
- Stripe付与中復旧・障害注入：8/8 PASS
- 外部境界・LINE安全模擬・OAuth拒否：8/8 PASS、ネットワーク要求0件
- `git diff --check`：PASS

## 判定と限界

既知の直接危険API残存2件は解消した。これは隔離境界の改善であり、機能完成の証明ではない。実TEST GAS/Sheets/Stripe TEST E2E、LINE模擬配送、学校・資料fixture、本番版一致は、必要な外部実体・資格情報・真正ソースがこのworktreeに存在しないため未検証のまま。外部副作用入口の強制停止とデプロイ禁止を継続する。
