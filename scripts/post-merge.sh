#!/bin/bash
set -e
pnpm install --frozen-lockfile
node scripts/migrate-customer-addresses.mjs
pnpm --filter db push
node scripts/add-product-gallery.mjs
node scripts/normalize-qualities.mjs
node scripts/split-photo-video.mjs
node scripts/split-devices.mjs
node scripts/split-wearables.mjs
php artifacts/parts-store/native/bin/translate-seeded-dutch.php
