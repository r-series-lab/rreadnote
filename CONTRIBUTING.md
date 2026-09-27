# Contributing

Thank you for helping improve rReadNote. Read the [public repository boundary](PUBLIC_REPOSITORY.md) before opening a pull request.

## Development setup

```bash
npm install
npm run web:build
npm run rust-check
cargo test --manifest-path ./src-tauri/Cargo.toml
```

Keep pull requests focused and update `CHANGELOG.md` when a public behavior or CLI contract changes. Release packaging and tags are maintained according to [RELEASE.md](RELEASE.md).

Never commit personal Markdown libraries, private notes, real screenshots, complete machine paths, tokens, or other user content. Use short synthetic Markdown examples for tests and documentation.
