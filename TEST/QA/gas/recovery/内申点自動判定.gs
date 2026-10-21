// RECOVERED PREFIX ONLY; INCOMPLETE; DO NOT DEPLOY AS FUNCTIONALLY EQUIVALENT.
// All declarations up to getRouteCandidateSchoolContext_ are copied unchanged from the current TEST candidate.
// The omitted remainder starts at function getRouteCandidateSchoolContext_; see the original TEST candidate and staging archive.
// Isolated TEST candidate: benchmark source redirected to TEST sheet; equivalent benchmark data not yet copied.
const ROUTE_SCHOOL_BENCHMARK_SPREADSHEET_ID =
  '11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8';

const ROUTE_SCHOOL_BENCHMARK_SHEET_NAME =
  'Sheet1';


/**
 * 質問文から250点満点の内申点らしい数値を取得
 */
function extractRouteInternalScore_(question) {

  const text = String(question || '');

  const patterns = [
    /内申(?:点)?\s*(?:は|が|：|:)?\s*(\d{2,3})\s*点?/,
    /内申(?:点)?\s*(\d{2,3})/,
    /(\d{2,3})\s*点\s*(?:くらい|程度)?\s*(?:の)?\s*内申/
  ];

  for (const pattern of patterns) {

    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const value = Number(match[1]);

    if (
      Number.isFinite(value) &&
      value >= 50 &&
      value <= 250
    ) {
      return value;
    }
  }

  return null;
}


/**
 * 学校名の表記揺れを吸収
 */
function normalizeRouteSchoolNameForBenchmark_(name) {

  return String(name || '')
    .replace(/兵庫県立/g, '')
    .replace(/県立/g, '')
    .replace(/高等学校/g, '高校')
    .replace(/\s+/g, '')
    .trim();
}


/**
 * 統合新校の定義
 *
 * primary = 主に参考にする旧校
 * others  = 補助的に見る旧校
 */
function getRouteIntegratedSchools_() {

  return [
    {
      newName: '西宮苦楽園高校',
      primary: '西宮北高校',
      others: ['西宮甲山高校']
    },
    {
      newName: '北神戸総合高校',
      primary: '神戸甲北高校',
      others: ['神戸北高校']
    },
    {
      newName: '神戸学園都市高校',
      primary: '伊川谷北高校',
      others: ['伊川谷高校']
    },
    {
      newName: '三木総合高校',
      primary: '三木東高校',
      others: ['三木北高校', '吉川高校']
    },
    {
      newName: '姫路海稜高校',
      primary: '姫路南高校',
      others: ['網干高校', '家島高校']
    },
    {
      newName: '播磨福崎高校',
      primary: '福崎高校',
      others: ['夢前高校']
    }
  ];
}


/**
 * 統合新校名から定義を取得
 */
function getRouteIntegratedSchoolInfo_(schoolName) {

  const target =
    normalizeRouteSchoolNameForBenchmark_(
      schoolName
    );

  const integratedSchools =
    getRouteIntegratedSchools_();

  for (
    let i = 0;
    i < integratedSchools.length;
    i++
  ) {

    const item =
      integratedSchools[i];

    if (
      normalizeRouteSchoolNameForBenchmark_(
        item.newName
      ) === target
    ) {
      return item;
    }
  }

  return null;
}


/**
 * 高校別目安を取得
 */
function getRouteSchoolBenchmark_(schoolName) {

  const target =
    normalizeRouteSchoolNameForBenchmark_(
      schoolName
    );

  if (!target) {
    return null;
  }

  const ss =
    SpreadsheetApp.openById(
      ROUTE_SCHOOL_BENCHMARK_SPREADSHEET_ID
    );

  const sheet =
    ss.getSheetByName(
      ROUTE_SCHOOL_BENCHMARK_SHEET_NAME
    );

  if (!sheet) {
    throw new Error(
      '高校目安データのシートが見つかりません。'
    );
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 4) {
    return null;
  }

  const values =
    sheet
      .getRange(
        4,
        2,
        lastRow - 3,
        4
      )
      .getDisplayValues();

  for (
    let i = 0;
    i < values.length;
    i++
  ) {

    const name =
      String(values[i][0] || '');

    const normalized =
      normalizeRouteSchoolNameForBenchmark_(
        name
      );

    if (
      normalized !== target
    ) {
      continue;
    }

    const deviation =
      Number(
        String(values[i][2] || '')
          .replace(/[^\d.]/g, '')
      );

    const internal =
      Number(
        String(values[i][3] || '')
          .replace(/[^\d.]/g, '')
      );

    return {
      schoolName: name,
      district:
        String(values[i][1] || ''),
      deviation:
        Number.isFinite(deviation)
          ? deviation
          : null,
      internalBenchmark:
        Number.isFinite(internal)
          ? internal
          : null
    };
  }

  return null;
}


