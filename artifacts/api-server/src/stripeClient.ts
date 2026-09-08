import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";
import { logger } from "./lib/logger";

type StripeCredentials = {
  secretKey: string;
};

/**
 * Connector credentials are deliberately not cached: connector tokens can rotate
 * while this process is running.
 */
async function getStripeCredentials(): Promise<StripeCredentials> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : undefined;

  if (!hostname || !token) {
    throw new Error(
      "Stripe connector credentials are unavailable. Connect Stripe in the Replit Integrations tab.",
    );
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: token },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Stripe connector credential request failed (${response.status}).`);
  }

  const data = (await response.json()) as {
    items?: Array<{ settings?: { secret?: string } }>;
  };
  const settings = data.items?.[0]?.settings;
  if (!settings?.secret) {
    throw new Error(
      "Stripe is not connected or has no secret key. Connect Stripe in the Replit Integrations tab.",
    );
  }

  return {
    secretKey: settings.secret,
  };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required for Stripe sync.");
  }
  const { secretKey } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: "",
    // Never permit an older webhook payload to overwrite a newer Stripe object.
    revalidateObjectsViaStripeApi: ["payment_intent"],
    logger,
  });
}