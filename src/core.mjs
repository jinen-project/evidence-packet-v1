import { createHash } from 'node:crypto';

export const ROLES = Object.freeze({
  SUPPORTING_EVIDENCE: 'SUPPORTING_EVIDENCE',
  CONFLICTING_EVIDENCE: 'CONFLICTING_EVIDENCE',
  RELATED_BUT_INSUFFICIENT: 'RELATED_BUT_INSUFFICIENT',
  NO_EVIDENCE_FOUND: 'NO_EVIDENCE_FOUND',
  UNRESOLVED: 'UNRESOLVED'
});

const STOP_WORDS = new Set('a an and are as at be by for from has have he in is it its of on or that the to was were will with this these those they them their about into than then also can cannot could should would may might'.split(' '));
const NEGATIVE = /\b(no|not|never|none|neither|false|incorrect|declined|decreased|decrease|below|failed|failure|without|didn't|doesn't|isn't|wasn't|weren't|cannot|can't)\b/i;

export function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
export function normalizeText(value = '') { return String(value).replace(/\r\n?/g, '\n'); }
export function contentFromHtml(html) {
  return normalizeText(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

export function tokenize(text) {
  return [...new Set((text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || []).filter(t => t.length > 2 && !STOP_WORDS.has(t)))];
}

export function decomposeClaims(answerText) {
  const text = normalizeText(answerText).trim();
  const result = [];
  const re = /[^\n.!?]+(?:[.!?]+|$)/g;
  let match;
  while ((match = re.exec(text))) {
    const claim = match[0].trim();
    const leading = match[0].indexOf(claim);
    // A standalone bracketed reference belongs to citation validation, not claim extraction.
    if (claim && /[A-Za-z0-9]/.test(claim) && !/^\[[^\]]+\]$/.test(claim)) {
      const start = match.index + leading;
      result.push({
        claim_id: `CLAIM_${String(result.length + 1).padStart(2, '0')}`,
        claim_text: claim,
        source_location_in_answer: { start_offset: start, end_offset: start + claim.length, line: lineAt(text, start) },
        claim_type: 'ASSERTION',
        provenance: { method: 'LOCAL_HEURISTIC_SENTENCE_DECOMPOSITION', generated: true, review_required: true }
      });
    }
  }
  return result;
}

function lineAt(text, offset) { return text.slice(0, offset).split('\n').length; }

export function splitPassages(source) {
  const text = source.content || '';
  const passages = [];
  const re = /[^\n.!?]+(?:[.!?]+|$)/g;
  let match;
  while ((match = re.exec(text))) {
    const span = match[0].trim(); const lead = match[0].indexOf(span);
    if (span && /[A-Za-z0-9]/.test(span)) passages.push({ text: span, start_offset: match.index + lead, end_offset: match.index + lead + span.length });
  }
  return passages;
}

function overlap(a, b) { const bSet = new Set(b); return a.filter(t => bSet.has(t)); }
function relationFor(claim, passage) {
  const shared = overlap(tokenize(claim.claim_text), tokenize(passage.text));
  if (shared.length >= 2) {
    const oppositePolarity = NEGATIVE.test(claim.claim_text) !== NEGATIVE.test(passage.text);
    return { role: oppositePolarity ? ROLES.CONFLICTING_EVIDENCE : ROLES.SUPPORTING_EVIDENCE, shared };
  }
  if (shared.length === 1) return { role: ROLES.RELATED_BUT_INSUFFICIENT, shared };
  return null;
}

export function findCitationReferences(answerText, sources) {
  const refs = []; const known = new Map();
  for (const source of sources) { known.set(source.source_id.toLowerCase(), source); known.set(source.title.toLowerCase(), source); }
  const re = /\[([^\]\n]+)\]/g; let m;
  while ((m = re.exec(answerText))) {
    const reference = m[1].trim(); const source = known.get(reference.toLowerCase());
    refs.push({ reference, answer_location: { start_offset: m.index, end_offset: m.index + m[0].length }, status: source ? 'CITATION_RESOLVED_TO_SOURCE' : 'CITATION_NOT_RESOLVED', source_id: source?.source_id ?? null });
  }
  return refs;
}

export function validatePacket(packet) {
  const errors = []; const sourceIds = new Set(); const claimIds = new Set(packet.claims.map(c => c.claim_id));
  for (const source of packet.sources) {
    if (sourceIds.has(source.source_id)) errors.push(`duplicate source ID: ${source.source_id}`);
    sourceIds.add(source.source_id);
    if (source.status === 'available' && sha256(source.content) !== source.sha256) errors.push(`source hash mismatch: ${source.source_id}`);
  }
  for (const relation of packet.claim_evidence_relations) {
    if (!claimIds.has(relation.claim_id)) errors.push(`orphan claim reference: ${relation.claim_id}`);
    if (relation.source_id && !sourceIds.has(relation.source_id)) errors.push(`orphan source reference: ${relation.source_id}`);
    if (relation.exact_span && relation.source_id) {
      const source = packet.sources.find(s => s.source_id === relation.source_id);
      const { start_offset: start, end_offset: end } = relation.source_location || {};
      if (!source?.content || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || source.content.slice(start, end) !== relation.exact_span) errors.push(`invalid exact span: ${relation.relation_id}`);
    }
  }
  for (const citation of packet.citation_references || []) {
    if (citation.status === 'CITATION_RESOLVED_TO_SOURCE' && (!citation.source_id || !sourceIds.has(citation.source_id))) errors.push(`orphan resolved citation: ${citation.reference}`);
    if (!['CITATION_RESOLVED_TO_SOURCE', 'CITATION_NOT_RESOLVED'].includes(citation.status)) errors.push(`invalid citation status: ${citation.reference}`);
  }
  return { valid: errors.length === 0, errors };
}

