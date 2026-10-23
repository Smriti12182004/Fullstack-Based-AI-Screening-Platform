# Evalyn Licensing Audit Runbook

**Status:** First-pass review; local inventories and container SBOM still need to be generated and inspected  
**For:** Windows PowerShell, with the repository's existing `.venv`

This runbook applies the hands-on workflow in the VCreaTek software-licensing guide to Evalyn. It is an engineering checklist, not legal advice or a release approval.

## The two questions for every component

1. **What are we allowed to do with it?**
2. **What do we owe in return?** This may include a copyright notice, a copy of the licence, publication of changes or source, a fee, or a restriction on particular uses.

The guide's most important operational warning is that a public GitHub repository is not automatically licensed for reuse. The root project licence remains unselected until the rights holder and permission to release are established.

## Project-specific facts confirmed from the repository

- The root README links to [LICENSING.md](LICENSING.md) and [THIRD_PARTY_LICENSE_REVIEW.md](THIRD_PARTY_LICENSE_REVIEW.md).
- `frontend/package-lock.json` has 140 dependency package-path entries with declared licence metadata; the first-pass distribution is recorded in the third-party review. This is lockfile metadata, not a full installed-tree audit.
- `backend/requirements.txt` pins 60 packages and `backend/requirements-queue.txt` lists `rq` and `redis`.
- `backend/Dockerfile` starts from `python:3.12-slim`, installs the OS package `libgomp1`, installs the Python requirements and CPU-only PyTorch, and copies the backend into the image. That image therefore needs an inventory of OS and language packages, not just a review of Evalyn's own source.
- The reviewed configuration names Gemini and Ollama model defaults. The exact embedding-model identifier and revision still need to be located and recorded.

## Step 1 — Capture the installed JavaScript dependency inventory

Run from the repository root in PowerShell. Reports are written outside the repository so they are not accidentally staged.

```powershell
$audit = Join-Path $env:TEMP "evalyn-licensing-audit"
New-Item -ItemType Directory -Force -Path $audit | Out-Null

# Run from the frontend so the scanner reads this project's installed modules.
Push-Location .\frontend
npx --yes license-checker --production --json --out "$audit\frontend-production.json"
npx --yes license-checker --json --out "$audit\frontend-all.json"
Pop-Location
```

The first report is for production dependencies; the second includes development dependencies as well. `npx` may download the audit utility into npm's cache, but these commands do not add it to `package.json`.

If the frontend dependency tree is not installed, run `npm ci` from `frontend` first. It reinstalls the exact versions resolved by `package-lock.json`; it should not update that lockfile.

## Step 1A — Copy the actual licence/notice files from the installed trees

After the frontend dependencies are installed and the intended backend `.venv` is activated, run the repository's collector:

```powershell
python .\scripts\collect_third_party_license_files.py
```

It copies the original matching `LICENSE`, `LICENCE`, `NOTICE`, `COPYING`, `COPYRIGHT`, and related files already present in `frontend/node_modules` and the active Python environment into `third_party_licenses/generated/`. It creates a Markdown index and a JSON manifest. Package names and relative package paths are recorded instead of the local machine's absolute source paths.

The collector does **not** download missing upstream files and does not fabricate replacements. A package may expose its licence in metadata without shipping a matching file, or may store notices somewhere unusual. Those entries are flagged for manual review. Run it with the environment that matches the version you intend to release.

The generated folder is an audit artefact: review every copied text and the index before committing. If it already exists, inspect it before moving or removing that generated folder and rerunning the collector. The script intentionally refuses to overwrite it automatically.

## Step 2 — Capture the installed Python dependency inventory

Ensure the project's `.venv` is activated. The following installs the reporting utility only into the active virtual environment; it does not add the utility to `requirements.txt`.

```powershell
python -m pip install pip-licenses
pip-licenses --format=json --output-file "$audit\backend-python.json"
pip-licenses --format=table
```

This reports packages installed in the currently active Python environment, so note whether it contains test/development packages as well as runtime packages. Use the environment that matches the deployment for the release inventory. The pinned requirements files are useful evidence, but they are not a substitute for the resolved installed tree.

For packages that need closer inspection, `pip-licenses` supports including the contents of licence and NOTICE files in JSON output. Treat those as review material: inspect the actual upstream terms and notices rather than approving a component solely from a short metadata label.

## Step 3 — Review the known risk terms

