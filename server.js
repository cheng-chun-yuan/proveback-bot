import express from 'express';
import { recallAdapter } from './adapters/recall.js';
import { simAdapter } from './adapters/sim.js';

const PORT = process.env.PORT || 4100;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const CONSOLE_URL = (process.env.CONSOLE_URL || 'http://localhost:4000').replace(/\/$/, '');
const SHARED_SECRET = process.env.SHARED_SECRET || 'change-me';
const BOT_NAME = process.env.BOT_NAME || 'ProveBack';

const adapter = process.env.RECALL_API_KEY
  ? recallAdapter({
      apiKey: process.env.RECALL_API_KEY,
      region: process.env.RECALL_REGION || 'us-west-2',
      publicUrl: PUBLIC_URL,
      webhookToken: process.env.WEBHOOK_TOKEN || 'change-me-too',
      botName: BOT_NAME,
    })
  : simAdapter({ publicUrl: PUBLIC_URL, botName: BOT_NAME });

// 呼叫 proveback-app;bot 本身不存政策也不存個資
async function consoleApi(path, body) {
  const r = await fetch(CONSOLE_URL + path, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${SHARED_SECRET}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`console ${path} → ${r.status}`);
  return r.json();
}

const say = (botId, text) => adapter.sendChat(botId, text).catch((e) => console.error('送訊息失敗:', e.message));
const timers = new Map(); // `${botId}:${participantId}` -> timeout
const CODE = /\bV-\d{6}\b/;

async function onJoin({ botId, meetingId }, who) {
  try {
    const s = await consoleApi('/api/sessions', { meetingId, participantId: who.id, participantName: who.name });
    if (s.status === 'bound') return; // 重新進來,之前已驗證過
    const mins = Math.max(1, Math.round(s.timeoutSec / 60));
    await say(botId, `👋 ${who.name},這場會議需要驗證身份。請在 ${mins} 分鐘內完成:${s.verifyUrl}\n完成後,把頁面上的驗證碼貼回聊天室。`);

    const key = `${botId}:${who.id}`;
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(async () => {
        timers.delete(key);
        const st = await consoleApi(`/api/meetings/${meetingId}/participants/${who.id}`).catch(() => null);
        if (st && !st.verified) say(botId, `⏰ ${who.name} 尚未完成身份驗證。`);
      }, s.timeoutSec * 1000),
    );
  } catch (e) {
    console.error('onJoin 失敗:', e.message);
  }
}

function onLeave({ botId }, who) {
  const key = `${botId}:${who.id}`;
  clearTimeout(timers.get(key));
  timers.delete(key);
}

async function onChat({ botId, meetingId }, who, text) {
  const code = text.match(CODE)?.[0];
  if (!code) return;
  try {
    const r = await consoleApi('/api/redeem', { meetingId, participantId: who.id, code });
    if (r.ok) {
      onLeave({ botId }, who); // 取消逾時提醒
      await say(botId, `✅ ${who.name}|${r.badge}`);
    } else if (r.reason === 'participant_mismatch') {
      await say(botId, `⚠️ ${who.name},這組驗證碼不是發給你的,請使用 bot 給你的連結。`);
    } else {
      await say(botId, `⚠️ ${who.name},驗證碼無效或已使用過。`);
    }
  } catch (e) {
    console.error('onChat 失敗:', e.message);
  }
}

const app = express();
app.use(express.json());

const auth = (req, res, next) =>
  req.get('authorization') === `Bearer ${SHARED_SECRET}` ? next() : res.status(401).json({ error: 'unauthorized' });

// proveback-app 呼叫這支,把 bot 派進會議
app.post('/bots', auth, async (req, res) => {
  const { meetingId, meetingUrl } = req.body;
  if (!meetingId) return res.status(400).json({ error: '缺少 meetingId' });
  if (adapter.name === 'recall' && !/^https:\/\//.test(meetingUrl || '')) return res.status(400).json({ error: '請填會議連結' });
  try {
    res.json(await adapter.createBot({ meetingId, meetingUrl }));
  } catch (e) {
    console.error(e.message);
    res.status(502).json({ error: e.message });
  }
});

app.post('/bots/:id/leave', auth, async (req, res) => {
  await adapter.leave(req.params.id).catch(() => {});
  res.json({ ok: true });
});

adapter.mount(app, { onJoin, onLeave, onChat });

app.get('/', (req, res) => res.send(`proveback-bot 運作中(${adapter.name === 'sim' ? '模擬會議室模式' : 'Recall.ai'})`));

app.listen(PORT, () => console.log(`proveback-bot: ${PUBLIC_URL}  (${adapter.name === 'sim' ? '模擬會議室模式,未接 Recall' : 'Recall.ai 已啟用'})`));
