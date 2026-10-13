"use strict";

let activeRequests = 0;
const recentRequests = [];
const allowedOrigins = new Set([
  "https://ashy-ground-097745f0f.5.azurestaticapps.net",
  "https://rokach-timetable.magalhoresh.com"
]);
const escapeXml = text => text.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
})[char]);

module.exports = async function speak(context, req) {
  const origin = req.headers?.origin;
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin"
  };
  const fail = (status, error, retryAfter) => {
    context.res = {
      status,
      headers: {...headers, "Content-Type": "application/json", ...(retryAfter ? {"Retry-After": String(retryAfter)} : {})},
      body: {error}
    };
  };
  if (origin && !allowedOrigins.has(origin)) { fail(403, "origin_not_allowed"); return; }
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  if (req.method === "OPTIONS") {
    context.res = {status: 204, headers: {...headers, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600"}};
    return;
  }
  if (req.method !== "POST") { fail(405, "method_not_allowed"); return; }
  if (!String(req.headers?.["content-type"] || "").toLowerCase().startsWith("application/json")) { fail(415, "json_required"); return; }
  if (Number(req.headers?.["content-length"] || 0) > 4096) { fail(413, "request_too_large"); return; }
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.text !== "string") {
    fail(400, "only_text_is_accepted"); return;
  }
  const text = body.text.trim();
  if (!text || text.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    fail(400, "invalid_text"); return;
  }
  const key = process.env.SPEECH_KEY;
  const region = process.env.SPEECH_REGION;
  if (!key || !region || !/^[a-z0-9]+$/.test(region)) { fail(503, "speech_not_configured"); return; }
  const now = Date.now();
  while (recentRequests.length && recentRequests[0] < now - 60000) recentRequests.shift();
  if (activeRequests >= 2 || recentRequests.length >= 20) { fail(429, "speech_busy", 60); return; }
  recentRequests.push(now);
  activeRequests++;
  try {
    const result = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
        "User-Agent": "Rokach-Timetable"
      },
      body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="he-IL"><voice name="he-IL-HilaNeural"><prosody rate="-8%">${escapeXml(text)}</prosody></voice></speak>`,
      signal: AbortSignal.timeout(20000)
    });
    if (!result.ok) {
      context.log.error("Speech service response status:", result.status);
      fail(result.status === 429 ? 429 : 503, result.status === 429 ? "speech_busy" : "speech_unavailable", result.status === 429 ? 60 : undefined);
      return;
    }
    const audio = Buffer.from(await result.arrayBuffer());
    if (audio.length < 100) { fail(502, "empty_audio"); return; }
    context.res = {status: 200, headers: {...headers, "Content-Type": "audio/mpeg"}, body: audio, isRaw: true};
  } catch (error) {
    if (!(error instanceof DOMException) && !(error instanceof TypeError)) throw error;
    context.log.error("Speech connection failed:", error.name);
    fail(error.name === "TimeoutError" ? 504 : 503, error.name === "TimeoutError" ? "speech_timeout" : "speech_unavailable");
  } finally {
    activeRequests--;
  }
};
