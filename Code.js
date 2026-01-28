const SPREADSHEET_ID = '1XzXQOcEyG9APhlsFIq6wPCHiDQxe55V6NXOluWeSinI';
const SCRIPT_TOKEN = 'change_this_to_a_secret'; // 必ず M5Stack と合わせる

// ★あなたの Web アプリ URL（正しい動作を保証）
const EXEC_URL = 'https://script.google.com/macros/s/AKfycbzvKWMubzi9gEJtr91AcKJoCgyCKRDvHhy1hghDxFIi175DW0EANYapC2gZf8p71eMNEg/exec';


function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'index';

  // index
  if (page === 'index') {
    const tpl = HtmlService.createTemplateFromFile('index');
    tpl.data = getLatestRanking();
    tpl.EXEC_URL = EXEC_URL;
    tpl.SCRIPT_TOKEN = SCRIPT_TOKEN;
    return tpl.evaluate().setTitle('M5Tone');
  }

  // result
  if (page === 'result') {
    const tpl = HtmlService.createTemplateFromFile('result');
    tpl.score = e.parameter.score || 0;
    tpl.data = getLatestRanking();
    tpl.EXEC_URL = EXEC_URL;
    tpl.SCRIPT_TOKEN = SCRIPT_TOKEN;
    return tpl.evaluate().setTitle('M5Tone');
  }

  // notes (動画再生ページ)
  if (page === 'notes') {
    const tpl = HtmlService.createTemplateFromFile('notes');
    const defaultVideo = 'https://www.youtube.com/embed/wQQtS4vr5mY?autoplay=1';

    tpl.videoUrl = e.parameter.videoUrl || defaultVideo;
    tpl.sessionId = e.parameter.session || '';
    tpl.resultPageUrl = EXEC_URL + '?page=result';
    tpl.EXEC_URL = EXEC_URL;
    tpl.SCRIPT_TOKEN = SCRIPT_TOKEN;
    return tpl.evaluate().setTitle('M5Tone');
  }

  // main（開始画面）
  if (page === 'main') {
    const tpl = HtmlService.createTemplateFromFile('main');
    tpl.EXEC_URL = EXEC_URL;
    tpl.SCRIPT_TOKEN = SCRIPT_TOKEN;
    return tpl.evaluate().setTitle('M5Tone');
  }

  return HtmlService.createTemplateFromFile('index').evaluate().setTitle('M5Tone');
}



function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


// POST
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.getDataAsString());
    if (!payload || !payload.action)
      return jsonResponse({ status: 'error', message: 'no action' });

    if (payload.token !== SCRIPT_TOKEN)
      return jsonResponse({ status: 'error', message: 'invalid token' });

    switch (payload.action) {
      case 'start': return handleStart(payload);
      case 'submit': return handleSubmit(payload);
      default:
        return jsonResponse({ status: 'error', message: 'unknown action' });
    }

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}



// ゲーム開始
function handleStart(payload) {
  const chartId = payload.chart_id || 'song_01';
  const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2,6);

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const sessions = ss.getSheetByName('Sessions') || ss.insertSheet('Sessions');
  sessions.appendRow([sessionId, payload.player || '', chartId, new Date(), 'started']);

  // 動画URL
  const chartSheet = ss.getSheetByName('Charts') || ss.insertSheet('Charts');

  let videoUrl = 'https://www.youtube.com/embed/wQQtS4vr5mY?autoplay=1';

  const values = chartSheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === chartId) {
      videoUrl = values[i][2] || videoUrl;
      break;
    }
  }

  return jsonResponse({ status: 'ok', session_id: sessionId, video_url: videoUrl });
}



// スコア提出
function handleSubmit(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const chartId = payload.chart_id || 'song_01';
  const input = (payload.input_string || '').toString();
  const player = payload.player || 'anonymous';
  const sessionId = payload.session_id || ('sess_' + Date.now());

  const chartSheet = ss.getSheetByName('Charts') || ss.insertSheet('Charts');
  let correct = '';

  const rows = chartSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === chartId) {
      correct = rows[i][3] || rows[i][2] || '';
      break;
    }
  }

  const matchScore = positionalMatchScore(correct, input);
  const dist = levenshtein(correct, input);

  const base = 10000;
  let score = Math.max(0, Math.round(matchScore + (base - 400 * dist) * 0.01));

  const scores = ss.getSheetByName('Scores') || ss.insertSheet('Scores');
  scores.appendRow([new Date(), sessionId, player, chartId, score, input, correct, dist]);

  updateRankingFromScores(ss, chartId);

  const sessions = ss.getSheetByName('Sessions') || ss.insertSheet('Sessions');
  sessions.appendRow([sessionId, player, chartId, new Date(), 'submitted', score]);

  return jsonResponse({ status: 'ok', score: score, distance: dist });
}




function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}



// ⬇ ランキング
function getLatestRanking() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const rankSheet = ss.getSheetByName('Rankings') || ss.insertSheet('Rankings');

  return rankSheet.getRange('A2:B6')
    .getValues()
    .map(r => ({ key: r[0], value: r[1] }));
}


function updateRankingFromScores(ss, chartId) {
  const scoresSheet = ss.getSheetByName('Scores') || ss.insertSheet('Scores');
  const all = scoresSheet.getDataRange().getValues();

  const map = {};
  for (let i = 1; i < all.length; i++) {
    const r = all[i];
    if (r[3] === chartId) {
      const player = r[2] || 'anonymous';
      const sc = Number(r[4]) || 0;
      if (!map[player] || map[player] < sc)
        map[player] = sc;
    }
  }

  const entries = Object.keys(map).map(k => ({ player: k, score: map[k] }));
  entries.sort((a,b) => b.score - a.score);

  const top5 = entries.slice(0,5);

  const rankSheet = ss.getSheetByName('Rankings') || ss.insertSheet('Rankings');
  rankSheet.getRange('A2:B6').clearContent();

  for (let i = 0; i < top5.length; i++) {
    rankSheet.getRange(2 + i, 1).setValue(top5[i].player);
    rankSheet.getRange(2 + i, 2).setValue(top5[i].score);
  }
}




// ⬇ スコア計算
function positionalMatchScore(correct, input) {
  if (!correct || !input) return 0;
  const len = Math.max(correct.length, input.length);

  let match = 0;
  for (let i = 0; i < Math.min(correct.length, input.length); i++)
    if (correct[i] === input[i]) match++;

  return (match / len) * 1000;
}


function levenshtein(a, b) {
  if (!a) return b.length;
  if (!b) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i-1] === a[j-1]) matrix[i][j] = matrix[i-1][j-1];
      else {
        matrix[i][j] = Math.min(
          matrix[i-1][j-1] + 1,
          matrix[i][j-1] + 1,
          matrix[i-1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * WEB画面(main.html)から呼び出される専用関数
 * CORSエラーを回避するために google.script.run 経由で使用します
 */
function startFromWebWithGAS() {
  // すでに定義されている handleStart を呼び出します
  const result = handleStart({ 
    action: 'start', 
    player: 'web_player', 
    chart_id: 'song_01', 
    token: SCRIPT_TOKEN 
  });
  
  // JSONを文字列にして返します
  return result.getContent();
}
