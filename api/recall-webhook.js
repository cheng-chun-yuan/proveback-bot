// POST /api/recall-webhook?m=<meetingId>  Recall.ai 即時事件：有人加入會議
const { send, body, query, handle } = require("../lib/http");
const core = require("../lib/core");

module.exports = handle(async (req, res) => {
  const m = await core.getMeeting(query(req).m);
  if (!m) return send(res, 200, { ignored: true });
  const evt = await body(req);
  const p = (evt && evt.data && evt.data.data && evt.data.data.participant) || {};
  if (evt.event === "participant_events.join" && p.name && !p.is_host_bot) {
    const seat = await core.participantJoined(m, p.name);
    await core.saveMeeting(m);
    if (seat && seat.kind === "guest") await core.chat(m, `${seat.name} 你好，請在手機開啟此連結完成護照驗證：${core.baseUrl(req)}/s.html?s=${seat.session}`);
  }
  send(res, 200, { ok: true });
});
