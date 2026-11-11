// POST /api/onboard {workspaceId, email}  為成員建立 onboarding QR（掃護照後把 nullifier 綁到 email）
const { send, body, handle } = require("../lib/http");
const { getWorkspace, createSession, selfLink, baseUrl } = require("../lib/core");

module.exports = handle(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const { workspaceId = "demo", email } = await body(req);
  const ws = await getWorkspace(workspaceId);
  if (!ws || !ws.members.find((m) => m.email === email)) return send(res, 404, { error: "member not found" });
  const session = await createSession({ type: "onboard", workspaceId, email });
  send(res, 200, { session, link: selfLink(req, session, "ProveBackBot onboarding"), page: `${baseUrl(req)}/s.html?s=${session}` });
});
