// POST /api/meeting {workspaceId, meetUrl, guests:[名字]}  建立會議
// GET  /api/meeting?id=xxx                                 讀取會議狀態（bot 畫面每秒輪詢）
// POST /api/meeting?id=xxx&action=join {name}              手動模擬「有人加入會議」
const { send, body, query, handle } = require("../lib/http");
const core = require("../lib/core");

const view = (m, ws) => ({
  id: m.id, meetUrl: m.meetUrl, botId: m.botId, workspace: ws && { id: ws.id, name: ws.name, policy: ws.policy },
  memberSession: m.memberSession,
  seats: m.seats.map(({ nullifier, ...s }) => s),
  log: m.log.slice(-20),
});

module.exports = handle(async (req, res) => {
  const q = query(req);
  if (req.method === "POST" && !q.id) {
    const b = await body(req);
    const m = await core.createMeeting(b);
    return send(res, 200, view(m, await core.getWorkspace(m.workspaceId)));
  }
  const m = await core.getMeeting(q.id);
  if (!m) return send(res, 404, { error: "meeting not found" });
  if (req.method === "POST" && q.action === "join") {
    const { name } = await body(req);
    const seat = await core.participantJoined(m, name);
    await core.saveMeeting(m);
    if (seat && seat.kind === "guest") await core.chat(m, `Hi ${seat.name}, please open this link on your phone to verify your passport: ${core.baseUrl(req)}/s.html?s=${seat.session}`);
  }
  send(res, 200, view(m, await core.getWorkspace(m.workspaceId)));
});
