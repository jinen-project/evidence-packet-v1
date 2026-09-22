import test from 'node:test'; import assert from 'node:assert/strict';
import { buildPacket, packetToMarkdown, sha256, validatePacket, ROLES } from '../src/core.mjs';
const sources = [
  { source_id: 'SOURCE_01', title: 'Enrollment', content: 'The trial enrolled 120 participants.' },
  { source_id: 'SOURCE_02', title: 'Results', content: 'The treatment did not reduce symptoms by 30%.' },
  { source_id: 'SOURCE_03', title: 'Study material', content: 'Study documentation describes symptom diaries.' }
];
const answer = 'The trial enrolled 120 participants. The treatment reduced symptoms by 30%. The study was evaluated. The coastal bridge opens in April. [Missing Reference]';
function packet(){return buildPacket({answerText:answer,sources,generatedAt:'2026-01-01T00:00:00.000Z'});}
test('claim IDs are stable within a packet',()=>{assert.deepEqual(packet().claims.map(x=>x.claim_id),packet().claims.map(x=>x.claim_id));});
test('source hashing is retained and correct',()=>{assert.equal(packet().sources[0].sha256,sha256(sources[0].content));});
test('every quoted evidence span has valid offsets',()=>{assert.equal(validatePacket(packet()).valid,true);});
test('invalid citation reference is detected',()=>{assert.equal(packet().citation_references[0].status,'CITATION_NOT_RESOLVED');});
test('provided source citations resolve without being trusted as evidence',()=>{const p=buildPacket({answerText:'The trial enrolled 120 participants. [Enrollment]',sources});assert.equal(p.citation_references[0].status,'CITATION_RESOLVED_TO_SOURCE');assert.equal(p.citation_references[0].source_id,'SOURCE_01');});
test('orphan resolved citations fail machine validation',()=>{const p=packet();p.citation_references=[{reference:'bad',status:'CITATION_RESOLVED_TO_SOURCE',source_id:'GONE'}];assert.match(validatePacket(p).errors[0],/orphan resolved citation/);});
test('missing source is retained as unresolved',()=>{const p=buildPacket({answerText:'A claim.',sources:[{source_id:'SOURCE_01',title:'Lost',content:null}]});assert.equal(p.sources[0].status,'missing');assert.equal(p.unresolved_items[0].type,'MISSING_SOURCE');});
test('multiple evidence roles coexist',()=>{const roles=new Set(packet().claim_evidence_relations.map(x=>x.evidence_role));assert(roles.has(ROLES.SUPPORTING_EVIDENCE));assert(roles.has(ROLES.CONFLICTING_EVIDENCE));assert(roles.has(ROLES.RELATED_BUT_INSUFFICIENT));assert(roles.has(ROLES.NO_EVIDENCE_FOUND));});
test('conflicting evidence is retained',()=>{assert(packet().claim_evidence_relations.some(x=>x.evidence_role===ROLES.CONFLICTING_EVIDENCE));});
test('no evidence does not become false',()=>{const r=packet().claim_evidence_relations.find(x=>x.claim_id==='CLAIM_04');assert.equal(r.evidence_role,ROLES.NO_EVIDENCE_FOUND);assert.equal('truth' in r,false);});
test('evidence found does not become globally true',()=>{const p=packet();assert.equal(p.provenance.truth_judgment_performed,false);assert.equal('truth' in p,false);});
test('provenance is retained',()=>{assert.equal(packet().provenance.external_requests_made,false);});
test('JSON export is valid',()=>{assert.doesNotThrow(()=>JSON.parse(JSON.stringify(packet())));});
test('Markdown export is complete',()=>{const md=packetToMarkdown(packet());assert.match(md,/## Claims and evidence/);assert.match(md,/CLAIM_01/);assert.match(md,/## Provenance/);});
