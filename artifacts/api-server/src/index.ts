import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { backfillCustomerAddresses } from "./lib/backfillCustomerAddresses";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (!databaseUrl || !replitDomain) {
      throw new Error("DATABASE_URL and REPLIT_DOMAINS are required for Stripe initialization.");
    }
    await runMigrations({ databaseUrl, logger });
    const stripeSync = await getStripeSync();
    await stripeSync.findOrCreateManagedWebhook(
      `https://${replitDomain}/api/stripe/webhook`,
    );
    await stripeSync.syncBackfill();
    logger.info("Stripe schema, managed webhook, and backfill ready");

    const migratedAddresses = await backfillCustomerAddresses(pool);
    logger.info({ migratedAddresses }, "Address book data ready");
  } catch (err) {
    logger.error(
      { err },
      "Address book initialization failed. Apply the current database schema before starting the API.",
    );
    await pool.end();
    process.exitCode = 1;
    return;
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void start();
