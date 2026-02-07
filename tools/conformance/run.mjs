import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const POSTGRES_URI = process.env.POSTGRES_URI;
if (!POSTGRES_URI) {
  console.error("Missing $POSTGRES_URI");
  process.exit(2);
}

const ROOT = process.cwd();
const FIXTURES_DIR = path.join(ROOT, "tools", "conformance", "fixtures");
const SQL_DIR = path.join(ROOT, "tools", "conformance", "sql");
const SCHEMA_SQL = fs.readFileSync(path.join(SQL_DIR, "schema.sql"), "utf8");
const GATE_SQL = fs.readFileSync(path.join(SQL_DIR, "publish_gate.sql"), "utf8");
const PUBLISH_TXN_SQL = fs.readFileSync(path.join(SQL_DIR, "publish_txn.sql"), "utf8");

const FIXTURE_FILES = [
  "CT-01.json",
  "CT-02.json",
  "CT-03A.json",
  "CT-03B.json",
  "CT-04.json",
  "CT-05.json",
  "CT-06.json",
  "CT-07.json"
];

function schemaName() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `tmp_conformance_${t}_${r}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

function round6(n) {
  if (n === null || n === undefined) return null;
  return Number(Number(n).toFixed(6));
}

function assertEq(label, got, exp) {
  if (typeof exp === "number") {
    const g = round6(got);
    const e = round6(exp);
    if (g !== e) throw new Error(`${label}: expected ${e} got ${g}`);
    return;
  }
  if (got !== exp) throw new Error(`${label}: expected ${exp} got ${got}`);
}

async function execInSchema(client, schema, sql) {
  await client.query(`SET search_path TO ${schema}, public;`);
  return client.query(sql);
}

async function insertRows(client, table, rows) {
  if (!rows || rows.length === 0) return;

  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");

  for (const row of rows) {
    const vals = cols.map((c) => row[c]);
    const params = vals.map((_, i) => `$${i + 1}`).join(", ");
    const q = `INSERT INTO ${table} (${colList}) VALUES (${params})`;
    await client.query(q, vals);
  }
}

async function runFixture(pool, fixturePath) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const schema = schemaName();

  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema};`);
    await execInSchema(client, schema, SCHEMA_SQL);

    const ledger = fixture.ledger;

    await insertRows(client, "stories", ledger.stories ?? []);
    await insertRows(client, "story_versions", ledger.story_versions ?? []);
    await insertRows(client, "claims", (ledger.claims ?? []).map((c) => ({
      entities: JSON.stringify(c.entities ?? []),
      time_window: JSON.stringify(c.time_window ?? {}),
      jurisdiction: c.jurisdiction ?? null,
      confidence_model: c.confidence_model ?? null,
      confidence_review: c.confidence_review ?? null,
      ...c
    })));
    await insertRows(client, "evidence_objects", (ledger.evidence_objects ?? []).map((e) => ({
      extracted_text: e.extracted_text ?? null,
      provenance: JSON.stringify(e.provenance ?? {}),
      ...e
    })));
    await insertRows(client, "claim_evidence_edges", (ledger.claim_evidence_edges ?? []).map((e) => ({
      reviewer_actor_id: e.reviewer_actor_id ?? null,
      notes: e.notes ?? null,
      ...e
    })));
    await insertRows(client, "corrections", (ledger.corrections ?? []).map((c) => ({
      details: JSON.stringify(c.details ?? {}),
      ...c
    })));

    const P = fixture.policy_pack;
    const req = fixture.request;

    const gateArgs = [
      req.platform_id,
      req.story_id,
      req.story_version_id,
      P.evidence.primary_source_classes,
      P.evidence.independence_key_fields,
      P.claim.high_impact_claim_types,
      P.claim.high_impact_regexes,
      P.publish_gates.min_primary_evidence_ratio,
      P.publish_gates.max_unsupported_claim_share,
      P.publish_gates.max_contradicted_claims,
      P.publish_gates.require_high_impact_corroboration,
      P.publish_gates.high_impact_min_independent_sources
    ];

    const gateRes = await execInSchema(client, schema, { text: GATE_SQL, values: gateArgs });
    if (gateRes.rowCount !== 1) throw new Error(`Gate query returned ${gateRes.rowCount} rows`);

    const row = gateRes.rows[0];
    const exp = fixture.expected;

    assertEq("total_claims", Number(row.total_claims), exp.total_claims);
    assertEq("unsupported_claims", Number(row.unsupported_claims), exp.unsupported_claims);
    assertEq("contradicted_claims", Number(row.contradicted_claims), exp.contradicted_claims);
    assertEq("primary_supported_claims", Number(row.primary_supported_claims), exp.primary_supported_claims);

    assertEq("primary_evidence_ratio", Number(row.primary_evidence_ratio), exp.primary_evidence_ratio);
    assertEq("unsupported_claim_share", Number(row.unsupported_claim_share), exp.unsupported_claim_share);

    assertEq("high_impact_claims", Number(row.high_impact_claims), exp.high_impact_claims);
    assertEq("high_impact_corroborated", Number(row.high_impact_corroborated), exp.high_impact_corroborated);

    assertEq("corroboration_ok", Boolean(row.corroboration_ok), exp.corroboration_ok);
    assertEq("publish_gate_pass", Boolean(row.publish_gate_pass), exp.publish_gate_pass);

    // transactional publish assertions
    const publishArgs = [...gateArgs, P.policy_pack_version];

    if (exp.publish_gate_pass === true) {
      await client.query("BEGIN");
      const pubRes = await execInSchema(client, schema, { text: PUBLISH_TXN_SQL, values: publishArgs });
      await client.query("COMMIT");

      const st = String(pubRes.rows?.[0]?.story_state ?? "");
      const oc = Number(pubRes.rows?.[0]?.outbox_count ?? -1);
      assertEq("publish_txn.story_state", st, "published");
      assertEq("publish_txn.outbox_count", oc, 1);
    } else {
      let failedAsExpected = false;
      await client.query("BEGIN");
      try {
        await execInSchema(client, schema, { text: PUBLISH_TXN_SQL, values: publishArgs });
      } catch (e) {
        failedAsExpected = true;
      } finally {
        await client.query("ROLLBACK");
      }
      if (!failedAsExpected) throw new Error("publish_txn: expected failure but succeeded");

      const check = await execInSchema(
        client,
        schema,
        {
          text: `
            SELECT
              (SELECT state FROM stories WHERE platform_id=$1 AND story_id=$2) AS story_state,
              (SELECT COUNT(*)::int FROM event_outbox WHERE platform_id=$1 AND event_type='story.published.v1') AS outbox_count
          `,
          values: [req.platform_id, req.story_id]
        }
      );

      const st = String(check.rows?.[0]?.story_state ?? "");
      const oc = Number(check.rows?.[0]?.outbox_count ?? -1);

      const expectedInitialState = String((ledger.stories?.[0]?.state ?? "review"));
      assertEq("publish_txn.story_state", st, expectedInitialState);
      assertEq("publish_txn.outbox_count", oc, 0);
    }

    await client.query(`DROP SCHEMA ${schema} CASCADE;`);
    return { fixture_id: fixture.fixture_id, ok: true };
  } catch (err) {
    try { await client.query(`DROP SCHEMA ${schema} CASCADE;`); } catch {}
    return { fixture_id: fixture.fixture_id, ok: false, error: String(err?.message ?? err) };
  } finally {
    client.release();
  }
}

async function main() {
  const pool = new Pool({ connectionString: POSTGRES_URI });

  let failed = 0;
  for (const f of FIXTURE_FILES) {
    const fp = path.join(FIXTURES_DIR, f);
    const r = await runFixture(pool, fp);
    if (!r.ok) {
      failed += 1;
      console.error(`[FAIL] ${r.fixture_id}: ${r.error}`);
    } else {
      console.log(`[OK] ${r.fixture_id}`);
    }
  }

  await pool.end();

  if (failed > 0) process.exit(1);
  console.log("All conformance tests passed.");
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
