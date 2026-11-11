// ProveBackBot 核心邏輯：workspace、驗證 session、政策判斷、Self 連結、Recall 機器人
const crypto = require("crypto");
const { load, save } = require("./store");

// ---------- 設定 ----------
const SCOPE = process.env.SELF_SCOPE || "provebackbot-demo";          // Self scope（<= 30 字元，前後端必須一致）
const SELF_MOCK = process.env.SELF_MOCK !== "false";               // true = 接受 Self App 的 mock passport（staging）
const OFAC = process.env.SELF_OFAC === "true";                     // 是否要求 OFAC 檢查（前後端必須一致）
const RECALL_REGION = process.env.RECALL_REGION || "us-east-1";

function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return "https://" + (req && req.headers && req.headers.host);
}
const verifyEndpoint = (req) => baseUrl(req) + "/api/verify";
const norm = (id) => String(id || "").replace(/-/g, "").toLowerCase();
const shortId = () => crypto.randomBytes(4).toString("hex");

// ---------- Workspace ----------
const DEFAULT_WS = {
  id: "demo",
  name: "Acme Foundation",
  domain: "acme.org",
  policy: { strict: true, excludedCountries: ["PRK", "IRN"] },
  members: [
    { email: "albert2367593@gmail.com", name: "Albert Cheng", nullifier: null, onboardedAt: null },
  ],
};
async function getWorkspace(id = "demo") {
  let ws = await load("ws-" + id);
  if (!ws && id === "demo") ws = await save("ws-demo", structuredClone(DEFAULT_WS));
  return ws;
}
const saveWorkspace = (ws) => save("ws-" + ws.id, ws);

// ---------- 驗證 session（每個 QR code 對應一個 session = Self 的 userId） ----------
async function createSession(data) {
  const id = crypto.randomUUID();
  await save("s-" + norm(id), { id, createdAt: Date.now(), ...data });
  return id;
}
const getSession = (id) => load("s-" + norm(id));

// ---------- Self App 連結 ----------
function selfLink(req, sessionId, appName = "ProveBackBot") {
  // 用 Self 官方的 SelfAppBuilder 產生設定，確保格式與目前版本的 Self App 相容
  const { SelfAppBuilder } = require("@selfxyz/common");
  const { getUniversalLink } = require("@selfxyz/core");
  const app = new SelfAppBuilder({
    appName,
    scope: SCOPE,
    endpoint: verifyEndpoint(req),
    endpointType: SELF_MOCK ? "staging_https" : "https",
    userId: sessionId,
    userIdType: "uuid",
    disclosures: { name: true, nationality: true, ...(OFAC ? { ofac: true } : {}) },
  }).build();
  return getUniversalLink(app);
}

// ---------- 會議 ----------
async function createMeeting({ workspaceId = "demo", meetUrl = "", guests = [] }) {
  const id = shortId();
  const memberSession = await createSession({ type: "meeting-member", meetingId: id });
  const meeting = {
    id, workspaceId, meetUrl, botId: null, createdAt: Date.now(),
    memberSession, seats: [], log: [],
  };
  for (const name of guests.filter(Boolean)) meeting.seats.push(await newGuestSeat(id, name));
  await save("m-" + id, meeting);
  return meeting;
}
async function newGuestSeat(meetingId, name) {
  const seatId = shortId();
  const session = await createSession({ type: "meeting-guest", meetingId, seatId });
  return { seatId, name, kind: "guest", status: "pending", reason: "", session, nullifier: null, at: null };
}
const getMeeting = (id) => load("m-" + id);
const saveMeeting = (m) => save("m-" + m.id, m);

// 參與者加入（來自 Recall 即時事件或手動新增）：成員顯示「待驗證」，外人建立訪客席位
async function participantJoined(meeting, name) {
  if (!name || /provebackbot/i.test(name)) return null;
  const exists = meeting.seats.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (exists) return null;
  const ws = await getWorkspace(meeting.workspaceId);
  const member = ws.members.find((m) => m.name.toLowerCase() === name.toLowerCase());
  const seat = member
    ? { seatId: shortId(), name: member.name, email: member.email, kind: "member", status: "pending", reason: "", nullifier: null, at: null }
    : await newGuestSeat(meeting.id, name);
  meeting.seats.push(seat);
  return seat;
}

// ---------- 政策判斷：收到一份已驗證的護照揭露資料後要做的事 ----------
// disclosed = { nullifier, nationality, name, ofacOk }
const tokens = (s) => String(s || "").toUpperCase().replace(/[^A-Z\u4e00-\u9fff ]+/g, " ").split(/\s+/).filter(Boolean);
const nameMatches = (seatName, passportName) => {
  const p = new Set(tokens(passportName));
  const want = tokens(seatName);
  return want.length > 0 && want.every((t) => p.has(t));
};

