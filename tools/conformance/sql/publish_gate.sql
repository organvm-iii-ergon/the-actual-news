WITH
story_row AS (
  SELECT s.story_id, s.platform_id, s.state
  FROM stories s
  WHERE s.platform_id = $1 AND s.story_id = $2
  LIMIT 1
),
claim_base AS (
  SELECT c.claim_id, c.claim_type, c.text, c.support_status
  FROM claims c
  WHERE c.story_id = $2 AND c.story_version_id = $3
),
edges_support AS (
  SELECT e.claim_id, e.evidence_id_hash
  FROM claim_evidence_edges e
  WHERE e.claim_id IN (SELECT claim_id FROM claim_base)
    AND e.relation = 'supports'
),
evidence_enriched AS (
  SELECT
    eo.evidence_id_hash,
    eo.blob_uri,
    eo.provenance,
    (eo.provenance->>'source_class') AS source_class,
    CASE
      WHEN array_position($5, 'source') IS NOT NULL AND NULLIF(eo.provenance->>'source','') IS NOT NULL THEN eo.provenance->>'source'
      WHEN array_position($5, 'publisher') IS NOT NULL AND NULLIF(eo.provenance->>'publisher','') IS NOT NULL THEN eo.provenance->>'publisher'
      WHEN array_position($5, 'url') IS NOT NULL AND NULLIF(eo.provenance->>'url','') IS NOT NULL THEN eo.provenance->>'url'
      WHEN array_position($5, 'blob_uri') IS NOT NULL AND NULLIF(eo.blob_uri,'') IS NOT NULL THEN eo.blob_uri
      ELSE eo.blob_uri
    END AS independence_key
  FROM evidence_objects eo
  WHERE eo.evidence_id_hash IN (SELECT evidence_id_hash FROM edges_support)
),
primary_supported_claims AS (
  SELECT DISTINCT es.claim_id
  FROM edges_support es
  JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
  WHERE ev.source_class = ANY($4)
),
totals AS (
  SELECT
    (SELECT COUNT(*) FROM claim_base) AS total_claims,
    (SELECT COUNT(*) FROM claim_base WHERE support_status = 'unsupported') AS unsupported_claims,
    (SELECT COUNT(*) FROM claim_base WHERE support_status = 'contradicted') AS contradicted_claims,
    (SELECT COUNT(*) FROM primary_supported_claims) AS primary_supported_claims
),
high_impact_claims AS (
  SELECT cb.claim_id
  FROM claim_base cb
  WHERE
    cb.claim_type = ANY($6)
    OR EXISTS (
      SELECT 1
      FROM unnest($7) r
      WHERE cb.text ~* r
    )
),
high_impact_support_counts AS (
  SELECT
    hic.claim_id,
    COUNT(DISTINCT ev.independence_key) AS independent_support_sources
  FROM high_impact_claims hic
  LEFT JOIN edges_support es ON es.claim_id = hic.claim_id
  LEFT JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
  GROUP BY hic.claim_id
),
high_impact_rollup AS (
  SELECT
    (SELECT COUNT(*) FROM high_impact_claims) AS high_impact_claims,
    (SELECT COUNT(*) FROM high_impact_support_counts WHERE independent_support_sources >= $12) AS high_impact_corroborated
),
metrics AS (
  SELECT
    t.total_claims,
    t.unsupported_claims,
    t.contradicted_claims,
    t.primary_supported_claims,
    CASE WHEN t.total_claims = 0 THEN 0 ELSE (t.primary_supported_claims::float8 / t.total_claims::float8) END AS primary_evidence_ratio,
    CASE WHEN t.total_claims = 0 THEN 1 ELSE (t.unsupported_claims::float8 / t.total_claims::float8) END AS unsupported_claim_share,
    hr.high_impact_claims,
    hr.high_impact_corroborated,
    CASE WHEN hr.high_impact_claims = 0 THEN true ELSE (hr.high_impact_corroborated = hr.high_impact_claims) END AS corroboration_ok
  FROM totals t
  CROSS JOIN high_impact_rollup hr
)
SELECT
  sr.story_id,
  sr.platform_id,
  sr.state,
  m.*,
  (
    m.total_claims > 0
    AND m.contradicted_claims <= $10
    AND m.primary_evidence_ratio >= $8
    AND m.unsupported_claim_share <= $9
    AND (CASE WHEN $11 THEN m.corroboration_ok ELSE true END)
  ) AS publish_gate_pass
FROM story_row sr
CROSS JOIN metrics m;
