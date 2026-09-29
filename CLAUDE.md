# CLAUDE.md

This repository is a private GitHub snapshot of the TideLine Claude artifact "The Voyage (Copy)".

## Project status

This repo currently appears to be a minimal scaffold and may evolve as work is added. Keep changes focused and avoid inventing architecture or tooling that is not already present.

## Operating rules for Claude

- Prefer small, surgical edits over broad rewrites.
- Preserve the existing structure unless the task explicitly requires reorganization.
- Do not add frameworks, dependencies, or build steps unless the repo already uses them or the task clearly calls for them.
- If the project is empty or intentionally minimal, treat the repository as a starting point and add only what is necessary.
- Keep documentation accurate and concise.
- When validating changes, use the smallest relevant command available in the repo.

## Suggested workflow

1. Inspect the repository contents before making changes.
2. Confirm the intended task and repository conventions.
3. Make the minimal change set needed to complete the task.
4. Run the smallest validation command available.
5. Summarize what changed and any follow-up needed.

## Current repo notes

- Default branch: `main`
- Root contents are intentionally minimal at the moment.
- README.md exists and should be treated as the primary project description until more files are added.

## Example commands

```bash
ls -la
find . -maxdepth 2 -type f | sort
```

If this repository grows into an app or service, add the relevant build/test commands here as they become established.
