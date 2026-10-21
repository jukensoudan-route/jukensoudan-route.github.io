# ROUTEQ｜Stripe「付与処理中」自動復旧検収（2026-10-21）

対象は `test/qa-full-copy-isolated-20261021` の `TEST/QA/gas/isolated-v2/` のみ。実Stripe、Google Sheets、GAS、LINE、OpenAIへの接続・配置・送信は行っていない。

## 修正

- Paymentsに `付与復旧ジャーナル` 列を追加した。
- Usersを更新する前に、Session ID、Payment Intent ID、ユーザーID、商品、付与前カウンタ、付与後カウンタをPaymentsへ保存する。
- 再実行時のUsersカウンタが付与後と完全一致する場合は、再付与せずPaymentsだけを `付与済` に確定する。
- 再実行時のUsersカウンタが付与前と完全一致する場合だけ、同じ予定値を一度適用してPaymentsを確定する。
- 付与前後のどちらにも一致しない、ジャーナルが壊れている、またはSessionとジャーナルが一致しない場合は `要整合確認` にして自動処理を停止する。
- Paymentsの `付与済`、付与日時、更新日時は1回の行書込みで確定する。

## オフライン実ソース試験

`offline-tests/stripe-grant-recovery.test.js` が保存済み `Stripe連携.gs` を直接読み込み、インメモリのSheets/Lockモックで次を検査した。

1. Usersが付与後値なら再付与せず確定：PASS
2. Usersが付与前値なら一度だけ付与して確定：PASS
3. 新規Users作成途中から復旧：PASS
4. Usersが付与前後どちらでもなければ自動停止：PASS
5. 壊れたジャーナルを自動停止：PASS
6. Session不一致を自動停止：PASS
7. 改ざん・不整合な予定値を自動停止：PASS
8. Users更新成功後にPayments確定失敗を注入し、再実行で二重付与せず確定：PASS

結果：**8件中8件PASS**。isolated-v2の14個の `.gs` は個別構文検査および全ファイル連結構文検査PASS。`git diff --check` PASS。

## 判定と限界

Stripeの既知の「付与処理中」復旧と二重付与防止は、保存済み実ソースを使ったオフライン障害注入試験でPASSした。ただしGoogle Sheetsは複数シートのトランザクションを保証しないため、未知の手動編集やジャーナル不整合は安全側に停止する。

実Stripe TEST Checkout/Webhook、実TEST GAS、実TEST SheetsでのE2Eは未実施。外部副作用入口は引き続き強制停止中であり、この単体検収を本番同等ミラー全体の完成判定には使用しない。
