// GET  /api/workspace?id=demo          讀取 workspace（含成員 onboarding 狀態與政策）
// POST /api/workspace {id, policy?, members?}  更新政策或成員名單
const { send, body, query, handle } = require("../lib/http");
const { getWorkspace, saveWorkspace } = require("../lib/core");

module.exports = handle(async (req, res) => {
  const id = query(req).id || "demo";
  const ws = await getWorkspace(id);
  if (!ws) return send(res, 404, { error: "workspace not found" });
  if (req.method === "POST") {
    const b = await body(req);
    if (b.policy) ws.policy = { ...ws.policy, ...b.policy };
    if (Array.isArray(b.members)) {
      ws.members = b.members.map((m) => {
        const old = ws.members.find((x) => x.email === m.email);
        return { email: m.email, name: m.name, nullifier: old ? old.nullifier : null, onboardedAt: old ? old.onboardedAt : null };
      });
    }
    await saveWorkspace(ws);
  }
  send(res, 200, {
    ...ws,
    members: ws.members.map((m) => ({ email: m.email, name: m.name, onboarded: !!m.nullifier, onboardedAt: m.onboardedAt })),
  });
});
