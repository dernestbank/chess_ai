# BoardSight submodule (`BoardSight/`)

The parent repo records **`BoardSight/`** as a **git submodule** (mode `160000` in the index). After a fresh clone you may see an empty folder until the submodule is initialized.

## One-time clone

```powershell
cd "D:\01code\99Ideas\Chess AI"
git submodule update --init --recursive
```

If that fails with *no url found for submodule path ...*, add a **`.gitmodules`** file at the repo root (or run `git submodule add`) with your real mobile app remote, for example:

```ini
[submodule "BoardSight"]
	path = BoardSight
	url = https://github.com/YOUR_ORG/YOUR_BOARDSIGHT_REPO.git
```

Then:

```powershell
git submodule sync
git submodule update --init --recursive
```

Work on the app on branch **`app`** (see `dev/git-branches.md`); commit **inside** `BoardSight` for app changes, then in the parent repo commit the **updated submodule pointer**.

## If the app lives only on your disk

Point the submodule at your GitHub repo (create one if needed), push `BoardSight`’s `main`, then attach it as above. Until then, backend-only work can stay on branch **`server`** without a working `BoardSight/` checkout.
