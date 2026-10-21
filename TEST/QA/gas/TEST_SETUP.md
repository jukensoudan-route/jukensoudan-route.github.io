# 独立Q&A TEST GAS 初期設定（本番操作禁止）

状態：未デプロイ・基本動作未検収。

1. Google Apps Scriptの「新しいプロジェクト」を作成する。開いている本番「回答確認」プロジェクトを編集しない。
2. 名前を ROUTEQ_QA_ISOLATED_TEST_20261021 とする。
3. 新しいプロジェクトのScript IDまたは編集画面URLだけを共有する。APIキーや秘密値は送らない。
4. ソースの配置指示までは実行・公開・トリガー設定を行わない。

隔離TEST用Script Properties（新プロジェクトにのみ設定する）：

- ROUTEQ_QA_ENVIRONMENT = ISOLATED_TEST
- ROUTEQ_QA_SHEET_ID = 11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8
- ROUTEQ_QA_EXTERNAL_SEND = DISABLED
- ROUTEQ_QA_LIVE_PAYMENT = DISABLED

gas/staging/のソースは未隔離のアーカイブであり、そのまま実行・デプロイしない。gas/内の移植候補も未統合・未検収。

検収：設定確認→14シート読取確認→コード版照合→模擬質問と回数管理・回答確認→個別承認済みTEST外部連携。実動作検証はまだ実施されていない。
