# rReadNote

rReadNote is a local-first Markdown reading and note-taking workbench. It scans an explicitly selected library, organizes book and note projects, and keeps reading, editing, split views, progress, highlights, and search in one desktop workflow.

## Highlights

- Scan a local Markdown library and create `book` or `note` projects.
- Read, edit, or view a document in split panes.
- Extract headings for navigation and save reading position.
- Capture and list highlights without leaving the project.
- Use a stable JSON CLI for workspace scans, projects, documents, reading state, and highlights.

## Safe sample data

The website examples use fictional titles such as `Demo Notes` and `Example Book`. They contain no personal documents, private notes, or real reading history.

## CLI

```sh
npm run cli -- info --json
npm run cli -- capabilities --json
npm run cli -- scan-workspace --root ./sample-library --json
```

Only provide directories that you intentionally selected. Use `save-document --stdin --json` when an automation needs to write Markdown so shell escaping and the destination remain explicit.

## Development

```sh
npm run web:build
npm run rust-check
```
