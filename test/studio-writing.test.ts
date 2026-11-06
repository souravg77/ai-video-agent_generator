import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { config } from "../src/config.js";
import { listServerModels, probeOpenaiServer } from "../src/studio/server.js";

// A stand-in for LM Studio's local server: answers GET /v1/models with the given model ids.
function fakeLmStudio(models: string[]): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    if (req.url === "/v1/models") return void res.end(JSON.stringify({ object: "list", data: models.map((id) => ({ id, object: "model" })) }));
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` })));
}

test("Studio writing: lists the models an LM Studio server has loaded", async () => {
  const { server, url } = await fakeLmStudio(["qwen3-14b", "llama-3.2-3b-instruct"]);
  try {
    assert.deepEqual(await listServerModels(url + "/"), ["qwen3-14b", "llama-3.2-3b-instruct"]);
  } finally {
    server.close();
  }
});

test("Studio writing: readiness says which model is missing, and passes when it's loaded", async () => {
  const { server, url } = await fakeLmStudio(["llama-3.2-3b-instruct"]);
  const saved = { base: config.OPENAI_BASE_URL, model: config.OPENAI_MODEL };
  config.OPENAI_BASE_URL = url;
  try {
    config.OPENAI_MODEL = "qwen3-14b";
    const missing = await probeOpenaiServer();
    assert.equal(missing.ready, false);
    assert.match(missing.reason ?? "", /doesn't have "qwen3-14b".*llama-3\.2-3b-instruct/);

    config.OPENAI_MODEL = "llama-3.2-3b-instruct";
    assert.deepEqual(await probeOpenaiServer(), { ready: true });
  } finally {
    server.close();
    config.OPENAI_BASE_URL = saved.base; config.OPENAI_MODEL = saved.model;
  }
});

test("Studio writing: a stopped server gives LM Studio start-up advice", async () => {
  const saved = config.OPENAI_BASE_URL;
  config.OPENAI_BASE_URL = "http://127.0.0.1:9/v1";
  try {
    const p = await probeOpenaiServer();
    assert.equal(p.ready, false);
    assert.match(p.reason ?? "", /Start server/);
  } finally {
    config.OPENAI_BASE_URL = saved;
  }
});
