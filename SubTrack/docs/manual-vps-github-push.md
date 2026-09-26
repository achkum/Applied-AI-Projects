# Manual VPS push for SubTrack

The assembled source is currently at:

```text
/home/paperclip/.paperclip/instances/default/projects/0ec77a0f-5255-4d7a-a6ff-0f6aaf1a3022/5070fc09-9bf6-4cad-b009-b2f473da7c31/_default
```

## 1. Set up GitHub SSH access (once)

```bash
test -f "$HOME/.ssh/id_ed25519" || ssh-keygen -t ed25519 -C "your-github-email@example.com"
cat "$HOME/.ssh/id_ed25519.pub"
```

Copy the displayed public key into GitHub: **Settings → SSH and GPG keys → New SSH key**. Then verify:

```bash
ssh -T git@github.com
```

GitHub should identify your account. That account needs write access to `achkum/Applied-AI-Projects`.

## 2. Clone the repository and create the release branch

```bash
SRC=/home/paperclip/.paperclip/instances/default/projects/0ec77a0f-5255-4d7a-a6ff-0f6aaf1a3022/5070fc09-9bf6-4cad-b009-b2f473da7c31/_default
DEST="$HOME/Applied-AI-Projects"

git clone git@github.com:achkum/Applied-AI-Projects.git "$DEST"
cd "$DEST"
git switch -c subtrack-mvp origin/main
```

If the VPS already has that clone, use this instead:

```bash
DEST="$HOME/Applied-AI-Projects"
cd "$DEST"
git status --short
git fetch origin
git switch -c subtrack-mvp origin/main
```

Stop if `git status --short` shows changes you need to keep. If the local branch already exists, use `git switch subtrack-mvp`; if only the remote branch exists, use `git switch --track origin/subtrack-mvp`.

## 3. Copy the tested release into `SubTrack/`

```bash
mkdir -p "$DEST/SubTrack" "$DEST/.github/workflows"

cp -a \
  "$SRC/.env.example" \
  "$SRC/.gitignore" \
  "$SRC/README.md" \
  "$SRC/app.js" \
  "$SRC/index.html" \
  "$SRC/package.json" \
  "$SRC/package-lock.json" \
  "$SRC/server.mjs" \
  "$SRC/styles.css" \
  "$SRC/tsconfig.json" \
  "$DEST/SubTrack/"

cp -a "$SRC/db" "$SRC/src" "$SRC/test" "$DEST/SubTrack/"
mkdir -p "$DEST/SubTrack/packages"
cp -a "$SRC/SubTrack/packages/household-core" "$DEST/SubTrack/packages/"
cp -a "$SRC/.github/workflows/ci.yml" "$DEST/.github/workflows/subtrack-ci.yml"
```

## 4. Verify, commit, and push

```bash
cd "$DEST"
npm --prefix SubTrack ci
npm --prefix SubTrack run check
npm --prefix SubTrack/packages/household-core test

git status --short
git add SubTrack .github/workflows/subtrack-ci.yml
git commit -m "Add SubTrack MVP"
git push -u origin subtrack-mvp
```

## 5. Confirm the remote commit

```bash
git rev-parse HEAD
git ls-remote origin refs/heads/subtrack-mvp
```

The two SHA values should match. The branch will be available at:

```text
https://github.com/achkum/Applied-AI-Projects/tree/subtrack-mvp
```

If `git push` says `Permission denied (publickey)`, the VPS public key is not attached to a GitHub account with write access. If GitHub says the branch already exists, fetch it and inspect the difference before pushing; do not force-push over work you have not reviewed.
