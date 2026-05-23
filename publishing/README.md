# publishing/

Meta-docs for taking this project from local working copy to a public GitHub repo. Nothing in this folder is part of the app at runtime — it exists so future-you (or a collaborator forking this project) can re-run the upload procedure safely.

## What's here

| File | Purpose |
|---|---|
| `PUBLISHING.md` | Full step-by-step upload guide. Start here the first time you publish. |
| `CHECKLIST.md` | One-screen pre-push checklist. Use this for re-publishes / collaborators. |
| `secret-scan.sh` | Local secret scanner. Run before every push. Exits non-zero if it finds an API-key-shaped string in any non-gitignored file. |

## Quick path (after the first publish)

```bash
./publishing/secret-scan.sh           # must pass
git status                            # sanity-check files about to be added
git add -A
git commit -m "your message"
git push
```

If `secret-scan.sh` fails, **do not push**. Fix the finding, re-run, then push.