/**
 * 新設・統合校の場合は旧校のデータを参考目安として取得
 */
function getRouteSchoolBenchmarkWithIntegrated_(schoolName) {

  const direct =
    getRouteSchoolBenchmark_(
      schoolName
    );

  const integrated =
    getRouteIntegratedSchoolInfo_(
      schoolName
    );

  /*
   * 統合新校は、表に直接データがあっても
   * 新校自身の確定値としては扱わず、
   * primary旧校を参考目安として使う。
   */
  if (integrated) {

    const primary =
      getRouteSchoolBenchmark_(
        integrated.primary
      );

    if (!primary) {
      return direct;
    }

    return {
      schoolName:
        integrated.newName,
      district:
        primary.district,
      deviation:
        primary.deviation,
      internalBenchmark:
        primary.internalBenchmark,
      integrated:
        true,
      primarySchool:
        integrated.primary,
      otherSchools:
        integrated.others
    };
  }

  return direct;
}


/**
 * 内申点差の8段階判定
 *
 * +30以上    かなり余裕
 * +20～+29   余裕あり
 * +10～+19   やや余裕
 * 0～+9      目安を満たす
 * -1～-9     やや不足
 * -10～-19   厳しめ
 * -20～-29   厳しい
 * -30以下    かなり厳しい
 */
function classifyRouteInternalScore_(
  actual,
  benchmark
) {

  const diff =
    actual - benchmark;

  if (diff >= 30) {
    return {
      diff: diff,
      level:
        'かなり余裕がある',
      judgement:
        '内申面ではかなり余裕がある位置です。'
    };
  }

  if (diff >= 20) {
    return {
      diff: diff,
      level:
        '余裕がある',
      judgement:
        '内申面では余裕がある位置です。'
    };
  }

  if (diff >= 10) {
    return {
      diff: diff,
      level:
        'やや余裕がある',
      judgement:
        '内申面ではやや余裕がある位置です。'
    };
  }

  if (diff >= 0) {
    return {
      diff: diff,
      level:
        '目安を満たす',
      judgement:
        '内申面では目安を満たしています。'
    };
  }

  if (diff >= -9) {
    return {
      diff: diff,
      level:
        'やや不足',
      judgement:
        '内申面では目安よりやや不足しています。'
    };
  }

  if (diff >= -19) {
    return {
      diff: diff,
      level:
        '厳しめ',
      judgement:
        '内申面では厳しめの位置です。'
    };
  }

  if (diff >= -29) {
    return {
      diff: diff,
      level:
        '厳しい',
      judgement:
        '内申面では厳しい位置です。'
    };
  }

  return {
    diff: diff,
    level:
      'かなり厳しい',
    judgement:
      '内申面ではかなり厳しい位置です。'
  };
}


/**
 * AIへの注意文
 */
function buildRouteInternalScoreWarning_(diff) {

  const shortage =
    diff < 0
      ? Math.abs(diff)
      : 0;

  if (shortage >= 30) {

    return (
      '\n【重要】ROUTE登録資料の目安より' +
      shortage +
      '点低いため、内申面ではかなり厳しい位置です。' +
      '「十分狙える」「合格圏」「第一志望として挑戦しつつ」など、' +
      '実態を軽く見せる表現は禁止。' +
      '当日点・実力テスト・模試・過去問得点を確認して慎重に判断すること。'
    );
  }

  if (shortage >= 20) {

    return (
      '\n【重要】ROUTE登録資料の目安より' +
      shortage +
      '点低いため、内申面では厳しい位置です。' +
      '当日点で補える可能性には触れてよいが、' +
      '実力テスト・模試・過去問得点を確認して慎重に判断すること。'
    );
  }

  if (diff >= 10) {

    return (
      '\n【注意】内申点が目安を上回っていても、' +
      '「合格確実」「安全圏」とは断定しない。' +
      '当日点・実力テスト・模試・過去問得点を含めて総合判断すること。'
    );
  }

  return '';
}



/**
 * 第2志望・候補校情報を作る必要がある質問か判定
 */
