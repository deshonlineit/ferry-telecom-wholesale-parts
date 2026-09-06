import { clerkClient } from "@clerk/express";

/**
 * The account's server-managed role is authoritative. Never use customer
 * profile input, unsafeMetadata, email domains or client-provided role claims.
 */
export async function isStaffAccount(userId: string): Promise<boolean> {
  const allowList = (process.env.STAFF_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (allowList.includes(userId)) return true;

  const user = await clerkClient.users.getUser(userId);
  const role = user.publicMetadata?.role;
  return role === "staff" || role === "admin";
}