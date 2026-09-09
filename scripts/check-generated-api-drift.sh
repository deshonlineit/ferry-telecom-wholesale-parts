#!/usr/bin/env bash

set -euo pipefail

readonly INPUT_PATHS=(
  "lib/api-spec/openapi.yaml"
  "lib/api-spec/orval.config.ts"
  "lib/api-spec/postprocess-generated-zod.mjs"
)
readonly GENERATED_PATHS=(
  "lib/api-zod/src/generated"
  "lib/api-client-react/src/generated"
)
readonly CHECKED_PATHS=("${INPUT_PATHS[@]}" "${GENERATED_PATHS[@]}")

readonly ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [[ -n "$(git status --porcelain -- "${CHECKED_PATHS[@]}")" ]]; then
  echo "API-codegen driftcheck vereist schone bron- en gegenereerde bestanden:" >&2
  git status --short -- "${CHECKED_PATHS[@]}" >&2
  exit 2
fi

readonly SNAPSHOT="$(mktemp -d)"
trap 'rm -rf "$SNAPSHOT"' EXIT

# Build and commit a clean snapshot so concurrent validations can safely read the
# main worktree while Orval cleans and rewrites its output directories.
git ls-files -z | tar --null -T - -cf - | tar -xf - -C "$SNAPSHOT"
(
  cd "$SNAPSHOT"
  git init --quiet
  git config user.email "api-codegen-drift@example.invalid"
  git config user.name "API codegen drift check"
  git add .
  git commit --quiet -m "API codegen drift baseline"
  pnpm install --frozen-lockfile --ignore-scripts
  pnpm --filter @workspace/api-spec run codegen

  if ! git diff --exit-code -- "${GENERATED_PATHS[@]}"; then
    echo >&2
    echo "Gegenereerde API-libraries zijn verouderd." >&2
    echo "Voer 'pnpm --filter @workspace/api-spec run codegen' uit en commit de wijzigingen." >&2
    exit 1
  fi

  if [[ -n "$(git ls-files --others --exclude-standard -- "${GENERATED_PATHS[@]}")" ]]; then
    echo "Codegen heeft niet-ingecheckte gegenereerde bestanden gemaakt:" >&2
    git ls-files --others --exclude-standard -- "${GENERATED_PATHS[@]}" >&2
    exit 1
  fi
)

echo "Gegenereerde API-libraries zijn actueel."