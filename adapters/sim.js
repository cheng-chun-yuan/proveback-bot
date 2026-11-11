// 模擬會議室:沒有 Recall 金鑰時,用瀏覽器分頁假裝與會者,測完整流程
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';

export function simAdapter({ publicUrl, botName }) {
  const rooms = new Map(); // botId -> { meetingId, messages: [], nextPid }

  const post = (room, from, text) => room.messages.push({ from, text, at: Date.now() });

  return {
    name: 'sim',
    async createBot({ meetingId }) {
      const botId = crypto.randomUUID();
      rooms.set(botId, { meetingId, messages: [], nextPid: 1 });
      return { botId, joinUrl: `${publicUrl}/sim/?room=${botId}` };
    },
    async sendChat(botId, message) {
      const room = rooms.get(botId);
      if (room) post(room, botName, message);
    },
    async leave(botId) {
      rooms.delete(botId);
    },

    mount(app, { onJoin, onLeave, onChat }) {
      app.use('/sim', express.static(fileURLToPath(new URL('../public', import.meta.url))));
      const roomOf = (req, res) => rooms.get(req.params.botId) || (res.status(404).json({ error: 'no_room' }), null);

      app.post('/sim/api/:botId/join', (req, res) => {
        const room = roomOf(req, res);
        if (!room) return;
        const who = { id: String(room.nextPid++), name: String(req.body.name || '訪客').slice(0, 40) };
        post(room, null, `${who.name} 加入了會議`);
        res.json(who);
        onJoin({ botId: req.params.botId, meetingId: room.meetingId }, who);
      });
      app.post('/sim/api/:botId/chat', (req, res) => {
        const room = roomOf(req, res);
        if (!room) return;
        const who = { id: String(req.body.id), name: String(req.body.name || '訪客').slice(0, 40) };
        const text = String(req.body.text || '').slice(0, 2000);
        post(room, who.name, text);
        res.json({ ok: true });
        onChat({ botId: req.params.botId, meetingId: room.meetingId }, who, text);
      });
      app.get('/sim/api/:botId/messages', (req, res) => {
        const room = roomOf(req, res);
        if (room) res.json(room.messages);
      });
    },
  };
}
