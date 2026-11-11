// GET /api/qr?s=<session>  回傳這個驗證 session 的 Self App QR code（SVG）
const QRCode = require("qrcode");
const { query, handle, send } = require("../lib/http");
const { getSession, selfLink } = require("../lib/core");

module.exports = handle(async (req, res) => {
  const { s } = query(req);
  const session = s && (await getSession(s));
  if (!session) return send(res, 404, { error: "session not found" });
  const svg = await QRCode.toString(selfLink(req, session.id), { type: "svg", margin: 1, errorCorrectionLevel: "L" });
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "no-store");
  res.end(svg);
});