Once the reports exist, search for licence labels that require closer review. This is a triage step, not an automatic verdict: exact text, version, usage and distribution model matter.

```powershell
Select-String -Path "$audit\frontend-production.json", "$audit\frontend-all.json", "$audit\backend-python.json" -Pattern "AGPL|SSPL|BUSL|Elastic|GPL|Unknown|NOASSERTION|LicenseRef"
```

The guide's families are:

| Family | Practical interpretation from the guide |
| --- | --- |
| Permissive — MIT, BSD, Apache-2.0 | Usually allows inclusion in closed/commercial software; preserve required notices. Apache-2.0 has additional patent terms. |
| Weak copyleft — MPL, LGPL | Conditions can apply to changes to covered files or how a library is linked; review the exact licence. |
| Strong copyleft — GPL | Distribution is the key trigger; obligations depend on how the software is combined and conveyed. |
| Network copyleft — AGPL | Network interaction can trigger source-related conditions; review the actual licence and the architecture carefully. |
| Source available — SSPL, BUSL, Elastic and some company licences | Being able to read the source does not make the licence OSI-approved open source; use restrictions can be material. |
| Proprietary | Contract terms govern the permission granted. |

Do not auto-reject every GPL package: internal use without distribution is different from shipping software. Do not treat AGPL as interchangeable with GPL. Likewise, do not label a package open source based only on a vendor marketing page.

## Step 4 — Inventory the backend container

The container build is a separate distribution surface. The Dockerfile uses `python:3.12-slim` and installs `libgomp1`, the Python dependency tree, and CPU-only PyTorch. Scanning just the requirements files will not inventory the base image's OS packages.

First inspect whether the previously used local image tag exists:

```powershell
docker image inspect evalyn-api:local
```

If it exists and Syft is installed, generate an SPDX JSON inventory:

```powershell
syft evalyn-api:local -o "spdx-json=$audit\evalyn-api-image.spdx.json"
```

If the image is absent, the build context for this Dockerfile is the `backend` folder, so the root-level build command is:

```powershell
docker build -t evalyn-api:local .\backend
```

**Warning:** the earlier local image build was reported to be about 9.81 GB. Rebuilding can be expensive in disk space and time; check available disk space and only rebuild when needed. Syft is a separate tool and may need to be installed first. Review the generated SBOM for OS packages, Python packages, missing licence expressions, and components whose notices must be preserved.

An SBOM is an inventory, not a legal approval and not a vulnerability scan. Re-run it against the exact image that will actually be distributed. Rebuilding on a moving base-image tag can change the package inventory even if application source does not change.

## Step 5 — Audit AI/model and non-code assets

Do not assume the application's source licence covers model weights, external APIs, fonts, logos, icons, sample data, or third-party documents.

- Record the exact Gemini API/service terms for the actual integration; do not include API credentials in a report or commit.
- Record the exact Ollama model tag, digest, source and applicable model licence. A quantized model file may have an upstream model licence and additional distributor-specific conditions.
- Search the actual code/configuration for the embedding-model identifier, then record the exact repository URL, revision/digest, model card and licence. Do not infer model terms from the Python package that loads it.
- Inspect font and icon licence files and preserve copyright/NOTICE text as required.
- Check copied snippets, generated code, images, and brand assets independently.

## Step 6 — Decide what may be committed

Keep raw inventories in the temporary audit folder while reviewing them. Before committing a report, check that it contains no tokens, environment values, private package URLs, personal filesystem details, or unrelated proprietary materials. A reviewed SPDX SBOM and a third-party notices file can be kept with a release when appropriate.

Do not add a root `LICENSE` until the rights holder is confirmed, any applicable internship/client/employment IP terms are understood, and the intended release licence has been authorised. If the rights holder has not approved an open-source grant, continue with an internal audit and ask for approval rather than guessing.

## Definition of done for this audit

- [ ] Frontend production and full dependency reports generated and reviewed.
- [ ] Python inventory generated from the matching runtime environment and reviewed.
- [ ] Dangerous/unknown licence labels investigated against the actual licence text.
- [ ] SBOM generated from the exact container image planned for distribution, or container distribution explicitly marked out of scope.
- [ ] Exact AI model identifiers and service/model terms recorded.
- [ ] Required notices for bundled fonts, icons and other assets located.
- [ ] Ownership and release authority confirmed before adding the root project licence.
