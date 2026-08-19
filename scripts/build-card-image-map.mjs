import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const collection = JSON.parse(await fs.readFile(path.join(root, "apps/web/src/data/collection.json"), "utf8"));
const output = path.join(root, "apps/web/src/data/card-images.json");
const dataRoot = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master";

const aliases = new Map([
  ["arceus", "platinum arceus"],
  ["base set", "base"],
  ["black white black star promo", "bw black star promos"],
  ["black white black star promos", "bw black star promos"],
  ["black white promo", "bw black star promos"],
  ["black white promos", "bw black star promos"],
  ["black and white black star promo", "bw black star promos"],
  ["black and white black star promos", "bw black star promos"],
  ["black and white promo", "bw black star promos"],
  ["black and white promos", "bw black star promos"],
  ["bw black star promo", "bw black star promos"],
  ["ex crystal guardians", "crystal guardians"],
  ["ex delta species", "delta species"],
  ["ex deoxys", "deoxys"],
  ["ex dragon frontiers", "dragon frontiers"],
  ["ex hidden legends", "hidden legends"],
  ["ex holon phantoms", "holon phantoms"],
  ["ex legend maker", "legend maker"],
  ["ex power keepers", "power keepers"],
  ["ex ruby and sapphire", "ruby and sapphire"],
  ["ex team magma vs team aqua", "team magma vs team aqua"],
  ["ex team rocket returns", "team rocket returns"],
  ["ex unseen forces", "unseen forces"],
  ["expedition", "expedition base set"],
  ["legendary treasures radiant collection", "legendary treasures"],
  ["mcdonald s promos 2012", "mcdonald s collection 2012"],
  ["mcdonalds promos 2012", "mcdonalds collection 2012"],
  ["platinum arceus", "platinum arceus"],
  ["triumpant", "hs triumphant"],
  ["triumphant", "hs triumphant"],
  ["unleashed", "hs unleashed"],
  ["wizards black star promo", "wizards black star promos"],
  ["xy base set", "xy"],
  ["xy breakpoint", "breakpoint"],
  ["xy flashfire", "flashfire"],
  ["xy black star promo", "xy black star promos"],
]);

function normalized(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/pok[eé]mon/gi, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[—–]/g, "-")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function normalizedName(value) {
  return normalized(String(value || "").replace(/\s*\([^)]*\)\s*$/g, "").replace(/[δΔ]/g, " delta "));
}

function normalizedNumber(value) {
  const first = String(value || "").split("/")[0].trim().toUpperCase();
  return first.replace(/^0+(?=\d)/, "");
}

function normalizedSet(value) {
  let text = String(value || "").split("/")[0];
  text = text.replace(/\bjumbo cards?\b/gi, "").replace(/^deck exclusives\s*[—–-]\s*/i, "");
  let result = normalized(text).replace(/^ex (?=(crystal guardians|delta species|deoxys|dragon frontiers|hidden legends|holon phantoms|legend maker|power keepers|ruby and sapphire|team magma vs team aqua|team rocket returns|unseen forces)$)/, "ex ");
  result = aliases.get(result) || result;
  return result;
}

async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": "CardVault/1.0" } });
    if (response.ok) return response.json();
    if (response.status !== 429 && response.status < 500) throw new Error(`Pokemon TCG card data returned ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error(`Pokemon TCG card data remained unavailable: ${url}`);
}

const desiredSets = new Set(collection.cards.map((card) => normalizedSet(card.setName)).filter(Boolean));
const sets = await getJson(`${dataRoot}/sets/en.json`);
const relevantSets = sets.filter((set) => desiredSets.has(normalizedSet(set.name)));
const apiCards = [];
for (let offset = 0; offset < relevantSets.length; offset += 8) {
  const batch = relevantSets.slice(offset, offset + 8);
  const results = await Promise.all(batch.map(async (set) => {
    const cards = await getJson(`${dataRoot}/cards/en/${set.id}.json`);
    return cards.map((card) => ({ ...card, set: { id: set.id, name: set.name } }));
  }));
  apiCards.push(...results.flat());
  console.log(`downloaded ${Math.min(offset + batch.length, relevantSets.length)}/${relevantSets.length} relevant sets`);
}

const index = new Map();
for (const card of apiCards) {
  const key = `${normalizedName(card.name)}|${normalizedNumber(card.number)}`;
  const entries = index.get(key) || [];
  entries.push(card);
  index.set(key, entries);
}

const imageMap = {};
const unmatchedPrintings = new Set();
for (const card of collection.cards) {
  const key = `${normalizedName(card.name)}|${normalizedNumber(card.cardNumber)}`;
  const desiredSet = normalizedSet(card.setName);
  if (!desiredSet || /pending|unresolved|counterfeit|novelty|trading figure/.test(desiredSet)) continue;
  const matches = (index.get(key) || []).filter((candidate) => normalizedSet(candidate.set?.name) === desiredSet);
  if (matches.length === 1 && matches[0].images?.small) {
    imageMap[String(card.masterId)] = matches[0].images.small;
  } else {
    unmatchedPrintings.add(`${card.name} ${card.cardNumber || ""} — ${card.setName || "Unknown set"}`);
  }
}

await fs.writeFile(output, `${JSON.stringify(imageMap, null, 2)}\n`);
console.log(`mapped ${Object.keys(imageMap).length}/${collection.cards.length} physical cards to conservative reference images`);
console.log(`${unmatchedPrintings.size} unique card rows remain unmatched or ambiguous`);
const foundSets = new Set(relevantSets.map((set) => normalizedSet(set.name)));
const unmatchedSets = [...desiredSets].filter((set) => !foundSets.has(set));
if (unmatchedSets.length) console.log(`unmatched set names: ${unmatchedSets.sort().join(", ")}`);
