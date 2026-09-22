# Evidence Packet v1

> Evidence Packet turns an AI-generated answer and a set of source documents into a claim-by-claim evidence map.
>
> It shows which passages support a claim, which conflict with it, where the evidence is insufficient, and what remains unresolved. It does not decide truth for you. It makes the evidence inspectable.

Evidence Packet is free, local-first software. It accepts an answer and only the sources you provide; it does not search the web, add sources, or send content to an external service.

## Run it

Requires Node.js 20 or newer. There are no runtime dependencies.

```sh
git clone <your-clone-url> evidence-packet
cd evidence-packet
npm install
npm start
```

Open `http://127.0.0.1:4177`, paste an answer, select `.txt`, `.md`, `.html`, or `.htm` source files, then generate the packet. The one-screen interface shows claims, exact source spans and offsets, evidence relationships, and unresolved items. It can download JSON and Markdown.

For a command-line run:

```sh
npm run demo
node src/cli.mjs generate --answer sample/answer.txt --source Participants:sample/sources/participants.txt --source Results:sample/sources/results.md --source Study:sample/sources/study-material.txt --out out/manual
```

The CLI writes `evidence-packet.json` and `evidence-packet.md` to `--out`.

## What it produces

A packet contains `PACKET_ID`, answer reference and hash, decomposed claims, supplied sources and hashes, claim-to-evidence relations, unresolved items, citations that could not be resolved, generation time, and provenance. Every evidence relation with a passage contains the exact quoted span plus character offsets. The built-in validation verifies IDs, source hashes, span offsets and orphan references.

Claim extraction, retrieval, and relation assessment are intentionally separate stages. v1 uses a local, deterministic sentence decomposition and token-overlap relationship heuristic; its generated nature and review requirement remain in packet provenance. This keeps the product usable with no model or API key. A future local or user-selected model adapter may replace those stages, but it must preserve the same packet schema and machine checks.

## Evidence roles

- `SUPPORTING_EVIDENCE`: an automatically retrieved passage whose wording aligns with the claim.
- `CONFLICTING_EVIDENCE`: an automatically retrieved passage whose wording has opposing negation/polarity.
- `RELATED_BUT_INSUFFICIENT`: a passage shares limited context but does not establish the claim.
- `NO_EVIDENCE_FOUND`: no available provided-source passage reached the retrieval threshold.
- `UNRESOLVED`: an input or reference issue requiring review.

Roles are relationships of an evidence passage, a claim, and this packet—not permanent properties of a source. Multiple roles, including conflict, are retained. No evidence is never converted to “false,” and evidence is never converted to globally “true.”

## Demo

`npm run demo` processes the included public synthetic material through the real product path; the output is not a hand-written fixture. It has four claims: a supported enrollment claim, a conflicting treatment-result claim, a related-but-insufficient study claim, and a no-evidence bridge claim. It also includes an unresolved answer citation.

## Explicit non-claims

Evidence Packet is **not**:

- a universal truth verifier;
- a legal fact-check guarantee;
- proof that supplied sources are themselves correct;
- proof that every relevant source was provided; or
- proof that an AI claim is globally true or false.

It answers: “Given these sources, what evidence relationship currently exists for each claim?”

## Boundaries and privacy

v1 supports `.txt`, `.md`, `.html`, and `.htm` text extraction. It does not support PDFs, web search, browsing, RAG, automatic citation generation, billing, paywalls, accounts, or enterprise features. The local server binds to `127.0.0.1`; it makes no network requests. Avoid putting untrusted HTML in a browser that you do not control—the file is read locally and reduced to text on the server.

## Verification and publication readiness

```sh
npm test
npm run demo
npm run secrets:scan
```

The repository contains no credentials, personal data, or private evidence. Included samples are synthetic and public-release safe. Before publishing, replace the placeholder clone URL above with the repository URL.