function shouldBuildRouteCandidateContext_(data) {

  const text =
    [
      data && data.theme,
      data && data.question
    ]
      .filter(Boolean)
      .join(' ');

  return (
    /第\s*2\s*志望/.test(text) ||
    /第二志望/.test(text) ||
    /併願/.test(text) ||
    /候補校/.test(text) ||
    /志望校候補/.test(text) ||
    /他(?:の)?高校/.test(text) ||
    /別(?:の)?高校/.test(text) ||
    /現実的(?:な)?公立高校/.test(text) ||
    /おすすめ(?:の)?高校/.test(text)
  );
}

/**
 * 第一志望についての内申自動判定
 *
 * ★重要
 * 最後に第2志望候補の自動抽出結果も連結するため、
 * コード.gs側を追加修正しなくても
 * 既存の internalScoreContext 経由でAIへ渡せる。
 */
function getRouteInternalScoreContext_(data) {

  const actual =
    extractRouteInternalScore_(
      data.question
    );

  if (actual === null) {
    return '';
  }

  const benchmark =
    getRouteSchoolBenchmarkWithIntegrated_(
      data.school
    );

  let mainContext = '';

  if (
    !benchmark ||
    benchmark.internalBenchmark === null
  ) {

    mainContext =
      '【ROUTE内申判定】\n' +
      '質問文の内申点：' +
      actual +
      '点\n' +
      '選択高校の内申点目安は登録資料から特定できませんでした。' +
      '数値を推測せず、資料を確認してください。';

  }
  else {

    const result =
      classifyRouteInternalScore_(
        actual,
        benchmark.internalBenchmark
      );

    const warning =
      buildRouteInternalScoreWarning_(
        result.diff
      );

    let integratedNote = '';

    if (benchmark.integrated) {

      const otherScores = [];

      (benchmark.otherSchools || [])
        .forEach(
          function(name) {

            const old =
              getRouteSchoolBenchmark_(
                name
              );

            if (
              old &&
              old.internalBenchmark !== null
            ) {
              otherScores.push(
                name +
                ' ' +
                old.internalBenchmark +
                '点'
              );
            }
          }
        );

      integratedNote =
        '\n【統合新校の扱い】' +
        benchmark.schoolName +
        'は新設・統合校のため、' +
        benchmark.primarySchool +
        'の過去データを主な参考目安としている。' +
        (
          otherScores.length > 0
            ? '他の統合元校：' +
              otherScores.join('、') +
              '。'
            : ''
        ) +
        '新校自身の実績が十分に蓄積されるまでは、' +
        'この目安を新校の確定的な難易度・実績として断定しない。';
    }

    mainContext =
      '【ROUTE内申自動判定】\n' +
      '高校：' +
      benchmark.schoolName +
      '\n' +
      '学区：' +
      benchmark.district +
      '\n' +
      '質問者の内申点：' +
      actual +
      ' / 250点\n' +
      'ROUTE登録資料の内申点目安：' +
      benchmark.internalBenchmark +
      ' / 250点\n' +
      '差：' +
      (
        result.diff >= 0
          ? '+'
          : ''
      ) +
      result.diff +
      '点\n' +
      '判定：' +
      result.level +
      '\n' +
      '回答時の表現：' +
      result.judgement +
      warning +
      integratedNote;
  }


  /*
   * 第2志望・候補校の質問の場合に使える候補情報も
   * 同じ internalScoreContext へ連結する。
   */
  let candidateContext = '';

  if (
    shouldBuildRouteCandidateContext_(
      data
    )
  ) {

    try {

      candidateContext =
        getRouteCandidateSchoolContext_(
          data
        );

    }
    catch (error) {

      console.error(
        '第2志望候補判定エラー：',
        error
      );

      candidateContext = '';
    }
  }


  return [
    mainContext,
    candidateContext
  ]
    .filter(Boolean)
    .join('\n\n');
}


/**
 * 第2志望・候補校の自動抽出
 */

function getRouteCandidateBand_(
  diff
) {

  if (diff >= 20) {
    return {
      key: 'safe',
      label: '安全寄り候補',
      order: 2
    };
  }

  if (diff >= 0) {
    return {
      key: 'fit',
      label: '適正候補',
      order: 1
    };
  }

  if (diff >= -19) {
    return {
      key: 'slightChallenge',
      label: 'やや挑戦候補',
      order: 3
    };
  }

  if (diff >= -30) {
    return {
      key: 'challenge',
      label: '挑戦候補',
      order: 4
    };
  }

  return null;
}
