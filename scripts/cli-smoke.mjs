import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), "rreadnote-cli-"));

function runCli(args, expectedExitCode = 0, options = {}) {
  const result = spawnSync(
    "cargo",
    ["run", "--quiet", "--manifest-path", "./src-tauri/Cargo.toml", "--", ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input: options.stdinText ?? undefined,
    },
  );

  if (result.status !== expectedExitCode) {
    throw new Error(
      [
        `command failed: cargo run --quiet --manifest-path ./src-tauri/Cargo.toml -- ${args.join(" ")}`,
        `expected exit: ${expectedExitCode}`,
        `actual exit: ${String(result.status)}`,
        `stdout: ${result.stdout.trim()}`,
        `stderr: ${result.stderr.trim()}`,
      ].join("\n"),
    );
  }

  const stdout = result.stdout.trim();
  if (!stdout) {
    throw new Error(`missing JSON output for command: ${args.join(" ")}`);
  }

  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      [
        `invalid JSON output for command: ${args.join(" ")}`,
        `stdout: ${stdout}`,
        `stderr: ${result.stderr.trim()}`,
        String(error),
      ].join("\n"),
    );
  }

  return payload;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  const help = runCli(["help", "--json"]);
  assert(help.ok === true, "help should return ok=true");
  assert(help.command === "help", "help should report command=help");
  assert(typeof help.data?.text === "string" && help.data.text.includes("rreadnote"), "help should return JSON help text");

  const version = runCli(["version", "--json"]);
  assert(version.ok === true, "version should return ok=true");
  assert(version.command === "version", "version should report command=version");
  assert(version.data?.binary === "rreadnote", "version should return binary=rreadnote");

  const info = runCli(["info", "--json"]);
  assert(info.ok === true, "info should return ok=true");
  assert(info.command === "info", "info should report command=info");

  const capabilities = runCli(["capabilities", "--json"]);
  assert(capabilities.ok === true, "capabilities should return ok=true");
  assert(capabilities.command === "capabilities", "capabilities should report command=capabilities");

  const createProject = runCli([
    "create-project",
    "--root",
    tempRoot,
    "--kind",
    "note",
    "--title",
    "CLI Smoke",
    "--json",
  ]);
  assert(createProject.ok === true, "create-project should return ok=true");

  const projectPath = createProject.data?.project?.path;
  assert(typeof projectPath === "string" && projectPath.length > 0, "create-project should return project.path");

  const scanWorkspace = runCli(["scan-workspace", "--root", tempRoot, "--json"]);
  assert(scanWorkspace.ok === true, "scan-workspace should return ok=true");
  assert(Array.isArray(scanWorkspace.data?.projects), "scan-workspace should return a projects array");
  assert(scanWorkspace.data.projects.length === 1, "scan-workspace should find the created project");

  const openProject = runCli(["open-project", "--path", projectPath, "--json"]);
  assert(openProject.ok === true, "open-project should return ok=true");
  assert(openProject.command === "open-project", "open-project should report command=open-project");
  assert(openProject.data?.project?.title === "CLI Smoke", "open-project should return the created project");

  const openDocument = runCli([
    "open-document",
    "--project",
    projectPath,
    "--document-id",
    "index.md",
    "--json",
  ]);
  assert(openDocument.ok === true, "open-document should return ok=true");
  assert(openDocument.data?.document?.summary?.id === "index.md", "open-document should return index.md");
  assert(typeof openDocument.data?.document?.content === "string", "open-document should return document content");

  const contentPath = join(tempRoot, "updated-index.md");
  const nextContent = "# CLI Smoke\n\nThis document was updated by cli smoke.\n";
  writeFileSync(contentPath, nextContent, "utf8");

  const saveDocument = runCli([
    "save-document",
    "--project",
    projectPath,
    "--document-id",
    "index.md",
    "--content-file",
    contentPath,
    "--json",
  ]);
  assert(saveDocument.ok === true, "save-document should return ok=true");
  assert(
    saveDocument.data?.document?.content === nextContent,
    "save-document should persist and return updated content",
  );

  const saveState = runCli([
    "save-state",
    "--project",
    projectPath,
    "--active-document-id",
    "index.md",
    "--active-view",
    "split",
    "--progress-percent",
    "37.5",
    "--heading-slug",
    "cli-smoke",
    "--heading-title",
    "CLI Smoke",
    "--line",
    "3",
    "--json",
  ]);
  assert(saveState.ok === true, "save-state should return ok=true");
  assert(saveState.data?.state?.activeView === "split", "save-state should persist activeView=split");
  assert(
    saveState.data?.state?.documentProgress?.["index.md"]?.percent === 37.5,
    "save-state should persist progress.percent=37.5",
  );

  const quotePath = join(tempRoot, "quote.txt");
  const quote = "This document was updated by cli smoke.";
  writeFileSync(quotePath, quote, "utf8");

  const addHighlight = runCli([
    "add-highlight",
    "--project",
    projectPath,
    "--document-id",
    "index.md",
    "--quote-file",
    quotePath,
    "--note",
    "remember this line",
    "--json",
  ]);
  assert(addHighlight.ok === true, "add-highlight should return ok=true");
  assert(Array.isArray(addHighlight.data?.items), "add-highlight should return items array");
  assert(addHighlight.data.items.length === 1, "add-highlight should create exactly one highlight");
  assert(addHighlight.data.items[0]?.quote === quote, "add-highlight should return the saved quote");

  const listHighlights = runCli(["list-highlights", "--project", projectPath, "--json"]);
  assert(listHighlights.ok === true, "list-highlights should return ok=true");
  assert(listHighlights.data?.items?.length === 1, "list-highlights should return the created highlight");

  const validationError = runCli(
    ["save-document", "--project", projectPath, "--document-id", "index.md", "--json"],
    2,
  );
  assert(validationError.ok === false, "save-document validation error should return ok=false");
  assert(validationError.error?.code === "invalid_arguments", "save-document validation should use invalid_arguments");

  const mutuallyExclusiveInput = runCli(
    [
      "save-document",
      "--project",
      projectPath,
      "--document-id",
      "index.md",
      "--content",
      "inline text",
      "--content-file",
      contentPath,
      "--json",
    ],
    2,
  );
  assert(mutuallyExclusiveInput.ok === false, "conflicting save-document input should return ok=false");
  assert(
    mutuallyExclusiveInput.error?.code === "invalid_arguments",
    "conflicting save-document input should use invalid_arguments",
  );

  const stdinHighlight = runCli(
    [
      "add-highlight",
      "--project",
      projectPath,
      "--document-id",
      "index.md",
      "--stdin",
      "--json",
    ],
    0,
    { stdinText: "highlight from stdin" },
  );
  assert(stdinHighlight.ok === true, "stdin add-highlight should return ok=true");
  assert(stdinHighlight.data?.items?.length === 2, "stdin add-highlight should append another highlight");

  const missingProject = runCli(
    ["open-project", "--path", join(tempRoot, "missing-project"), "--json"],
    3,
  );
  assert(missingProject.ok === false, "missing project should return ok=false");
  assert(missingProject.error?.code === "missing_resource", "missing project should use missing_resource");

  console.log("rreadnote cli smoke passed");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