export function buildPacket({ answerText, answerReference = 'inline-answer', sources = [], generatedAt = new Date().toISOString() }) {
  const normalizedAnswer = normalizeText(answerText);
  const preparedSources = sources.map((item, index) => {
    const source_id = item.source_id || `SOURCE_${String(index + 1).padStart(2, '0')}`;
    const content = item.content == null ? null : normalizeText(item.format === 'html' ? contentFromHtml(item.content) : item.content);
    return { source_id, title: item.title || source_id, format: item.format || 'text', status: content == null ? 'missing' : 'available', content, sha256: content == null ? null : sha256(content), provenance: { provided_by_user: true, original_name: item.original_name || item.title || source_id } };
  });
  const claims = decomposeClaims(normalizedAnswer);
  const relations = []; const unresolved = [];
  for (const claim of claims) {
    let found = false;
    for (const source of preparedSources) {
      if (source.status === 'missing') continue;
      for (const passage of splitPassages(source)) {
        const assessment = relationFor(claim, passage);
        if (!assessment) continue;
        found = true;
        relations.push({ relation_id: `REL_${String(relations.length + 1).padStart(3, '0')}`, claim_id: claim.claim_id, source_id: source.source_id, source_title: source.title, source_location: passage, exact_span: passage.text, evidence_role: assessment.role, why_related: `Shared terms: ${assessment.shared.join(', ')}. Relationship is an automated local heuristic assessment; review the quoted passage.`, provenance: { retrieval_method: 'LOCAL_TOKEN_OVERLAP', relation_assessment: 'LOCAL_HEURISTIC', generated: true, source_sha256: source.sha256 } });
      }
    }
    if (!found) {
      relations.push({ relation_id: `REL_${String(relations.length + 1).padStart(3, '0')}`, claim_id: claim.claim_id, source_id: null, source_title: null, source_location: null, exact_span: null, evidence_role: ROLES.NO_EVIDENCE_FOUND, why_related: 'No passage in the provided available sources met the retrieval threshold. This is not a statement that the claim is false.', provenance: { retrieval_method: 'LOCAL_TOKEN_OVERLAP', generated: true } });
    }
  }
  for (const source of preparedSources.filter(s => s.status === 'missing')) unresolved.push({ type: 'MISSING_SOURCE', source_id: source.source_id, message: `Provided source '${source.title}' was unavailable and was not used.` });
  const citations = findCitationReferences(normalizedAnswer, preparedSources);
  for (const citation of citations.filter(c => c.status === 'CITATION_NOT_RESOLVED')) unresolved.push({ type: 'CITATION_NOT_RESOLVED', reference: citation.reference, answer_location: citation.answer_location, message: `Answer citation [${citation.reference}] did not resolve to a provided source ID or title.` });
  const packet = { packet_id: `EP_${sha256(`${normalizedAnswer}\u0000${preparedSources.map(s => `${s.source_id}:${s.sha256}`).join('|')}`).slice(0, 16)}`, schema_version: 'evidence-packet/v1', answer_reference: answerReference, answer: { text: normalizedAnswer, sha256: sha256(normalizedAnswer) }, claims, sources: preparedSources, claim_evidence_relations: relations, citation_references: citations, unresolved_items: unresolved, provenance: { product: 'Evidence Packet', version: '1.0.0', local_first: true, external_requests_made: false, claim_extraction: 'LOCAL_HEURISTIC_SENTENCE_DECOMPOSITION', evidence_retrieval: 'LOCAL_TOKEN_OVERLAP_FROM_PROVIDED_SOURCES', evidence_relation_assessment: 'LOCAL_HEURISTIC', truth_judgment_performed: false }, generated_at: generatedAt };
  packet.validation = validatePacket(packet);
  return packet;
}

export function packetToMarkdown(packet) {
  const lines = [`# Evidence Packet`, '', `- Packet ID: \`${packet.packet_id}\``, `- Generated: ${packet.generated_at}`, `- Answer reference: ${packet.answer_reference}`, `- Answer hash (SHA-256): \`${packet.answer.sha256}\``, '', '## Important boundary', '', 'This packet maps claims to passages in the provided sources. It does not decide whether a claim is globally true or false.', '', '## Sources', ''];
  for (const s of packet.sources) lines.push(`- **${s.source_id} — ${s.title}** (${s.status})${s.sha256 ? ` · SHA-256: \`${s.sha256}\`` : ''}`);
  lines.push('', '## Claims and evidence', '');
  for (const claim of packet.claims) {
    lines.push(`### ${claim.claim_id}`, '', claim.claim_text, '', `Answer location: line ${claim.source_location_in_answer.line}, offsets ${claim.source_location_in_answer.start_offset}–${claim.source_location_in_answer.end_offset}`, '');
    const rels = packet.claim_evidence_relations.filter(r => r.claim_id === claim.claim_id);
    for (const r of rels) {
      lines.push(`- **${r.evidence_role}**${r.source_id ? ` — ${r.source_id}: ${r.source_title}` : ''}`);
      if (r.exact_span) lines.push(`  - Exact source span (offsets ${r.source_location.start_offset}–${r.source_location.end_offset}): “${r.exact_span}”`);
      lines.push(`  - Why related: ${r.why_related}`);
    }
    lines.push('');
  }
  if (packet.unresolved_items.length) { lines.push('## Unresolved items', ''); for (const item of packet.unresolved_items) lines.push(`- **${item.type}**: ${item.message}`); lines.push(''); }
  lines.push('## Provenance', '', '```json', JSON.stringify(packet.provenance, null, 2), '```', '', '## Machine validation', '', `- Valid: **${packet.validation.valid}**`); for (const error of packet.validation.errors) lines.push(`- Error: ${error}`);
  return lines.join('\n');
}
