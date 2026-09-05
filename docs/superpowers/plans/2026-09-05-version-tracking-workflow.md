# Version Tracking Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize CatchAndRun at version `1.1.0` and enforce a mandatory version/tracker checkpoint before future feature or bug-fix implementation.

**Architecture:** The root `package.json` is the canonical active version. A dependency-free Node.js validator checks every workspace, lockfile entry, and changelog section; an always-applied Cursor rule invokes a project skill that reports the current version and blocks implementation until the user approves tracking the change.

**Tech Stack:** Node.js ESM, npm workspaces, Markdown, Cursor project skills/rules, GitHub Actions.

## Global Constraints

- Current development version is exactly `1.1.0`.
- Root `package.json` is the canonical active version.
- Client, server, shared, and `package-lock.json` must match the canonical version.
- `CHANGELOG.md` is the canonical change tracker and must contain `[Unreleased]`.
- `RELEASENOTE.md` remains historical release documentation, not an active version source.
- Feature and bug-fix implementation must stop for explicit user approval after reporting version and tracker status.
- Do not create a Git tag, GitHub release, commit, or push.
- Known test baseline is 76 passing and 10 failing tests; this task must introduce no additional failures.

---

### Task 1: Add deterministic version validation

**Files:**
- Create: `tools/check-version.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: root npm workspaces, package manifests, `package-lock.json`, and `CHANGELOG.md`.
- Produces: `npm run version:check`, exiting `0` on consistency and `1` with actionable diagnostics on drift.

- [ ] **Step 1: Create the dependency-free validator**

Create `tools/check-version.mjs`:

```javascript
#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

async function readJson(relativePath) {
  const contents = await readFile(path.join(rootDir, relativePath), "utf8");
  return JSON.parse(contents);
}

const rootPackage = await readJson("package.json");
const canonicalVersion = rootPackage.version;
const workspaces = Array.isArray(rootPackage.workspaces) ? rootPackage.workspaces : [];
const errors = [];

function expectVersion(label, actual) {
  if (actual !== canonicalVersion) {
    errors.push(`${label}: expected ${canonicalVersion}, found ${actual ?? "missing"}`);
  }
}

for (const workspace of workspaces) {
  const workspacePackage = await readJson(`${workspace}/package.json`);
  expectVersion(`${workspace}/package.json`, workspacePackage.version);
}

const lockfile = await readJson("package-lock.json");
expectVersion("package-lock.json top-level version", lockfile.version);
expectVersion('package-lock.json packages[""]', lockfile.packages?.[""]?.version);

for (const workspace of workspaces) {
  expectVersion(
    `package-lock.json packages["${workspace}"]`,
    lockfile.packages?.[workspace]?.version,
  );
}

const changelog = await readFile(path.join(rootDir, "CHANGELOG.md"), "utf8");
if (!/^## \[Unreleased\]/m.test(changelog)) {
  errors.push("CHANGELOG.md: missing [Unreleased] section");
}

const escapedVersion = canonicalVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const currentVersionHeading = new RegExp(`^## \\[${escapedVersion}\\]`, "m");
if (!currentVersionHeading.test(changelog)) {
  errors.push(`CHANGELOG.md: missing [${canonicalVersion}] section`);
}

if (errors.length > 0) {
  console.error(`Version check failed (canonical: v${canonicalVersion}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Version check passed: v${canonicalVersion}`);
}
```

- [ ] **Step 2: Expose the validator through npm**

Add this script to the root `package.json` scripts object:

```json
"version:check": "node tools/check-version.mjs"
```

- [ ] **Step 3: Verify the validator detects the existing drift**

Run:

```bash
npm run version:check
```

Expected: exit `1`, reporting workspace/lockfile `0.1.0` mismatches and the missing `[Unreleased]` or `[0.3.0]`-canonical changelog requirement as applicable.

### Task 2: Normalize active version and historical tracking

**Files:**
- Modify: `package.json`
- Modify: `client/package.json`
- Modify: `server/package.json`
- Modify: `shared/package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Modify: `RELEASENOTE.md`

**Interfaces:**
- Consumes: the existing `v1.0.0` Git tag and post-release `0.2.0`/`0.3.0` changelog content.
- Produces: one active `1.1.0` version and a chronological `[Unreleased] → [1.1.0] → [1.0.0]` tracker.

- [ ] **Step 1: Synchronize npm workspace versions without tagging**

Run:

```bash
npm version 1.1.0 --workspaces --include-workspace-root --no-git-tag-version
```

Expected: root, client, server, shared, and corresponding lockfile entries become `1.1.0`; no Git tag is created.

- [ ] **Step 2: Add the unreleased tracker and normalize version headings**

At the top of `CHANGELOG.md`, after the introductory sentence, add:

```markdown
## [Unreleased]

No changes tracked yet.
```

Change:

```markdown
## [0.3.0] — 2026-07-14 · Chế độ Lây Nhiễm + Map Trường Học
```

to:

```markdown
## [1.1.0] — 2026-07-14 · UI/Game Feel + Chế độ Lây Nhiễm + Map Trường Học
```

Change the `0.2.0` heading into a subsection of `1.1.0`:

```markdown
### UI/UX + Game Feel Makeover
```

Demote the existing `0.2.0` child headings from `###` to `####` so they remain nested under that subsection.

Change:

```markdown
## [0.1.0] — baseline
```

to:

```markdown
## [1.0.0] — 2026-03-19 · First Public Release
```

Preserve all existing feature descriptions and spec links.

- [ ] **Step 3: Mark the detailed release note as historical**

Add immediately below `# Release Notes` in `RELEASENOTE.md`:

