# Third-Party Licence Review

**Review date:** 23 October 2026  
**Status:** Initial inventory only — compliance review is not complete

This document records an initial review of dependency and model identifiers found in the current repository. The package licence labels below are metadata declared by the lockfile; this is not a substitute for checking the actual licence text distributed with each package or reviewing the full dependency tree for legal compatibility.

## 1. Frontend dependency metadata

Source: `frontend/package-lock.json` (lockfile version 3; GitHub blob SHA `b7eae4d5d8ee274b517705db207a441e3cccb92d`).

The lockfile contains **140 dependency package entries**, including platform-specific optional packages. Every entry inspected had a declared `license` field.

| Declared licence field | Package entries |
| --- | ---: |
| MIT | 108 |
| MPL-2.0 | 24 |
| OFL-1.1 | 3 |
| ISC | 3 |
| Apache-2.0 | 1 |
| BSD-3-Clause | 1 |
| **Total** | **140** |

These counts are package-path entries, not 140 distinct upstream projects. Optional platform binaries and multiple versions can appear as separate entries.

### Items that need explicit notice review

- **Font files:** `@fontsource/dm-serif-display@5.3.0`, `@fontsource/inter@5.3.0`, and `@fontsource/manrope@5.3.0` declare **OFL-1.1** in the lockfile. Confirm the actual font licence and copyright text included in the installed packages and preserve the relevant notices and any applicable font-specific conditions when redistributing fonts.
- **Icons:** `lucide-react@1.47.0` declares **ISC**. Preserve the package's actual copyright and licence notice wherever its distribution requires it.
- **Lightning CSS:** the lockfile has **24 MPL-2.0 entries** for `lightningcss@1.32.0`, `lightningcss@1.33.0`, and platform-specific variants. These entries appear in the Tailwind/Vite build toolchain, but confirm the actual production artefact and dependency path before concluding they are build-only. Preserve upstream notices, and review Mozilla Public License obligations if covered source files are modified or distributed.

The rest of the package inventory reports MIT, Apache-2.0, BSD-3-Clause, or ISC metadata. The licence text and copyright notices still need checking against the actual package contents, and any generated or bundled distribution should be reviewed.

## 2. Python backend dependencies — not audited yet

The backend requirements files list **60 entries** in `backend/requirements.txt` and repeat `rq` and `redis` in `backend/requirements-queue.txt`. This is a pinned dependency list, not yet a verified licence inventory.

The next step is to capture the actual installed Python environment and copy the original licence/notice files from it. The collector at `scripts/collect_third_party_license_files.py` copies matching files from installed npm and Python distributions into a generated inventory. By default it includes the complete active Python environment so indirect packages and packages installed separately from the requirements file (including explicitly installed container packages) are not silently skipped. The [licensing audit runbook](LICENSE_AUDIT_RUNBOOK.md) also includes `pip-licenses` commands for a second metadata report with package URLs and available licence/NOTICE text. The copied files and reports still need human review of exact terms, required notices, and non-permissive or custom conditions.

## 3. AI model and hosted-service terms — separate from source-code licensing

The backend configuration currently names these defaults:

| Identifier | What needs review |
| --- | --- |
| `gemini-3.8-flash` | This is a hosted model/API, not a package licence for Evalyn's source. Review the applicable Gemini API or Google Cloud terms for the actual integration and deployment region. Do not include API credentials in the repository. |
| `llama3.2:3b` | This refers to a Llama 3.2 family model served through Ollama. Meta's Llama 3.2 Community License is a separate set of model terms, not an MIT/Apache software licence. Confirm the exact model tag/digest, its source and quantization, the applicable terms, and whether any weights are distributed with Evalyn. If distributing Llama materials or a product containing them, check the agreement's notices and attribution conditions. |
| Embedding model — exact identifier not yet verified | `backend/requirements.txt` includes `sentence-transformers` and `faiss-cpu`, but the runtime model identifier was not confirmed from the configuration and service files reviewed so far. Locate the exact model name, revision/digest, source, model card and licence before release; do not infer the model licence from the Python package licence. |

Authoritative starting points, checked on the review date:

- [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) — Google states that Gemini API use is subject to the Google API Terms and the additional Gemini API terms.
- [Meta Llama 3.2 Community License text](https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct/blob/main/LICENSE.txt) and [Meta's Llama model downloads page](https://ai.meta.com/resources/models-and-libraries/llama-downloads/).
- The [Sentence Transformers model catalogue](https://huggingface.co/sentence-transformers) is a starting point only after the exact identifier loaded by the application has been established.

These links are review starting points, not a complete verification of the exact files or tags deployed in every environment. The configuration reviewed names the Llama and Gemini defaults, but the exact embedding model remains unconfirmed. Terms can differ between hosted APIs, downloadable weights, quantized variants, and redistribution.

## 4. Container and distribution surface — pending

The checked-in `backend/Dockerfile` starts from `python:3.12-slim`, installs the OS package `libgomp1`, installs the requirements and CPU-only PyTorch, and copies the backend into the image. If the image is distributed, its inventory must include the base image's operating-system packages as well as the Python packages. The source manifests alone do not establish what is in the final image, especially when a base-image tag or resolved dependencies change.

Generate an SBOM against the exact locally built or published image with the Syft command in [the licensing audit runbook](LICENSE_AUDIT_RUNBOOK.md). The image's SBOM and licence notices still need to be inspected; an SBOM by itself is not a legal approval.

## 5. Other material and delivery checks — pending

Review separately before a release:

- Evalyn logo, screenshots, illustrations, fonts, icons, sample documents, test fixtures, and any external text or datasets.
- Container base image and operating-system package notices if distributing images.
- Redis, PostgreSQL/Supabase, storage, email, deployment and other hosted-service terms. Service terms are separate from SDK/source licences.
- Any AI-generated or copied code and any internship, employment, client, university, or contributor agreement that controls ownership or publication.
- The final built frontend and backend/container distribution, not just the source repository.

## Outcome

The frontend lockfile has been inventoried at the metadata level. The collector script is in the repository and is designed to copy original licence/notice files from the installed `node_modules` and active Python environment, add the package URL to the index, and compose a root `THIRD_PARTY_NOTICES.txt` from only the copied licence/notice bodies. It has not yet been run against the user's local dependency installations, so the actual collected files and notices are not yet present in GitHub. **This is not yet a complete third-party compliance clearance.** The installed JavaScript and Python reports and final container SBOM are still pending. Exact model artefacts, bundled font/icon notices, other project assets, and deployment/distribution paths still require review. No root project licence should be added until the rights holder and release authority are confirmed and the chosen licence is approved.
