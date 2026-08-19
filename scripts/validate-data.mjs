import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const canonicalBytes = fs.readFileSync("seed/collection.json");
const appBytes = fs.readFileSync("apps/web/src/data/collection.json");
assert.equal(crypto.createHash("sha256").update(canonicalBytes).digest("hex"), crypto.createHash("sha256").update(appBytes).digest("hex"), "App seed must match canonical seed byte-for-byte");
const retiredBytes = fs.readFileSync("seed/retired-v25.json");
const appRetiredBytes = fs.readFileSync("apps/web/src/data/retired-v25.json");
assert.equal(crypto.createHash("sha256").update(retiredBytes).digest("hex"), crypto.createHash("sha256").update(appRetiredBytes).digest("hex"), "App retired archive must match canonical retired archive byte-for-byte");

const data = JSON.parse(canonicalBytes.toString("utf8"));
const cards = data.cards;
assert.equal(cards.length, 821);
assert.equal(new Set(cards.map((card) => card.masterId)).size, cards.length, "Every physical card needs a unique legacy master ID");
const grades = cards.filter((card) => card.grading);
assert.equal(grades.length, 17, "Expected 17 grading records attached to active physical cards");

const retired = JSON.parse(retiredBytes.toString("utf8"));
assert.equal(retired.retiredCount, 39, "Expected 39 reconciled rows outside active inventory");
assert.equal(retired.records.filter((record) => record.card?.grading).length, 1, "The retired Latias grading record must remain archived");
assert.equal(grades.length + retired.records.filter((record) => record.card?.grading).length, 18, "All historical grading records must be preserved");

let hasPsa5 = false;
for (const card of grades) {
  const probabilities = card.grading.probabilities || {};
  const supplied = Object.values(probabilities).filter((value) => value != null).map(Number);
  if (supplied.length) assert.ok(Math.abs(supplied.reduce((sum, value) => sum + value, 0) - 1) <= 0.001, `Probabilities do not total 1 for ${card.masterId}`);
  hasPsa5 ||= Number(probabilities["5"] || 0) > 0;
  const expected = Object.entries(probabilities).reduce((sum, [grade, probability]) => sum + Number(probability || 0) * Number(card.grading.values?.[grade] || 0), 0);
  assert.ok(Math.abs(expected - Number(card.grading.expectedGradedValue)) < 0.01, `Stored EV formula mismatch for ${card.masterId}`);
}
assert.ok(hasPsa5, "Seed must exercise PSA 5 probability");

const printingGroups = new Map();
for (const card of cards) {
  const key = [card.name, card.cardNumber, card.setName, card.variant].join("|");
  printingGroups.set(key, [...(printingGroups.get(key) || []), card]);
}
assert.ok([...printingGroups.values()].some((group) => group.length >= 3), "Expected known multi-copy printings");

const photoMap = JSON.parse(fs.readFileSync("seed/photos-map.json", "utf8"));
const masterIds = new Set(cards.map((card) => card.masterId));
for (const [folder, masterId] of Object.entries(photoMap)) assert.ok(masterIds.has(masterId), `Photo folder ${folder} maps to missing physical card ${masterId}`);
const manifest = fs.readFileSync("seed/source/photos-manifest.csv", "utf8").trim().split(/\r?\n/);
assert.equal(manifest.length - 1, 142, "Photo manifest row count changed unexpectedly");
assert.ok(fs.statSync("seed/source/collection-v25.xlsx").size > 100_000, "Preserved reconciled workbook is missing or truncated");

const cardImages = JSON.parse(fs.readFileSync("apps/web/src/data/card-images.json", "utf8"));
assert.ok(Object.keys(cardImages).length >= 700, "Reference image coverage unexpectedly dropped");
for (const [masterId, url] of Object.entries(cardImages)) {
  assert.ok(masterIds.has(Number(masterId)), `Reference image points to missing physical card ${masterId}`);
  assert.match(url, /^https:\/\/images\.pokemontcg\.io\/[a-z0-9-]+\/[a-z0-9-]+\.png$/i, `Unexpected reference image URL for ${masterId}`);
}

for (const file of ["package.json", "apps/web/package.json", "services/mcp-server/package.json", ".env.example", "apps/web/.env.example", "services/mcp-server/.env.example", "services/video-worker/.env.example"]) {
  assert.doesNotMatch(fs.readFileSync(file, "utf8"), /OPENAI_API_KEY|\"openai\"\s*:/i, `${file} introduces an OpenAI API dependency`);
}
console.log(`validated 821 active physical cards, 39 reconciled archived rows, 18 preserved historical grades, EV math (including PSA 5), 142-photo manifest mappings, ${Object.keys(cardImages).length} reference images, and the v25 workbook`);
