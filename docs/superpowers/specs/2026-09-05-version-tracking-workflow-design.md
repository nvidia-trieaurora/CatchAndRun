# Version Tracking Workflow Design

Date: 2026-09-05
Status: Approved
Target version: 1.1.0

## Problem

Version data is inconsistent:

- The root package reports `0.3.0`.
- The client, server, shared package, and lockfile report `0.1.0`.
- Git contains a public `v1.0.0` tag created before the latest feature work.
- `CHANGELOG.md` records `0.1.0`, `0.2.0`, and `0.3.0`.
- `RELEASENOTE.md` documents the public `v1.0.0` release.

The project also lacks a mandatory checkpoint that reports the current version and updates the tracker before feature or bug-fix work begins.

## Decisions

1. Use Semantic Versioning.
2. Set the current development version to `1.1.0`, the next minor version after the existing public `v1.0.0` tag.
3. Treat the root `package.json` as the canonical active version.
4. Keep every workspace package and `package-lock.json` synchronized with the canonical version.
5. Use `CHANGELOG.md` as the canonical change tracker.
6. Keep `RELEASENOTE.md` as historical, detailed release documentation rather than an active version source.
7. Enforce the workflow with an always-applied project rule, an auto-invoked project skill, and a deterministic validation script used by CI.
8. Do not use a blocking file-edit hook because it cannot reliably distinguish feature or bug-fix work from documentation and maintenance edits.

## Changelog Structure

`CHANGELOG.md` will contain:

- `[Unreleased]` for approved work that has not been released.
- `[1.1.0]` for the UI/game-feel and Infection/Sunny School work currently described as `0.2.0` and `0.3.0`.
- `[1.0.0]` for the first public release currently described as the baseline.

Historical content must be preserved while its headings are normalized to the public SemVer sequence.

## Version Gate

Before editing implementation code for a feature or bug fix, the agent must:

1. Run the version validation command.
2. Read the current version from the root `package.json`.
3. Inspect `[Unreleased]` in `CHANGELOG.md`.
4. Report:
   - current version;
   - proposed change type (`feat` or `fix`);
   - proposed next version according to SemVer;
   - tracker location.
5. Ask the user whether to start and track the change.
6. Stop without editing implementation code until the user explicitly approves.
7. After approval, add the intended change to `[Unreleased]` before editing implementation code.

Documentation-only, test-only, dependency-maintenance, and release operations still report the current version, but only feature and bug-fix work requires the blocking approval prompt.

## Project Files

- `.cursor/skills/version-tracker/SKILL.md`: reusable workflow and prompt format.
- `.cursor/rules/version-gate.mdc`: always-applied requirement to invoke the workflow.
- `tools/check-version.mjs`: validates package and tracker consistency.
- `package.json`: exposes `npm run version:check`.
- `.github/workflows/ci.yml`: runs the version check before build and test.

## Validation Rules

The validator must fail when:

- root, client, server, or shared package versions differ;
- root or workspace versions in `package-lock.json` differ;
- `CHANGELOG.md` has no `[Unreleased]` section;
- `CHANGELOG.md` has no section for the current canonical version.

The validator must print the canonical version when successful.

## Migration

1. Synchronize all active version fields to `1.1.0` without creating a Git tag.
2. Normalize changelog headings while preserving their content.
3. Add the validator, project skill, and always-applied rule.
4. Add the validator to CI.
5. Run version validation, lint, tests, and build.

## Success Criteria

- Every active version field reports `1.1.0`.
- Changelog history follows `1.0.0` then `1.1.0`, with `[Unreleased]` ready for future work.
- A feature or bug-fix request triggers a current-version warning and explicit approval gate.
- CI detects future version drift.
- Version workflow changes introduce no new lint, test, or build failures.

## Known Baseline Exception

Before implementation, the server suite had 76 passing and 10 failing tests across RoleAssigner, ScoringSystem, GameplayFlow, and the MatchStateMachine `setMetadata` mock. The user approved continuing without expanding this task into unrelated gameplay fixes. Final verification must compare against this baseline and report any additional failures.

## Out of Scope

- Creating or pushing a new Git tag.
- Publishing a GitHub release.
- Committing or pushing changes.
- Gameplay, graphics, deployment, App Store, and monetization work.
