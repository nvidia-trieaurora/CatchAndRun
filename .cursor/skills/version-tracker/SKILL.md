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
