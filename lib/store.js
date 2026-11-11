// 狀態存放：有 BLOB_READ_WRITE_TOKEN 時用 Vercel Blob（private），否則用記憶體（本機測試用）
const mem = new Map();
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const path = (key) => `provebackbot/${key}.json`;

async function load(key, fallback = null) {
  if (!useBlob) return mem.has(key) ? structuredClone(mem.get(key)) : fallback;
  const { get } = require("@vercel/blob");
  try {
    const r = await get(path(key), { access: "private", useCache: false });
    if (!r) return fallback;
    return JSON.parse(await new Response(r.stream).text());
  } catch (e) {
    if (e && /not ?found/i.test(e.name + e.message)) return fallback;
    throw e;
  }
}

async function save(key, value) {
  if (!useBlob) { mem.set(key, structuredClone(value)); return value; }
  const { put } = require("@vercel/blob");
  await put(path(key), JSON.stringify(value), {
    access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json", cacheControlMaxAge: 60,
  });
  return value;
}

module.exports = { load, save, useBlob };
