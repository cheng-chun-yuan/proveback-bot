// POST /api/simulate {session, nationality, name, passportId}
// 開發／demo 用：不經過 Self App，直接模擬「某本護照完成驗證」。設定 ALLOW_SIMULATE=false 可關閉。
const crypto = require("crypto");
const { send, body, handle } = require("../lib/http");
const core = require("../lib/core");

module.exports = handle(async (req, res) => {
  if (process.env.ALLOW_SIMULATE === "false") return send(res, 403, { error: "simulate disabled" });
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const { session, nationality = "TWN", name = "", passportId = "" } = await body(req);
  // 模擬 nullifier：同一個 passportId 永遠得到同一個值（就像同一本護照在同一個 scope 下的 nullifier）
  const nullifier = "sim-" + crypto.createHash("sha256").update(core.SCOPE + ":" + (passportId || name)).digest("hex").slice(0, 24);
  const outcome = await core.applyDisclosure(req, session, { nullifier, nationality, name, ofacOk: true });
  send(res, 200, outcome.seat ? { ok: outcome.ok, reason: outcome.reason, seat: { ...outcome.seat, nullifier: undefined } } : outcome);
});
