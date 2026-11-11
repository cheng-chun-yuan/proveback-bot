// GET /api/link?s=<session>  導向 Self App（給手機直接點擊的連結）
const { query, handle, send } = require("../lib/http");
const { getSession, selfLink } = require("../lib/core");
module.exports = handle(async (req, res) => {
  const session = await getSession(query(req).s);
  if (!session) return send(res, 404, { error: "session not found" });
  res.statusCode = 302; res.setHeader("Location", selfLink(req, session.id)); res.end();
});
