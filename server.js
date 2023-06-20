// 引入相關模組
const express = require('express');
const SocketServer = require('ws').Server;
const bodyParser = require('body-parser');
const crypto = require('crypto');
// 創建實例
const app = express();
// 監聽3000端口
const server = app.listen(3000, () => console.log("\n"+'系統啟動完成 注意連線PORT為：3000'+"\n"));
// 創建WebSocket服務
const wss = new SocketServer({ server });
// 創建事件發射器
const events = require('events');
const em = new events.EventEmitter();
//timeout
let time_out = 0;
//載入資料庫
const mysql = require('mysql');
const { time } = require('console');
const con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "abc123",
  database: "sound_networking_sql"
});

//連線資料庫
con.connect(function(err) {
  if (err) throw err;
  console.log("Connected to database\n");
});

//創建字母給予音樂編號
const codes = {};
let MusicID = null;
let code = 0;

for (let i = 0; i < 4; i++) {
  const prefix = String.fromCharCode(65 + i); // 設定前綴字母（A、B、C、D）

  for (let j = 0; j < 26; j++) {
    const suffix = String.fromCharCode(65 + j); // 設定後綴字母（A 到 Z）

    const key = prefix + suffix;
    codes[code++] = key;

    if (key === 'DZ') {
      break; // 達到 'DZ' 後結束迴圈
    }
  }
}

//音樂匹配函數
function numberToLetter() {
  const byte = crypto.randomBytes(1);
  const randomInt = byte[0] % 104;
  return codes[randomInt];
}
//將用戶設為全域變數
let account = "尚未登入";
let door_number = "尚未選擇";

// 設置靜態資源目錄
app.use(express.static(__dirname));
// 解析Content-Type為application/json的請求
app.use(bodyParser.json()); 
// 處理POST /send請求
app.post('/send', function (req, res) {
  //console.log(req.body);
  const jsonData = req.body;
  
  if (account != jsonData["Account"]){
    //console.log("Account:" + account)
    MusicID = null;
    time_out = 0;
    account = jsonData["Account"];
  }
  if (door_number != jsonData["post_door_number"]){
    //console.log("Door_number:" + door_number)
    MusicID = null;
    time_out = 0;
    door_number = jsonData["post_door_number"]
  }

  if(MusicID === null){
    console.log(account + "登入成功"+"\n");
    //會員登入隨機選曲
    MusicID = numberToLetter();
    const obj = { "door_number":door_number,"music": MusicID + ".mp3", "target": "N" };
    const str = JSON.stringify(obj);
    console.log("選擇門禁為：" + door_number+"\n");
    console.log("音樂開始播放" + MusicID+"\n");
    em.emit('FirstEvent', str);
    res.json({ 'message': '登入成功' });
  }
  else if(jsonData["doorpassword"] !== null){
    const getpassword = jsonData["doorpassword"];
    if (MusicID === getpassword){
      console.log("驗證正確\n");
      console.log("開啟門禁\n");
      const obj = { "door_number":door_number,"music": "stop", "target": "door" };
      const str = JSON.stringify(obj);
      em.emit('FirstEvent', str);
      res.json({ 'message': 'success' });
      MusicID = null;
      // 在使用者成功登入後記錄當時時間至資料庫
      let datetime = new Date();
      let formatted_datetime = datetime.getFullYear() + "-" + (datetime.getMonth() + 1) + "-" + datetime.getDate() + " " + datetime.getHours() + ":" + datetime.getMinutes() + ":" + datetime.getSeconds();
      let sql = `INSERT INTO logintime (account,door, time) VALUES ('${account}','${door_number}', '${formatted_datetime}')`;
      con.query(sql, function (err, result) {
        if (err) throw err;
        //console.log("1 record inserted");
      });
    }
    else {
      time_out++;
      console.log("驗證錯誤 收到的驗證碼為：" + getpassword + "\n" + time_out);
      console.log("請重新嘗試" + "\n");
      MusicID = numberToLetter();
      const obj = { "door_number": door_number, "music": MusicID + ".mp3", "target": "N" };
      const str = JSON.stringify(obj);
      if (time_out >= 3){
        time_out = 0;
        MusicID = null;
        console.log("已達錯誤上限請重新登入\n");
        return;
      }
      //console.log("等待1秒...");
      setTimeout(() => {
        console.log("音樂重新播放" + MusicID + "\n");
        em.emit('FirstEvent', str);
        res.json({ 'message': 'ERROR' });
      }, 1000);
    }
  }
  else{
    console.log("發生錯誤，請重新登入"+"\n");
    res.json({ 'message': '請重新登入' });
  }
});
//程式關閉時關閉SQL
process.on("exit", function() {
  con.end(function(err) {
    if (err) throw err;
    console.log("Database connection closed");
  });
});
// 處理POST /message請求
app.post('/message', function (req, res) {
  const clients = wss.clients;
// 向每個WebSocket客戶端發送消息
  clients.forEach(client => {
    client.send(JSON.stringify(req.body));
  });
// 發送JSON響應
  res.json({ 'message': 'success' });
});
// 監聽WebSocket連接事件
wss.on('connection', ws => {
  console.log('Client connected');
// 監聽WebSocket收到消息事件
  ws.on('message', data => {
    let clients = wss.clients;

    clients.forEach(client => {
      client.send(data);
    });
  });
// 監聽事件發射器發射FirstEvent事件
  em.on('FirstEvent', function (data) {
    //console.log(data);
    // 向WebSocket客戶端發送消息
    ws.send(data);
  });
// 監聽WebSocket斷開連接事件
  ws.on('close', () => {
    console.log('Close connected');
  });
});