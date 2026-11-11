// POST /api/bot {meetingId}  派 ProveBackBot 機器人（Recall.ai）進入會議
const { send, body, handle } = require("../lib/http");
const core = require("../lib/core");

module.exports = handle(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const { meetingId } = await body(req);
  const m = await core.getMeeting(meetingId);
  if (!m) return send(res, 404, { error: "meeting not found" });
  if (!m.meetUrl) return send(res, 400, { error: "This meeting has no Google Meet link" });
  const bot = await core.sendBot(req, m);
  send(res, 200, { botId: bot.id });
});
