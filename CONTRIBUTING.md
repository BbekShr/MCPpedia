# Contributing to MCPpedia

Thanks for your interest in contributing! Here's how to get involved.

## Ways to Contribute

### Improve server data (no code required)
- Edit server pages on [mcppedia.org](https://mcppedia.org) to fix descriptions, add install configs, or correct categories
- This is the easiest way to help and has immediate impact

### Report issues
- Open a [GitHub issue](https://github.com/BbekShr/MCPpedia/issues) for bugs, inaccurate data, or feature requests

### Submit code changes
1. Fork the repo
2. Create a branch (`git checkout -b my-change`)
3. Make your changes
4. Test locally (`npm run dev`)
5. Open a pull request

## Pull Request Guidelines

- **Keep PRs focused** — one change per PR. A bug fix + a new feature = two PRs.
- **Describe what and why** — not just what you changed, but why it matters.
- **Don't break scoring** — if you change `lib/scoring.ts`, explain the reasoning. Score changes affect every server.
- **No secrets** — never commit API keys, tokens, or credentials. Use environment variables.

## Local Setup

```bash
git clone https://github.com/BbekShr/MCPpedia.git
cd MCPpedia
npm install
cp .env.example .env.local
# Fill in your Supabase keys
npm run dev
```

See [README.md](README.md) for full setup instructions.

## What Gets Merged

All PRs are reviewed by maintainers. We look for:
- Does it solve a real problem?
- Is the code clear and maintainable?
- Does it match existing patterns in the codebase?

We may ask for changes or close PRs that don't align with the project direction. Don't take it personally — we appreciate every contribution.

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
