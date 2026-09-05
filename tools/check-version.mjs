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