async function applyDisclosure(req, sessionId, disclosed) {
  const session = await getSession(sessionId);
  if (!session) return { ok: false, reason: "Verification link not found. Please scan again." };

  // 1) 成員 onboarding：把護照 nullifier 綁到 email
  if (session.type === "onboard") {
    const ws = await getWorkspace(session.workspaceId);
    const taken = ws.members.find((m) => m.nullifier === disclosed.nullifier && m.email !== session.email);
    if (taken) return { ok: false, reason: "This passport is already bound to another member." };
    const m = ws.members.find((x) => x.email === session.email);
    if (!m) return { ok: false, reason: "This member is not in the workspace." };
    m.nullifier = disclosed.nullifier; m.onboardedAt = Date.now(); m.nationality = disclosed.nationality || null;
    await saveWorkspace(ws);
    return { ok: true, reason: `${m.name} completed onboarding.` };
  }

  const meeting = await getMeeting(session.meetingId);
  if (!meeting) return { ok: false, reason: "Meeting not found." };
  const ws = await getWorkspace(meeting.workspaceId);
  const policy = ws.policy || {};
  const now = Date.now();
  let seat, ok, reason;

  // 同一本護照在同一場會議只能對應一個席位
  const dup = meeting.seats.find((s) => s.nullifier === disclosed.nullifier && s.status === "ok");

  if (session.type === "meeting-member") {
    // 2) 共用 QR：用 nullifier 對應已 onboarding 的成員
    const member = ws.members.find((m) => m.nullifier && m.nullifier === disclosed.nullifier);
    if (member) {
      seat = meeting.seats.find((s) => s.email === member.email);
      if (!seat) { seat = { seatId: shortId(), name: member.name, email: member.email, kind: "member" }; meeting.seats.push(seat); }
      ok = !dup || dup === seat; reason = ok ? "Verified: workspace member" : "This passport was already verified in this meeting";
    } else {
      seat = { seatId: shortId(), name: "Unregistered passport", kind: "unknown" }; meeting.seats.push(seat);
      ok = false; reason = policy.strict ? "Passport does not belong to any registered member (strict mode)" : "Not a member. Please verify with a guest link instead";
    }
  } else if (session.type === "meeting-guest") {
    // 3) 訪客專屬 QR：檢查國籍政策、OFAC、姓名是否與會議顯示名稱相符
    seat = meeting.seats.find((s) => s.seatId === session.seatId);
    if (!seat) return { ok: false, reason: "Guest seat not found." };
    const banned = (policy.excludedCountries || []).includes(String(disclosed.nationality || "").toUpperCase());
    if (dup && dup !== seat) { ok = false; reason = "This passport was already used to verify another seat"; }
    else if (banned) { ok = false; reason = `Passport nationality is restricted (${disclosed.nationality})`; }
    else if (disclosed.ofacOk === false) { ok = false; reason = "Failed OFAC sanctions check"; }
    else if (!nameMatches(seat.name, disclosed.name)) { ok = false; reason = "Passport name does not match the meeting display name"; }
    else { ok = true; reason = `Verified: external guest (${disclosed.nationality})`; }
  } else {
    return { ok: false, reason: "Unknown verification type." };
  }

  Object.assign(seat, { status: ok ? "ok" : "fail", reason, at: now, nullifier: ok ? disclosed.nullifier : seat.nullifier || null, nationality: disclosed.nationality || seat.nationality || null });
  meeting.log.push({ at: now, name: seat.name, ok, reason });
  await saveMeeting(meeting);
  await chat(meeting, `${ok ? "✅" : "❌"} ${seat.name}：${reason}`);
  return { ok, reason, seat };
}

// ---------- Recall.ai ----------
async function recall(path, body) {
  if (!process.env.RECALL_API_KEY) throw new Error("RECALL_API_KEY environment variable is not set");
  const r = await fetch(`https://${RECALL_REGION}.recall.ai/api/v1/${path}`, {
    method: "POST",
    headers: { Authorization: process.env.RECALL_API_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Recall ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}
async function chat(meeting, message) {
  if (!meeting.botId || !process.env.RECALL_API_KEY) return;
  try { await recall(`bot/${meeting.botId}/send_chat_message/`, { message }); }
  catch (e) { console.error("chat failed", e.message); }
}
async function sendBot(req, meeting) {
  const base = baseUrl(req);
  const bot = await recall("bot/", {
    meeting_url: meeting.meetUrl,
    bot_name: "ProveBackBot",
    output_media: { camera: { kind: "webpage", config: { url: `${base}/bot-screen.html?m=${meeting.id}` } } },
    chat: { on_bot_join: { send_to: "everyone", message: "ProveBackBot has joined. Members: scan the QR code on screen with the Self App. External guests: please wait for your personal link." } },
    recording_config: {
      realtime_endpoints: [{ type: "webhook", url: `${base}/api/recall-webhook?m=${meeting.id}`, events: ["participant_events.join"] }],
    },
  });
  meeting.botId = bot.id;
  await saveMeeting(meeting);
  return bot;
}

module.exports = {
  SCOPE, SELF_MOCK, OFAC, baseUrl, verifyEndpoint, norm,
  getWorkspace, saveWorkspace, createSession, getSession, selfLink,
  createMeeting, getMeeting, saveMeeting, newGuestSeat, participantJoined,
  applyDisclosure, chat, sendBot, nameMatches,
};
