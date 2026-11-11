// Recall.ai:一套 API 把 bot 送進 Google Meet / Zoom / Teams
export function recallAdapter({ apiKey, region, publicUrl, webhookToken, botName }) {
  const base = `https://${region}.recall.ai/api/v1`;
  const call = async (path, body) => {
    const r = await fetch(base + path, {
      method: 'POST',
      headers: { authorization: `Token ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Recall ${path} → ${r.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  };

  return {
    name: 'recall',
    async createBot({ meetingId, meetingUrl }) {
      const bot = await call('/bot/', {
        meeting_url: meetingUrl,
        bot_name: botName,
        metadata: { meetingId },
        recording_config: {
          realtime_endpoints: [
            {
              type: 'webhook',
              url: `${publicUrl}/webhooks/recall?token=${encodeURIComponent(webhookToken)}`,
              events: ['participant_events.join', 'participant_events.leave', 'participant_events.chat_message'],
            },
          ],
        },
      });
      return { botId: bot.id };
    },
    sendChat: (botId, message) => call(`/bot/${botId}/send_chat_message/`, { to: 'everyone', message }),
    leave: (botId) => call(`/bot/${botId}/leave_call/`),

    // 掛上 Recall 的即時 webhook
    mount(app, { onJoin, onLeave, onChat }) {
      app.post('/webhooks/recall', (req, res) => {
        if (req.query.token !== webhookToken) return res.status(401).end();
        res.status(200).end();
        const { event, data } = req.body || {};
        const participant = data?.data?.participant;
        const botId = data?.bot?.id;
        const meetingId = data?.bot?.metadata?.meetingId;
        if (!participant || !botId || !meetingId) return;
        const who = { id: String(participant.id), name: participant.name || '與會者' };
        if (who.name === botName) return; // bot 自己
        const ctx = { botId, meetingId };
        if (event === 'participant_events.join') onJoin(ctx, who);
        else if (event === 'participant_events.leave') onLeave(ctx, who);
        else if (event === 'participant_events.chat_message') onChat(ctx, who, data.data.data?.text || '');
      });
    },
  };
}
