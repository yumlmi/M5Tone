const SPREADSHEET_ID = '1XzXQOcEyG9APhlsFIq6wPCHiDQxe55V6NXOluWeSinI';
const SCRIPT_TOKEN = 'change_this_to_a_secret';

// デプロイ後に必ず更新してください
const EXEC_URL = 'https://script.google.com/macros/s/AKfycbzADM82pBeC0t4uyoMPzm9E7Vd6WfLA_lhnsuKlda44qvQpRdrtrPDX2vGJ4oKkIOJbRg/exec'; 

// ===== doGet (画面表示) =====
function doGet(e) {
  // M5Stackからのポーリング用
  if (e?.parameter?.action === 'poll_start') return checkPreparedSession();
  if (e?.parameter?.action === 'check_end') return checkSessionEnded(e.parameter.session_id);
  if (e?.parameter?.action === 'get_notes') return getNotesFromSheet();

  const page = e?.parameter?.page || 'main';

  // 1. Main画面
  if (page === 'main') {
    const tpl = HtmlService.createTemplateFromFile('main');
    tpl.EXEC_URL = EXEC_URL;
    return tpl.evaluate().setTitle('M5Tone').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 2. Notes画面 (修正: URLからセッションIDを受け取るのみ)
  if (page === 'notes') {
    const tpl = HtmlService.createTemplateFromFile('notes');
    // URLの ?session=... を取得。なければ空文字
    tpl.sessionId = e.parameter.session || ''; 
    tpl.videoUrl = 'https://www.youtube.com/embed/h3_stQFYVx8?autoplay=1';
    tpl.EXEC_URL = EXEC_URL;
    tpl.resultPageUrl = EXEC_URL + '?page=result&session=' + tpl.sessionId;
    return tpl.evaluate().setTitle('Playing - M5Tone').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 3. Result画面
  if (page === 'result') {
  const tpl = HtmlService.createTemplateFromFile('result');

  const sessionId = e.parameter.session || '';
  const summary = getSessionSummary(sessionId);

  tpl.sessionId = sessionId;
  tpl.score = summary.score;
  tpl.okCount = summary.ok;
  tpl.ngCount = summary.ng;
  tpl.timeoutCount = summary.timeout;
  tpl.EXEC_URL = EXEC_URL;
  tpl.data = getLatestRanking(sessionId);

  return tpl.evaluate()
    .setTitle('Result - M5Tone')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


  // 4. Index (ランキング)
 if (page === 'index') {
  const tpl = HtmlService.createTemplateFromFile('index');
  const sessionId = e?.parameter?.session || '';
  tpl.sessionId = sessionId;
  tpl.rankingData = getLatestRanking(sessionId);

  tpl.EXEC_URL = EXEC_URL;
  return tpl.evaluate().setTitle('Ranking - M5Tone');
}

}

// ===== doPost (データ受信) =====
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const test = ss.getSheetByName('Test') || ss.insertSheet('Test');

    // バッチ送信対応
    if (data.action === "submit_batch") {
      const rows = [];
      const now = new Date();
      data.results.forEach(res => {
        rows.push([now, res.direction, res.result, data.session]);
      });
      test.getRange(test.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
      return ContentService.createTextOutput("Batch Success");
    }
    
    // M5Stackからの個別判定送信
    const sid = data.session || data.session_id;
    if (data.result) {
      test.appendRow([new Date(), data.direction, data.result, sid]);
      if (data.result === "END") processGameFinished(sid);
    }
    
    return ContentService.createTextOutput("Success");

  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message);
  }
}

// ===== 内部ロジック =====

// セッション開始（修正: 普通のオブジェクトを返す）
function handleStart(payload) {
  const sessionId = 'sess_' + Date.now();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sessions = ss.getSheetByName('Sessions') || ss.insertSheet('Sessions');
  
  // Player名、曲ID、開始時刻、ステータス(started)を記録
  sessions.appendRow([sessionId, payload.player, payload.chart_id, new Date(), 'started']);
  
  return { status: 'ok', session_id: sessionId };
}

// Webからのスタートボタン用（修正: handleStartを呼ぶように変更）
function startFromWebWithGAS(playerName) {
  const result = handleStart({
    player: playerName || 'Player',
    chart_id: 'song_01'
  });
  return JSON.stringify(result);
}

// セッション終了チェック
function checkSessionEnded(sessionId) {
  if (!sessionId) return { ended: false };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sessSheet = ss.getSheetByName('Sessions');
  const data = sessSheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === sessionId) {
      return { ended: (data[i][4] === 'submitted') };
    }
  }
  return { ended: false };
}


// M5Stackの待機確認
function checkPreparedSession() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sessionSheet = ss.getSheetByName('Sessions');
  const data = sessionSheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse({ status: 'waiting' });

  const lastRowIdx = data.length;
  const lastRow = data[lastRowIdx - 1];
  
  // 'started' なら 'running' に変えて譜面を返す
  if (lastRow[4] === 'started') {
    sessionSheet.getRange(lastRowIdx, 5).setValue('running');
    const notes = getNotesFromSheetInternal(); 
    return jsonResponse({ status: 'ok', session_id: lastRow[0], notes: notes });
  }
  return jsonResponse({ status: 'waiting' });
}

