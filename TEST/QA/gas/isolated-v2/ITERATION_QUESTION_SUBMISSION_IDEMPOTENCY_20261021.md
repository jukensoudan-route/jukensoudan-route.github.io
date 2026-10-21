# ROUTEQ｜質問送信ID・二重受付防止（2026-10-21）

対象は `test/qa-full-copy-isolated-20261021` の `TEST/QA/gas/isolated-v2/` のみ。実GAS、Sheets、LINE、Stripe、OpenAIへの接続・配置・送信は行っていない。

## 問題

署名済み確認トークンは内容と有効期限だけを検査し、同一トークンの再利用を記録していなかった。同じ送信を再試行するとQuestions行とUsers利用回数を二重更新できる状態だった。

## 修正

- 確認時にUUID nonceを含む一意の署名トークンを発行し、これをサーバー発行の質問送信IDとして返す。
- 既存2要素トークンの署名検証互換性を残し、新規トークンは `issuedAt.nonce.signature` とした。
- 質問保存のScript Lock内で、送信IDごとの永続レシートをScript Propertiesへ `PROCESSING` として先に保存する。
- Questions列Rにも送信IDを保存し、Script Propertiesが消去された場合も永続記録から既存結果を返す。列Rヘッダーはセットアップ時に自動整備する。
- QuestionsとUsersの更新が完了したら `COMMITTED` と結果を保存する。同一IDの再送は新規更新せず既存結果を返す。
- ID一致・内容不一致は拒否する。途中状態または補償不能は `NEEDS_REVIEW` としてfail-closedにする。
- Questions追加後にUsers更新が失敗し、Questions補償削除に成功した場合だけレシートを削除して安全な再試行を許可する。

## 実ソース障害注入

`offline-tests/question-submission-idempotency.test.js` が保存済み実ソースを読み込み、インメモリSheets・Properties・Lockで23個の期待値を検査した。

- 同一送信IDの2回目は同じ行・結果を返し、Questions追加と回数消費は1回のみ：PASS
- 別送信IDの同文質問は別受付：PASS
- 同一IDで内容を変えた再送は拒否：PASS
- Users更新失敗とQuestions補償成功後は1回だけ再試行可能：PASS
- 補償削除不能時は `NEEDS_REVIEW` となり、再送しても追加更新なし：PASS
- 新規発行トークンはUUID nonceにより連続発行でも別ID：PASS
- Script Propertiesのレシート消去後もQuestions列Rから既存受付結果を復元し、追加更新なし：PASS

結果：**23/23 PASS**。14 GAS個別構文、全ファイル連結構文、危険API残存検査もPASS。

## 限界

Script Propertiesには容量上限があるため、この方式は隔離TESTでの機能確認用であり、大量の本番運用には永続台帳シートまたはDBへの移行が必要。実TEST GAS/SheetsでのE2Eと真正本番版一致は未検証であり、公開デプロイ禁止は継続する。
