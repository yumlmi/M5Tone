function doPost(e) {
  var params = JSON.parse(e.postData.getDataAsString());
  var data = params.data;
  //var data_split = data.split(',');

  const sheet = SpreadsheetApp.getActive().getSheetByName('シート1');
  var result1 ='';  // 結果の文字列
  var consecutive = 0;  // 連続成功カウント
  var point = 5;  // 素点
  if(data == 0){
    //譜面の取得
    var notes = sheet.getRange('B2').getValue();
    result1 += notes;

  }else{
    var score = 0;
    for (var i = 0; i < data.length; i++) {
    var char = data.charAt(i);

    if(char === 'o'){
      consecutive++;          // 連続カウントアップ
      score += point;         // 素点を追加
      score += consecutive;   // ボーナス込みで加点
    } else if (char === 'x') {
      consecutive = 0;        // 連続切れたらリセット
    }
  }
  result1 = score.toString();  // 結果を文字列で返す  
  switch(true){
    case score > sheet.getRange('B4').getValue():
      sheet.getRange('B4').setValue(score); // 1位の時、1位にスコアを保存
      break;
    case score >sheet.getRange('B5').getValue():
      sheet.getRange('B5').setValue(score); // 2位の時、2位にスコアを保存
      break;
    case score >sheet.getRange('B6').getValue():
      sheet.getRange('B6').setValue(score); // 3位の時、3位にスコアを保存
      break;
    case score >sheet.getRange('B7').getValue():
      sheet.getRange('B7').setValue(score); // 4位の時、4位にスコアを保存
      break;
    case score >sheet.getRange('B8').getValue():
      sheet.getRange('B8').setValue(score); // 5位の時、5位にスコアを保存
      break;
    default:
      break;
  }
  }
  

/*
  // 過去値の取得
  var x_P = sheet.getRange('B2').getValue();
  var y_P = sheet.getRange('C2').getValue();
  var z_P = sheet.getRange('D2').getValue();

  // 新しい値を float に変換して格納
  var x = parseFloat(data_split[0]);
  var y = parseFloat(data_split[1]);
  var z = parseFloat(data_split[2]);

  // 新しい値をシートに保存
  sheet.getRange('E2').setValue(x);
  sheet.getRange('F2').setValue(y);
  sheet.getRange('G2').setValue(z);

  // 差分比較
  var result1 = '';

  switch(true){
    case x - x_P >= 20:
      result1 += '+';
      break;
    case x - x_P <= -20:
      result1 += '-';
      break;
    default:
      result1 += '0';
      break;
  }

  switch(true){
    case y - y_P >= 20:
      result1 += '+';
      break;
    case y - y_P <= -20:
      result1 += '-';
      break;
    default:
      result1 += '0';
      break;
  }

  switch(true){
    case z - z_P >= 20:
      result1 += '+';
      break;
    case z - z_P <= -20:
      result1 += '-';
      break;
    default:
      result1 += '0';
      break;
  }

  // 現在の値を次回比較用に保存
  sheet.getRange('B2').setValue(x);
  sheet.getRange('C2').setValue(y);
  sheet.getRange('D2').setValue(z);
*/
  // JSON 出力
  var result = {
    "result": result1
  };

  var out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  out.setContent(JSON.stringify(result));

  return out;

}

function doGet() {
  const ss = SpreadsheetApp.openById('1XzXQOcEyG9APhlsFIq6wPCHiDQxe55V6NXOluWeSinI');
  const sheet = ss.getSheetByName('シート1');
  const rows = sheet.getRange('A4:B8').getValues();  // ranking1〜ranking5、値0 を取得

  const data = rows.map(r => ({ key: r[0], value: r[1] }));
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.data = data;  // テンプレートに渡す
  return tpl.evaluate().setTitle('Ranking');
  //return HtmlService.createTemplateFromFile('index').evaluate();
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}