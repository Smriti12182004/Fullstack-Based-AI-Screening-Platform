# Software Licensing Review

**Status:** Open — no project licence has been selected  
**Reviewed:** 23 October 2026

This document records the current licensing status and the checks required before a licence is selected. It is project documentation, not legal advice and not a licence grant.

## Current repository status

- The repository does not currently contain a root-level `LICENSE` file.
- A public repository is not, by itself, permission to reuse, modify, redistribute, or commercialise its code.
- The project must not be described as MIT-, Apache-, GPL-, or otherwise open-source-licensed until the rights holder has approved the release terms and the appropriate licence is added.

## 1. Confirm ownership and permission first

**This is the blocking decision before adding a licence.**

Before releasing the source under an open-source licence:

- Confirm who owns the application code and who has authority to license it.
- Review any relevant employment, internship, contractor, university, or client agreement and IP policy. Code created during an engagement may belong to the organisation or client, depending on the agreement and applicable law.
- Obtain written approval from the rights holder for the intended public release and licence. Do not infer that being the main developer automatically gives you the right to grant a licence.
- Confirm that contributors' work, AI-assisted/generated code, copied snippets, logos, screenshots, fonts, icons, and other bundled assets may be included.
- Distinguish an assignment of ownership from a licence to use the work. They are different arrangements.

## 2. Licence-selection options after approval

The final choice depends on the rights holder's goals:

| Option | When it may fit | Important consideration |
| --- | --- | --- |
| **MIT** | A simple, permissive licence for a project intended for broad reuse, including commercial reuse | Recipients must retain the copyright and permission notice. It does not grant rights to unrelated third-party assets, model weights, services, or trademarks. |
| **Apache-2.0** | A permissive licence where an express patent grant is useful | Keep the licence text and comply with applicable attribution and NOTICE requirements. |
| **GPL-3.0** | The rights holder intentionally wants distributed derivative works to remain under copyleft terms | Distribution and corresponding-source obligations need to be understood before choosing it. |
| **AGPL-3.0** | The rights holder intentionally wants copyleft obligations to reach network-service use as provided by the licence | Network use can trigger source-offer obligations even when users do not receive a copy of the software. |
| **Proprietary terms or no public grant** | The rights holder wants to retain control or has not approved open-source release | Use terms approved by the actual rights holder; do not add a personal copyright notice or permissive licence without authority. |

**Provisional direction:** if the authorised rights holder wants a straightforward permissive portfolio/project licence, evaluate MIT first. Consider Apache-2.0 if an explicit patent grant is important. This is a recommendation to evaluate, not a licence selection. No root licence is added in this review because ownership and release authority have not been established from the repository alone.

## 3. Third-party components are separate

A licence for Evalyn's own source does not automatically license every item distributed with it. Check the exact versions used, including transitive dependencies and packaged assets.

Review at least:

- **Python:** `backend/requirements.txt` and `backend/requirements-queue.txt`, including their dependency trees.
- **JavaScript:** `frontend/package.json` and `frontend/package-lock.json`, including transitive packages.
- **Fonts, icons, logos, images, sample documents, and data:** each may have its own terms. A root project licence does not override those terms.
- **AI models and embeddings:** model weights have their own terms and are not automatically covered by the application's source-code licence. Check the specific Ollama model tags and embedding models used at runtime.
- **Hosted services and APIs:** review the applicable service terms separately. An SDK licence is not the same as permission to use a hosted service or redistribute model weights.
- **Container base images and packaged tools:** review their notices and redistribution terms if container images are published.

Do not assume that a component is open source just because its source or weights are downloadable. Check the actual licence for the exact version being used, especially for AGPL, SSPL, BUSL, or vendor-specific terms.

## 4. Release checklist

Before declaring a licence or publishing a release:

- [ ] Confirm the rights holder and obtain written permission for the intended release.
- [ ] Decide whether the project should be permissive open source, copyleft, or proprietary.
- [ ] Add the approved root `LICENSE` with the correct rights holder and year.
- [ ] Complete the verified dependency licence report for pinned Python and JavaScript dependencies, including transitive dependencies; the initial frontend lockfile metadata inventory is in [THIRD_PARTY_LICENSE_REVIEW.md](THIRD_PARTY_LICENSE_REVIEW.md).
- [ ] Review and preserve required third-party copyright notices and `NOTICE` files.
- [ ] Check logos, fonts, icons, images, datasets, sample documents, model weights, and AI/service terms separately.
- [ ] Add a third-party notices/SBOM artefact when the dependency review is complete.
- [ ] Recheck the licence when dependencies or model versions change.

## Review result

| Item | Current result |
| --- | --- |
| Root project licence | Not present |
| Ownership / release approval | Not verified in repository files |
| Dependency licence audit | Partial: frontend lockfile licence metadata inventoried; Python dependencies, upstream notice text, bundled assets, exact model artefacts, and distribution paths remain to be verified |
| Third-party notices / SBOM | Not yet recorded here |

The initial frontend inventory is recorded in [THIRD_PARTY_LICENSE_REVIEW.md](THIRD_PARTY_LICENSE_REVIEW.md). The next step is to confirm ownership and release permission, then complete the Python/dependency, model and asset review. Only after the rights holder approves the release terms should the chosen root licence be added.
