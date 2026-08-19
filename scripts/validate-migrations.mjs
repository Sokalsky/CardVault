import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const directory = path.resolve("database");
const files = (await fs.readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
assert.ok(files.length >= 2, "Expected ordered SQL migrations");
const database = new PGlite();
await database.exec("create role service_role nologin");

for (const file of files) {
  const sql = await fs.readFile(path.join(directory, file), "utf8");
  assert.doesNotMatch(sql, /\bdrop\s+table\b/i, `${file} contains a destructive DROP TABLE`);
  await database.exec(sql);
  console.log(`applied ${file}`);
}

const expectedTables = [
  "card_printings", "physical_cards", "media_assets", "extracted_frames", "grading_runs",
  "grading_defects", "valuations", "psa_submission_batches", "psa_submission_items", "processing_jobs",
];
const tableResult = await database.query("select tablename from pg_tables where schemaname = 'public'");
const tables = new Set(tableResult.rows.map((row) => row.tablename));
for (const table of expectedTables) assert.ok(tables.has(table), `Missing table ${table}`);

const printing = await database.query(
  "insert into card_printings(name, card_number, set_name, variant) values ('Rayquaza','11/20','Dragon Vault','Regular Holo') returning id",
);
const printingId = printing.rows[0].id;
await database.query("insert into physical_cards(card_printing_id, legacy_master_id, copy_label, copy_number) values ($1, 900001, '1 of 2', 1), ($1, 900002, '2 of 2', 2)", [printingId]);
const copies = await database.query("select count(*)::int as count from physical_cards where card_printing_id = $1", [printingId]);
assert.equal(copies.rows[0].count, 2, "Duplicate physical copies must remain separate rows");
const card = await database.query("select id from physical_cards where legacy_master_id = 900001");
const batch = await database.query("insert into psa_submission_batches(name) values ('Migration validation') returning id");
await database.query("insert into psa_submission_items(batch_id, physical_card_id) values ($1, $2)", [batch.rows[0].id, card.rows[0].id]);
await assert.rejects(
  database.query("insert into psa_submission_items(batch_id, physical_card_id) values ($1, $2)", [batch.rows[0].id, card.rows[0].id]),
  /duplicate key|unique constraint/i,
  "A physical card must not be duplicated within one PSA batch",
);
await assert.rejects(
  database.query("update psa_submission_batches set status = 'invented' where id = $1", [batch.rows[0].id]),
  /check constraint/i,
  "PSA batch statuses must be constrained",
);

const rls = await database.query("select relname, relrowsecurity from pg_class where relname = any($1)", [expectedTables]);
assert.ok(rls.rows.every((row) => row.relrowsecurity), "Every collection table must have RLS enabled for Supabase REST");
const serviceRoleAccess = await database.query(
  "select has_schema_privilege('service_role', 'public', 'usage') as schema_usage, has_table_privilege('service_role', 'physical_cards', 'select') as card_select, has_table_privilege('service_role', 'media_assets', 'insert') as media_insert",
);
assert.deepEqual(
  serviceRoleAccess.rows[0],
  { schema_usage: true, card_select: true, media_insert: true },
  "Supabase service_role must be able to read cards and persist media",
);
await database.close();
console.log(`validated ${files.length} migrations, ${expectedTables.length} tables, RLS, service-role access, copy separation, and submission constraints`);
