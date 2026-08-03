#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
node scripts/normalize-qualities.mjs
node scripts/split-photo-video.mjs
