# 工程④⑤：復元原本とTEST候補の関数差分検収（2026-10-21）

検査条件：過去にユーザーが提供した完全ソースを `staging/restored/` に未改変保存済み。元の途中欠落アーカイブも変更なし。構文検査は JavaScript 静的パースのみ。現行本番との版一致や Apps Script 動作は未確認。

| ファイル | 原本関数 | TEST候補関数 | TEST構文 | 原本から欠落した関数 |
|---|---:|---:|---|---|
| 回答確認.gs | 21 | 11 | 不合格 | openSelectedQuestionInReview, loadQuestionToReview_, saveFinalAnswer, goToPreviousQuestion, goToNextQuestion, moveQuestion_, sendCurrentAnswerToLine, grant1500TicketToSelectedUser, grant3500TicketToSelectedUser, grantRouteTicket_ |
| 内申点自動判定.gs | 16 | 12 | 不合格 | enforceRouteSchoolBenchmarkAnswer_, testRouteInternalScoreJudgement, testRouteCandidateSchoolContext, testRouteIntegratedSchoolBenchmark |
| 回答モード切替.gs | 14 | 13 | 不合格 | testRouteRandomReplyDelay |
| AI修正反映.gs | 3 | 3 | 合格 | なし |

**判定：** TEST候補3件は実行禁止。原本からの再コピー＋独立したTEST隔離変更が必要。欠落関数の新規実装・推測補完はしない。原本は `staging/restored/` で保全。原本と候補の違いは安全修正だけとは限らないため、候補の安易な差し替え・GAS配置は禁止。原本の取得成功と工程④⑤完了は区別する。

検査対象Git blob：
- 回答確認 原本 `36f75e9031849c120e5ae893a2effb019c4f489d` / TEST `95fb9071ab4327ab5c6b520d41f0c9c4bf0b346f`
- 内申点自動判定 原本 `167c14f6535d9827a60791aa60822bab199ed664` / TEST `5ccfd1bb29cefbddf26d4f872e56ce5e96196049`
- 回答モード切替 原本 `79993083f55f683ce38e694c8cd80798bed49359` / TEST `617d3f6f07eb13b7f620d575fc3dc8a30685c8d0`
- AI修正反映 原本 `802d6a11627aacabfd10df53e7c4b4c645968c7a` / TEST `0e844f9ae6f511121295f35194edf02ac6c962ad`
