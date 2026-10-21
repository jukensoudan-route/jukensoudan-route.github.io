// TEST isolated candidate, sourced from prior archived AI修正反映.js (2026-09-29).
// NOT verified against current production HEAD; reconcile prior to GAS deployment.
// Only change: bound active spreadsheet -> guarded isolated spreadsheet.
/**
 * =========================================================
 * ROUTE Q&A AI修正反映.gs
 * Questions の「確認済み最終回答」を、
 * 次回以降のAI回答案の参考データとして利用する。
 * =========================================================
 */


/**
 * 過去の確認済み回答から、
 * 現在の質問に関連するものを最大3件返す。
 *
 * 優先順位：
 * 1. 同じ高校
 * 2. 同じ質問テーマ
 * 3. 同じ大項目
 * 4. 新しい回答
 */
function getRouteCorrectionContext_(data) {

  const ss =
    openRouteqQaTestSpreadsheet_();


  const sheet =
    ss.getSheetByName(
      ROUTE_QA.QUESTIONS
    );


  if (!sheet) {
    return '';
  }


  const lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {
    return '';
  }


  /*
   * 件数が増えても重くなりすぎないよう、
   * 最新200件を対象にする。
   */
  const startRow =
    Math.max(
      2,
      lastRow - 199
    );


  const numRows =
    lastRow -
    startRow +
    1;


  const values =
    sheet
      .getRange(
        startRow,
        1,
        numRows,
        16
      )
      .getValues();


  const c =
    ROUTE_QA.QUESTION_COL;


  const currentCategory =
    normalizeRouteText_(
      data.category
    );


  const currentTheme =
    normalizeRouteText_(
      data.theme
    );


  const currentSchool =
    normalizeRouteText_(
      data.school
    );


  const candidates = [];


  values.forEach(
    function(row, index) {

      const confirmed =
        String(
          row[
            c.CONFIRMED - 1
          ] || ''
        )
        .trim();


      const finalAnswer =
        String(
          row[
            c.FINAL_ANSWER - 1
          ] || ''
        )
        .trim();


      /*
       * 運営者が確認済みにした最終回答だけを使う。
       */
      if (
        confirmed !== '確認済' ||
        !finalAnswer
      ) {
        return;
      }


      const category =
        normalizeRouteText_(
          row[
            c.CATEGORY - 1
          ]
        );


      const theme =
        normalizeRouteText_(
          row[
            c.THEME - 1
          ]
        );


      const school =
        normalizeRouteText_(
          row[
            c.SCHOOL - 1
          ]
        );


      let score = 0;


      /*
       * 同じ高校を最優先。
       */
      if (
        currentSchool &&
        school
      ) {

        if (
          currentSchool === school
        ) {

          score += 100;

        }
        else if (
          currentSchool.includes(school) ||
          school.includes(currentSchool)
        ) {

          score += 80;

        }

      }


      /*
       * 同じ質問テーマ。
       */
      if (
        currentTheme &&
        theme &&
        currentTheme === theme
      ) {

        score += 50;

      }


      /*
       * 同じ大項目。
       */
      if (
        currentCategory &&
        category &&
        currentCategory === category
      ) {

        score += 25;

      }


      /*
       * 全く関係のない過去回答は使わない。
       */
      if (
        score <= 0
      ) {
        return;
      }


      /*
       * 同点なら新しい回答を優先。
       */
      const sheetRow =
        startRow +
        index;


      candidates.push({
        score: score,
        row: sheetRow,

        category:
          String(
            row[
              c.CATEGORY - 1
            ] || ''
          ),

        theme:
          String(
            row[
              c.THEME - 1
            ] || ''
          ),

        school:
          String(
            row[
              c.SCHOOL - 1
            ] || ''
          ),

        question:
          String(
            row[
              c.QUESTION - 1
            ] || ''
          ),

        finalAnswer:
          finalAnswer
      });

    }
  );


  candidates.sort(
    function(a, b) {

      if (
        b.score !== a.score
      ) {

        return (
          b.score -
          a.score
        );

      }


      return (
        b.row -
        a.row
      );

    }
  );


  const selected =
    candidates.slice(
      0,
      3
    );


  if (
    selected.length === 0
  ) {

    return '';

  }


  const blocks =
    selected.map(
      function(item, index) {

        return (
          '【過去のROUTE確定回答 ' +
          (index + 1) +
          '】\n' +

          '大項目：' +
          (
            item.category ||
            '未設定'
          ) +
          '\n' +

          '質問テーマ：' +
          (
            item.theme ||
            '未設定'
          ) +
          '\n' +

          '高校名：' +
          (
            item.school ||
            '未選択'
          ) +
          '\n' +

          '質問：' +
          truncateRouteText_(
            item.question,
            300
          ) +
          '\n' +

          'ROUTEが確認・修正した最終回答：\n' +
          truncateRouteText_(
            item.finalAnswer,
            1200
          )
        );

      }
    );


  return blocks.join(
    '\n\n'
  );

}


/* =========================================================
   補助
========================================================= */

function normalizeRouteText_(value) {

  return String(
    value || ''
  )
    .replace(
      /[\s　]+/g,
      ''
    )
    .toLowerCase()
    .trim();

}


function truncateRouteText_(
  value,
  maxLength
) {

  const text =
    String(
      value || ''
    );


  if (
    text.length <=
    maxLength
  ) {

    return text;

  }


  return (
    text.substring(
      0,
      maxLength
    ) +
    '…'
  );

}