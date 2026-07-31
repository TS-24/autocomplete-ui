# Contributing — Git Workflow & Conventions

Rules for every agent working in this repo. Read `docs/plan.md` first.

## 1. Branches

| Branch | Purpose | Who writes |
|---|---|---|
| `main` | Stable baseline; the only branch a human approves releases from | maintainers |
| `dev` | Integration — **all feature PRs target this** | PRs only |
| `prod` | Release branch (kept in sync with shipped builds) | releases only |

- **Never commit to `main`, `dev`, or `prod` directly.** Always a feature branch + PR.
- Feature branch naming: `feat/<task>` (e.g. `feat/scaffold`, `feat/sync-engine`).
- Branch from `dev`. If your work depends on an **unmerged** PR, branch from that PR's
  branch instead and set the PR base accordingly (stacked PRs, see §3).

## 2. Per-task loop

1. `git fetch origin && git checkout -b feat/<task> origin/dev` (or the dependency branch)
2. Implement; commit in small, logical commits.
3. Verify (§4).
4. Push and open the PR: `gh pr create --base dev --title ... --body ...`
5. PR body must include: summary, what was verified (commands + results), what's next,
   and the base branch if it is not `dev`.
6. **Do not merge the PR** — the user reviews. If the user merges, rebase the next stacked
   branch (`git rebase origin/dev` or retarget the PR).

## 3. Stacked PRs

When PR B depends on PR A (common here — phases are sequential):

- Create `feat/b` from `feat/a` (the branch of PR A), not from `dev`.
- Open PR B with `--base feat/a`. GitHub retargets automatically once A merges.
- Each PR therefore contains only its own diff. This keeps review sane.

## 4. Verification (run before every push)

```bash
npm run typecheck        # tsc --noEmit (route tree must exist first — see below)
npm run build            # vite build (generates routeTree.gen.ts)
npm test                 # vitest run
cargo check              # src-tauri (PATH needs $HOME/.cargo/bin and /opt/homebrew/bin)
```

Order matters on a fresh checkout: `npm install` then `npm run build` (the TanStack Router
vite plugin generates `src/routeTree.gen.ts` during build; `typecheck` after that passes).

If a PR introduces no Rust changes, `cargo check` is still run once on the first PR that
adds Rust code, and any time Cargo.toml changes.

## 5. Commit style

- Conventional prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`
- Imperative, ≤ 72 chars subject; body explains why when non-obvious.
- One logical change per commit; no stray formatting/whitespace changes.

## 6. Code rules (repo-wide)

- TypeScript strict mode. No `any` outside Zod schema boundaries and the sqlite-proxy
  callback.
- All PKS responses Zod-parsed at the boundary (`src/lib/pks/types.ts`).
- DB access ONLY through `src/db/repo/*` — never import `schema.ts`/`client.ts` elsewhere.
- Pure logic (schedule, rank, derive mapping) lives in modules with no side effects and
  has vitest coverage.
- No comments unless they explain why (project style); code should be self-documenting.
- Do not modify `docs/data-product/` — frozen external copy (AGENTS.md).
- Keep dependencies light; this is a desktop app with a "fast and lightweight" goal.

## 7. Environment notes

- Toolchain: Node 26 (Homebrew), Rust 1.97 (rustup). Add both to PATH in non-interactive
  shells: `export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"`.
- PKS backend (sibling repo `../Autocomplete`) runs at `http://localhost:8001` (Docker).
  The UI works fully in fixture mode without it.
- Live API check: `curl http://localhost:8001/api/v1/health`.
