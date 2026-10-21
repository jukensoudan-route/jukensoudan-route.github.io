// Isolated TEST candidate sourced from archived snapshot. Do not deploy before parity and dependency checks.
/**
 * =========================================================
 * ROUTE Q&A 資料DB参照.gs
 * 「資料DB」シートから現在の質問に関連する資料を検索して返す
 * =========================================================
 *
 * 資料DB列
 * A 有効
 * B 年度
 * C 学校名
 * D 大項目
 * E 質問テーマ
 * F 資料内容
 * G 出典
 * H 出典URL
 * I 更新日
 * J 優先度
 * K 備考
 * L 登録者
 */


function getRouteMaterialContext_(data) {

  const ss =
    openRouteqQaTestSpreadsheet_();

  const sheet =
    ss.getSheetByName('資料DB');

  if (!sheet) {
    return '';
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return '';
  }

  /*
   * 最新500件までを対象。
   * 将来さらに増えたら検索方式を強化できます。
   */
  const startRow =
    Math.max(2, lastRow - 499);

  const values =
    sheet
      .getRange(
        startRow,
        1,
        lastRow - startRow + 1,
        12
      )
      .getValues();

  const currentCategory =
    normalizeRouteMaterialText_(data.category);

  const currentTheme =
    normalizeRouteMaterialText_(data.theme);

  const currentSchool =
    normalizeRouteMaterialText_(data.school);

  const currentQuestion =
    normalizeRouteMaterialText_(data.question);

  const candidates = [];

  values.forEach(function(row, index) {

    const enabled =
      String(row[0] || '').trim();

    if (
      enabled !== '○' &&
      enabled !== '有効' &&
      enabled !== 'TRUE'
    ) {
      return;
    }

    const year =
      String(row[1] || '').trim();

    const school =
      String(row[2] || '').trim();

    const category =
      String(row[3] || '').trim();

    const theme =
      String(row[4] || '').trim();

    const content =
      String(row[5] || '').trim();

    const source =
      String(row[6] || '').trim();

    const url =
      String(row[7] || '').trim();

    const updatedAt =
      row[8];

    const priority =
      String(row[9] || '標準').trim();

    const note =
      String(row[10] || '').trim();

    if (!content) {
      return;
    }

    const schoolN =
      normalizeRouteMaterialText_(school);

    const categoryN =
      normalizeRouteMaterialText_(category);

    const themeN =
      normalizeRouteMaterialText_(theme);

    const contentN =
      normalizeRouteMaterialText_(content);

    let score = 0;

    /*
     * 優先度
     */
    if (priority === '最優先') score += 1000;
    else if (priority === '高') score += 500;
    else if (priority === '標準') score += 100;
    else if (priority === '低') score += 10;

    /*
     * 学校一致を強く評価
     */
    if (
      currentSchool &&
      schoolN
    ) {

      if (currentSchool === schoolN) {
        score += 800;
      }
      else if (
        currentSchool.includes(schoolN) ||
        schoolN.includes(currentSchool)
      ) {
        score += 650;
      }
      else {
        /*
         * 別学校の固有資料は基本的に除外
         */
        if (school !== '共通' && school !== '全校共通') {
          return;
        }
      }

    }
    else if (
      school &&
      school !== '共通' &&
      school !== '全校共通'
    ) {
      /*
       * 質問側に学校がない場合、
       * 特定校資料は弱く評価
       */
      score -= 200;
    }

    /*
     * 大項目
     */
    if (
      currentCategory &&
      categoryN &&
      currentCategory === categoryN
    ) {
      score += 300;
    }

    /*
     * 質問テーマ
     */
    if (
      currentTheme &&
      themeN &&
      currentTheme === themeN
    ) {
      score += 450;
    }

    /*
     * 質問文と資料本文の簡易キーワード一致
     */
    if (
      currentQuestion &&
      contentN
    ) {

      const keywords =
        extractRouteKeywords_(currentQuestion);

      keywords.forEach(function(keyword) {

        if (
          keyword.length >= 2 &&
          contentN.includes(keyword)
        ) {
          score += 25;
        }

      });
    }

    if (score <= 0) {
      return;
    }

    candidates.push({
      score,
      row:
        startRow + index,
      year,
      school,
      category,
      theme,
      content,
      source,
      url,
      updatedAt,
      priority,
      note
    });

  });


  candidates.sort(function(a, b) {

    if (b.score !== a.score) {
      return b.score - a.score;
    }

    /*
     * 同点なら新しい行を優先
     */
    return b.row - a.row;

  });


  /*
   * AIへ渡すのは最大5件
   */
  const selected =
    candidates.slice(0, 5);

  if (!selected.length) {
    return '';
  }


  return selected.map(function(item, index) {

    const updated =
      item.updatedAt
        ? Utilities.formatDate(
            new Date(item.updatedAt),
            Session.getScriptTimeZone(),
            'yyyy/MM/dd'
          )
        : '';

    return (
      '【ROUTE資料 ' + (index + 1) + '】\n' +
      '優先度：' + (item.priority || '標準') + '\n' +
      '年度：' + (item.year || '不明') + '\n' +
      '学校名：' + (item.school || '共通') + '\n' +
      '大項目：' + (item.category || '未設定') + '\n' +
      '質問テーマ：' + (item.theme || '未設定') + '\n' +
      '資料内容：\n' +
      truncateRouteMaterialText_(
        item.content,
        1800
      ) +
      '\n' +
      '出典：' +
      (item.source || '未記載') +
      (
        item.url
          ? '\n出典URL：' + item.url
          : ''
      ) +
      (
        updated
          ? '\n更新日：' + updated
          : ''
      ) +
      (
        item.note
          ? '\n備考：' + item.note
          : ''
      )
    );

  }).join('\n\n');
}


function normalizeRouteMaterialText_(value) {

  return String(value || '')
    .replace(/[\s　]+/g, '')
    .toLowerCase()
    .trim();

}


function extractRouteKeywords_(text) {

  const cleaned =
    String(text || '')
      .replace(/[、。！？!?「」『』（）()・]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  if (!cleaned) {
    return [];
  }

  return cleaned
    .split(' ')
    .filter(function(word) {
      return word.length >= 2;
    })
    .slice(0, 20);
}


function truncateRouteMaterialText_(
  value,
  maxLength
) {

  const text =
    String(value || '');

  if (
    text.length <= maxLength
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


/**
 * 資料DB参照テスト
 */
function testRouteMaterialContext() {

  const result =
    getRouteMaterialContext_({
      category: '成績・合格可能性',
      theme: '模試・偏差値',
      school: '西宮市立西宮高校',
      question: '偏差値が今70あるのですが受かりますか？'
    });

  console.log(
    result ||
    '該当資料なし'
  );
}