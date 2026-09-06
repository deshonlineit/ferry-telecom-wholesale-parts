import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { backfillCustomerAddresses } from "./lib/backfillCustomerAddresses";

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
