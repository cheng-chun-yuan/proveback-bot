// 小工具：JSON 回應、讀取 body、錯誤處理
const send = (res, code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); };
async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { return {}; }
}
const query = (req) => Object.fromEntries(new URL(req.url, "http://x").searchParams);
const handle = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) { console.error(e); send(res, 500, { error: String(e.message || e) }); }
};
module.exports = { send, body, query, handle };