```markdown
> Historical detailed notes for the public `v1.0.0` release. The current development version and unreleased changes are tracked in `CHANGELOG.md`.
```

- [ ] **Step 4: Verify normalized version data**

Run:

```bash
npm run version:check
```

Expected:

```text
Version check passed: v1.1.0
```

### Task 3: Add the mandatory Cursor version gate

**Files:**
- Create: `.cursor/skills/version-tracker/SKILL.md`
- Create: `.cursor/rules/version-gate.mdc`

**Interfaces:**
- Consumes: a user request to implement a feature or fix a bug.
- Produces: a version warning, SemVer proposal, tracker status, and explicit approval gate before implementation edits.

- [ ] **Step 1: Create the auto-invoked project skill**

Create `.cursor/skills/version-tracker/SKILL.md`:

```markdown
---
name: version-tracker
description: Enforces CatchAndRun version awareness and changelog tracking. Use before implementing features, fixing bugs, changing versions, or preparing releases.
---

# CatchAndRun Version Tracker

## Before feature or bug-fix implementation

1. Run `npm run version:check`.
2. Read the current version from the root `package.json`.
3. Read the `[Unreleased]` section of `CHANGELOG.md`.
4. Classify the requested change:
   - backward-compatible bug fix: patch;
   - backward-compatible feature: minor;
   - breaking change: major.
5. Show this checkpoint:

```text
⚠️ VERSION CHECKPOINT
Current version: v<current>
Change type: <feat|fix|feat!>
Proposed next version: v<proposed>
Tracker: CHANGELOG.md → [Unreleased]
Tracking entry: <planned changelog summary>
```

6. Ask: `Bắt đầu thay đổi và ghi tracker cho nội dung này?`
7. Stop. Do not edit implementation code, run mutating commands, or delegate implementation until the user explicitly approves.
8. After approval, add the planned entry to `[Unreleased]` before editing implementation code.

Read-only investigation is allowed before approval. Documentation-only, test-only, dependency-maintenance, and release requests report the current version but do not require the blocking feature/bug-fix question.

## Release workflow

1. Choose the SemVer value from the approved `[Unreleased]` changes.
2. Synchronize npm workspaces without creating a tag:
   `npm version <version> --workspaces --include-workspace-root --no-git-tag-version`
3. Rename `[Unreleased]` content into the dated version section and recreate an empty `[Unreleased]`.
4. Run `npm run version:check`, lint, tests, and build.
5. Never commit, push, tag, or publish unless the user explicitly asks.
```

- [ ] **Step 2: Create the always-applied project rule**

Create `.cursor/rules/version-gate.mdc`:

```markdown
---
description: Mandatory version and changelog checkpoint before CatchAndRun feature or bug-fix work
alwaysApply: true
---

# Version Gate

- Before implementing any feature or bug fix, invoke `.cursor/skills/version-tracker/SKILL.md`.
- Read-only investigation is allowed before approval.
- Report the current version, change type, proposed SemVer version, tracker path, and planned changelog entry.
- Ask the required approval question and stop until the user explicitly approves.
- Do not edit implementation code, execute mutating commands, or delegate implementation before approval.
- After approval, update `CHANGELOG.md` `[Unreleased]` before implementation code.
- Root `package.json` is the canonical active version.
- Run `npm run version:check` after version or tracker changes.
- Never commit, push, tag, or publish unless the user explicitly asks.
```

- [ ] **Step 3: Validate skill and rule structure**

Run:

```bash
test -f .cursor/skills/version-tracker/SKILL.md
test -f .cursor/rules/version-gate.mdc
wc -l .cursor/skills/version-tracker/SKILL.md .cursor/rules/version-gate.mdc
```

Expected: both files exist; the skill is under 500 lines and the rule is under 50 lines.

### Task 4: Enforce version consistency in CI

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: repository version and tracker files on each push or pull request.
- Produces: an early CI failure before dependency installation when version drift exists.

- [ ] **Step 1: Add the version check after Node setup and before install**

Insert into `.github/workflows/ci.yml`:

```yaml
      - name: Check version consistency
        run: npm run version:check

      - name: Install dependencies
        run: npm ci
```

Keep the existing install step only once.

- [ ] **Step 2: Verify the CI YAML and local command**

Run:

```bash
npm run version:check
```

Expected:

```text
Version check passed: v1.1.0
```

Review `.github/workflows/ci.yml` to confirm the version check appears before `npm ci`.

### Task 5: Run the complete verification gate

**Files:**
- Verify all files changed in Tasks 1–4.

**Interfaces:**
- Consumes: the completed migration and enforcement files.
- Produces: fresh evidence that versioning, code quality, tests, and production build remain valid.

- [ ] **Step 1: Verify all active version sources**

Run:

```bash
npm run version:check
npm pkg get version --workspaces --include-workspace-root
```

Expected: the validator passes and every reported version is `1.1.0`.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: exit `0` with no ESLint errors.

- [ ] **Step 3: Run server tests**

Run:

```bash
npm test
```

Expected: no failures beyond the approved baseline of 10 existing failures across RoleAssigner, ScoringSystem, GameplayFlow, and the MatchStateMachine `setMetadata` mock. Compare the final failing test names with the baseline and report any difference.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: exit `0`; shared, server, and client builds complete successfully.

- [ ] **Step 5: Inspect the final working tree**

Run:

```bash
git diff --check
git status --short
git tag --points-at HEAD
```

Expected: no whitespace errors, only intended files plus the user's pre-existing `.gitignore` and `public-apis/` changes, and no new tag at `HEAD`.