// 集計処理
function processGameFinished(sessionId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const testData = ss.getSheetByName('Test').getDataRange().getValues();
  const sessSheet = ss.getSheetByName('Sessions');
  const sessValues = sessSheet.getDataRange().getValues();

  let player = "anonymous";
  let chartId = "song_01";
  let sessionRowIndex = -1;

  // セッション情報の特定
  for (let i = sessValues.length - 1; i >= 0; i--) {
    if (sessValues[i][0] === sessionId) {
      player = sessValues[i][1];
      chartId = sessValues[i][2];
      sessionRowIndex = i + 1;
      break;
    }
  }

  // OK/NGカウント
  let inputResultStr = "";
  for (let t of testData) {
    if (t[3] === sessionId && (t[2] === "OK" || t[2] === "NG")) {
      inputResultStr += (t[2] === "OK") ? "O" : "X";
    }
  }

  // スコア計算
  const fullNotes = getNotesFromSheetInternal();
  const totalNotesCount = fullNotes.length > 0 ? fullNotes.length : inputResultStr.length;
  const correctStr = "O".repeat(totalNotesCount);
  const score = Math.round(positionalMatchScore(correctStr, inputResultStr));

  // 結果保存
  const resSheet = ss.getSheetByName('Results') || ss.insertSheet('Results');
  resSheet.appendRow([new Date(), sessionId, player, chartId, score]);

  // ランキング更新
  updateRankingFromScores(ss, chartId);

  // ステータスを完了に変更（これがNotes画面への合図）
  if (sessionRowIndex !== -1) {
    sessSheet.getRange(sessionRowIndex, 5).setValue('submitted');
  }
}

// 補助関数
function getNotesFromSheetInternal() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Scores');
  const lastRow = sheet.getLastRow();
  if (lastRow < 6) return [];
  const dirs = sheet.getRange(6, 6, lastRow - 5, 1).getValues();
  const times = sheet.getRange(6, 12, lastRow - 5, 1).getValues();
  
  const notes = [];
  for (let i = 0; i < dirs.length; i++) {
    if (times[i][0] !== "") {
      notes.push({ dir: dirs[i][0], ms: Math.round(times[i][0]) });
    }
  }
  return notes;
}

function getNotesFromSheet() {
  return jsonResponse(getNotesFromSheetInternal());
}

function positionalMatchScore(correct, input) {
  if (!correct || !input) return 0;
  const len = Math.max(correct.length, input.length);
  let match = 0;
  for (let i = 0; i < Math.min(correct.length, input.length); i++) {
    if (correct[i] === input[i]) match++;
  }
  return (match / len) * 1000;
}

function updateRankingFromScores(ss, chartId) {
  const scoresSheet = ss.getSheetByName('Results');
  const all = scoresSheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < all.length; i++) {
    if (all[i][3] === chartId) {
      const p = all[i][2] || 'anonymous';
      const s = Number(all[i][4]) || 0;
      if (!map[p] || map[p] < s) map[p] = s;
    }
  }
  const entries = Object.keys(map).map(k => ({ player: k, score: map[k] })).sort((a, b) => b.score - a.score).slice(0, 5);
  const rankSheet = ss.getSheetByName('Rankings') || ss.insertSheet('Rankings');
  rankSheet.getRange('A2:B6').clearContent();
  if (entries.length > 0) rankSheet.getRange(2, 1, entries.length, 2).setValues(entries.map(e => [e.player, e.score]));
}

function getSessionSummary(sessionId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const testData = ss.getSheetByName('Test').getDataRange().getValues();
  const resData = ss.getSheetByName('Results').getDataRange().getValues();
  let summary = { score: 0, ok: 0, ng: 0, timeout: 0 };
  for (let r of resData) if (r[1] === sessionId) summary.score = r[4];
  for (let t of testData) {
    if (t[3] === sessionId) {
      if (t[2] === "OK") summary.ok++; else if (t[2] === "NG") summary.ng++; else if (t[2] === "TimeOut") summary.timeout++;
    }
  }
  return summary;
}

function getLatestRanking(sid) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const rankData = (ss.getSheetByName('Rankings') || ss.insertSheet('Rankings')).getRange('A2:B6').getValues();
  let myName = "";
  if (sid) {
    const res = ss.getSheetByName('Results').getDataRange().getValues();
    for (let i = res.length - 1; i >= 0; i--) { if (res[i][1] === sid) { myName = res[i][2]; break; } }
  }
  return rankData.map(r => ({ name: r[0], score: r[1], isYou: (r[0] === myName && myName !== "") }));
}

function updatePlayerName(body) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sessionSheet = ss.getSheetByName('Sessions');
  const values = sessionSheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === body.session_id) {
      sessionSheet.getRange(i + 1, 2).setValue(body.name);
      return { status: 'ok' };
    }
  }
  return { status: 'error', message: 'session not found' };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}







 

