# Git branch layout (server vs app)

This repository uses **two long-lived product branches** in addition to **`main`**.

| Branch | Purpose | Typical changes | Deploy / tooling |
|--------|---------|-----------------|------------------|
| **`main`** | Integration / default. Merge `server` and `app` when both are healthy. | — | Optional staging |
| **`server`** | Backend only: API, worker, Redis queue, Postgres schema, OpenAPI, backend tests, Coolify/Docker. | `backend/`, backend CI (`.github/workflows/backend-ci.yml`), server notes in `dev/` | **Coolify should build from `server`** (or from `main` if you prefer—pick one and stay consistent). |
| **`app`** | Mobile client: Expo / React Native, `BoardSight/`, app-only assets and tests. | `BoardSight/` (or your app root), app README, Detox/E2E for mobile | **Expo / EAS / app store** from this branch (or from `main`). |

## Daily workflow

1. **Backend change**  
   `git checkout server` → commit → push → open PR **into `main`** (or merge locally when ready).

2. **App change**  
   `git checkout app` → commit → push → PR **into `main`**.

3. **Release**  
   Merge **`server`** and **`app`** into **`main`** when you want a single integration point, then tag if you version the monorepo.

## First-time setup (after cloning)

```powershell
cd "D:\01code\99Ideas\Chess AI"
git fetch origin
git checkout server
git pull origin server
# Backend work here

git checkout app
git pull origin app
# BoardSight / Expo work here

git checkout main
```

Create local branches if they do not exist on the remote yet:

```powershell
git checkout main
git pull
git branch server
git branch app
git push -u origin server
git push -u origin app
```

## `BoardSight/` in this monorepo

**BoardSight** is a normal directory under the same Git repo (see **`dev/boardsight-submodule.md`**). Mobile work can be committed on **`app`** or **`main`** per your workflow; no submodule pointer updates are needed.
