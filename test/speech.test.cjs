"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const speak = require("../api/speak/index.js");

const origins = [
  "https://rokach-timetable.magalhoresh.com",
  "https://ashy-ground-097745f0f.5.azurestaticapps.net"
];
const request = origin => ({method: "POST", headers: {origin, "content-type": "application/json"}, body: {text: "בדיקת ציוד"}});
const context = () => ({log: {error() {}}});

test("both existing speech origins return MP3 and unrelated origins are rejected", async t => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SPEECH_KEY;
  const originalRegion = process.env.SPEECH_REGION;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SPEECH_KEY;
    else process.env.SPEECH_KEY = originalKey;
    if (originalRegion === undefined) delete process.env.SPEECH_REGION;
    else process.env.SPEECH_REGION = originalRegion;
  });
  process.env.SPEECH_KEY = "synthetic-test-only";
  process.env.SPEECH_REGION = "eastus";
  const audio = Buffer.alloc(200, 0);
  audio[0] = 0xff;
  audio[1] = 0xfb;
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1");
    assert.match(options.body, /בדיקת ציוד/);
    return {ok: true, arrayBuffer: async () => audio};
  };
  for (const origin of origins) {
    const ctx = context();
    await speak(ctx, request(origin));
    assert.equal(ctx.res.status, 200);
    assert.equal(ctx.res.headers["Access-Control-Allow-Origin"], origin);
    assert.equal(ctx.res.headers["Content-Type"], "audio/mpeg");
    assert.equal(ctx.res.headers["Cache-Control"], "private, no-store, max-age=0");
    assert.deepEqual(ctx.res.body, audio);
  }
  const denied = context();
  await speak(denied, request("https://unrelated.example"));
  assert.equal(denied.res.status, 403);
  assert.deepEqual(denied.res.body, {error: "origin_not_allowed"});
  assert.equal(calls, 2);
});

test("speech validates input and handles OPTIONS without reaching Microsoft", async () => {
  for (const [req, status] of [
    [{...request(origins[0]), method: "GET"}, 405],
    [{...request(origins[0]), body: {text: "", name: "not-allowed"}}, 400],
    [{...request(origins[0]), body: {text: ""}}, 400],
    [{...request(origins[0]), headers: {origin: origins[0], "content-type": "text/plain"}}, 415],
    [{...request(origins[0]), method: "OPTIONS"}, 204]
  ]) {
    const ctx = context();
    await speak(ctx, req);
    assert.equal(ctx.res.status, status);
  }
});
