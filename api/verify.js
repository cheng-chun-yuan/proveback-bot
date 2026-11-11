// POST /api/verify  Self App 掃描護照後把零知識證明送到這裡
// body: { attestationId, proof, publicSignals, userContextData }
const { send, body, handle } = require("../lib/http");
const core = require("../lib/core");

function sessionFromUserIdentifier(id) {
  let u = String(id || "").toLowerCase().replace(/^0x/, "").replace(/-/g, "");
  if (/^\d+$/.test(u) && u.length > 32) u = BigInt(u).toString(16);
  return u.padStart(32, "0").slice(-32);
}

module.exports = handle(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { status: "error", result: false, reason: "POST only" });
  const { attestationId, proof, publicSignals, userContextData } = await body(req);
  if (!proof || !publicSignals || !attestationId || !userContextData)
    return send(res, 400, { status: "error", result: false, reason: "缺少 proof、publicSignals、attestationId 或 userContextData" });

  const { SelfBackendVerifier, AllIds, DefaultConfigStore } = require("@selfxyz/core");
  // 這裡的設定必須和 QR code 裡的 disclosures 一致（見 lib/core.js 的 selfLink）
  const verifier = new SelfBackendVerifier(
    core.SCOPE, core.verifyEndpoint(req), core.SELF_MOCK, AllIds,
    new DefaultConfigStore(core.OFAC ? { ofac: true } : {}), "uuid",
  );

  let result;
  try { result = await verifier.verify(attestationId, proof, publicSignals, userContextData); }
  catch (e) { return send(res, 200, { status: "error", result: false, reason: "證明驗證失敗：" + e.message }); }
  if (!result.isValidDetails.isValid) return send(res, 200, { status: "error", result: false, reason: "證明無效" });

  const d = result.discloseOutput;
  const outcome = await core.applyDisclosure(req, sessionFromUserIdentifier(result.userData.userIdentifier), {
    nullifier: String(d.nullifier),
    nationality: d.nationality,
    name: d.name,
    ofacOk: core.OFAC ? result.isValidDetails.isOfacValid : undefined,
  });
  // 證明有效就回 success（讓 Self App 顯示完成），政策結果顯示在 bot 畫面與聊天室
  send(res, 200, { status: "success", result: true, provebackbot: { ok: outcome.ok, reason: outcome.reason } });
});
