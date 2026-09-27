# rReadNote interface guide

The public screenshot uses fictional `Demo Notes`, `Example Book`, and sample Markdown. Keep personal libraries outside screenshots, fixtures, public issues, and release assets.

## Library

Choose a local library explicitly, scan it, and verify the result before creating a project. A project groups Markdown documents while keeping the original directory boundary visible.

## Reading and navigation

Open a book or note project to read its documents. Use the heading outline to jump through long content, and save progress when you stop. The next session can resume the last document and view.

## Editing and split view

Switch to editing only after confirming the current document path. Split view is useful when comparing the rendered reading view with Markdown source. Save to the selected document and keep backups outside the public repository.

## Highlights and CLI

Capture a highlight with enough surrounding context to make it useful later. For automation, discover fields with `capabilities --json`, then use the workspace, project, document, reading-state, and highlight commands with an explicit target.
