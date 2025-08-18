#!/bin/bash
set -e

BUMP="$1"
if [[ ! "$BUMP" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: $0 <patch|minor|major>"
  exit 1
fi

npm version "$BUMP" --no-git-tag-version

NEW_VERSION=$(node -p "require('./package.json').version")
TAG_NAME="v$NEW_VERSION"

git tag -d "$TAG_NAME" 2>/dev/null || true

./node_modules/.bin/auto-changelog --latest-version $TAG_NAME --commit-limit 10000 --backfill-limit 10000 --sort-commits date --hide-credit
# Remove lines starting with "> " and reduce multiple newlines to double newlines
sed -i -e '/^> /d' -e ':a;N;$!ba;s/\n\n\n\+/\n\n/g' CHANGELOG.md

git add package.json package-lock.json CHANGELOG.md
git commit -m "$TAG_NAME"
git tag "$TAG_NAME" -m "$TAG_NAME"

git push
git push --tags --force

echo "✅ Successfully created version $NEW_VERSION"
