const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { downloadDrugImage, fileUrlFromUuid, mapSearchHit } = require("../src/services/mpaClient");

test("mapSearchHit Retsipli → isPrescription", () => {
  const row = mapSearchHit({
    drugId: "abc",
    shortName: "Test",
    fullName: "Test full",
    dispensingConditions: "Retsipli",
    prescriptionRequired: true,
  });
  assert.equal(row.isPrescription, true);
  assert.equal(row.mpaId, "abc");
});

test("HEAD 401 bo'lsa ham GET bilan rasm yuklanadi (mock)", async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, ...Buffer.alloc(2500, 1)]);
  const server = http.createServer((req, res) => {
    if (req.method === "HEAD") {
      res.writeHead(401, { "Content-Type": "text/plain" });
      res.end("unauthorized");
      return;
    }
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": jpeg.length });
      res.end(jpeg);
      return;
    }
    res.writeHead(405);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/file-api/v1/drugs/mock-id.jpg`;

  try {
    const result = await downloadDrugImage(url);
    assert.equal(result.contentType.includes("image/jpeg"), true);
    assert.ok(result.buffer.length >= 2000);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("fileUrlFromUuid uuid dan URL yasaydi", () => {
  const url = fileUrlFromUuid("11111111-2222-3333-4444-555555555555");
  assert.match(url, /\/11111111-2222-3333-4444-555555555555\.jpg$/);
});
