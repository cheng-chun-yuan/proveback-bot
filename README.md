# proveback-bot

進會議要求與會者驗證身份的 bot。政策與驗證都在 `proveback-app`,這裡不存個資。

- 有人加入 → 在聊天室發驗證連結。
- 有人貼驗證碼 → 向 `proveback-app` 兌換,公告徽章(例:`✅ 小明|護照已驗證|國籍:TWN`)。
- 逾時未驗證 → 在聊天室提醒。

## 啟動

```bash
npm install
cp .env.example .env
npm start
```

沒填 `RECALL_API_KEY` 時是**模擬會議室模式**:從 ProveBack 派 bot 後會得到一個 `/sim/?room=…` 連結,開多個分頁就能扮演多位與會者。

## 接上真實會議(Recall.ai)

1. 申請 Recall.ai API key,填入 `RECALL_API_KEY`,`RECALL_REGION` 要跟帳號區域一致。
2. 用 ngrok 或 Cloudflare Tunnel 把 4100 port 公開,把公開網址填入 `PUBLIC_URL`。
3. 在 ProveBack 貼上 Google Meet 連結派 bot,主持人在會議裡准許 bot 加入。

Zoom 與 Teams 用同一套程式,貼對應的會議連結即可。

## 注意

- Recall 的 bot 預設會錄製會議。正式使用前請在 `adapters/recall.js` 的 `recording_config` 關掉錄製,或明確告知與會者。
- 會議平台不開放在別人頭像上加徽章,所以徽章是以聊天室公告呈現。
- bot 沒有主持人權限,不會踢人,逾時只會提醒。

## 結構

- `server.js`:加入、聊天、逾時的處理邏輯。
- `adapters/recall.js`:Recall.ai 的建立 bot、發訊息、webhook。
- `adapters/sim.js` + `public/`:模擬會議室。
