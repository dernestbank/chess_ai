# BoardSight app (`BoardSight/`)

The **BoardSight** React Native app lives in **`BoardSight/`** in this monorepo as **normal tracked files** (not a git submodule). A plain `git clone` includes the app; no `git submodule update` step.

## Develop

```powershell
cd "D:\01code\99Ideas\Chess AI\BoardSight"
npm install
npx expo start
```

Use branch **`app`** for app-focused PRs if you follow `dev/git-branches.md`; commit app changes in the **parent** repo like any other directory.

## Backend URL

Point the app at your API (see `dev/setup.md`): `EXPO_PUBLIC_API_BASE_URL`, Settings **Cloud API endpoint**, and relay **`/ws/relay/...`**.
