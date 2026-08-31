/** Server-only encrypted vault for provider credentials. Values are never returned through tRPC. */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { integrationSecrets } from "../../drizzle/schema";
import { getDb } from "../db";

type EncryptedSecret = { cipherText: string; iv: string; authTag: string };

function vaultKey() {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw || !/^[a-f0-9]{64}$/i.test(raw)) throw new Error("Secure integration storage is not configured. Add a 32-byte hexadecimal SECRET_ENCRYPTION_KEY on the server.");
  return Buffer.from(raw, "hex");
}

export function encryptSecret(value: string, key = vaultKey()): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const cipherText = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { cipherText: cipherText.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decryptSecret(record: EncryptedSecret, key = vaultKey()) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(record.iv, "base64"));
  decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(record.cipherText, "base64")), decipher.final()]).toString("utf8");
}

export async function saveIntegrationSecret(args: { restaurantId: string; provider: string; keyName: string; value: string; userId: number }) {
  if (!args.value.trim()) throw new Error("Enter a value before saving this connection setting.");
  const db = await getDb();
  if (!db) throw new Error("The database connection is not available.");
  const encrypted = encryptSecret(args.value.trim());
  await db.insert(integrationSecrets).values({ id: crypto.randomUUID(), restaurantId: args.restaurantId, provider: args.provider, keyName: args.keyName, ...encrypted, updatedByUserId: args.userId }).onConflictDoUpdate({ target: [integrationSecrets.restaurantId, integrationSecrets.provider, integrationSecrets.keyName], set: { ...encrypted, updatedByUserId: args.userId } });
}

export async function hasIntegrationSecrets(restaurantId: string, provider: string, keyNames: readonly string[]) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ keyName: integrationSecrets.keyName }).from(integrationSecrets).where(and(eq(integrationSecrets.restaurantId, restaurantId), eq(integrationSecrets.provider, provider)));
  const present = new Set(rows.map(row => row.keyName));
  return keyNames.every(key => present.has(key));
}

export async function readIntegrationSecret(restaurantId: string, provider: string, keyName: string) {
  const db = await getDb();
  if (!db) return undefined;
  const row = (await db.select().from(integrationSecrets).where(and(eq(integrationSecrets.restaurantId, restaurantId), eq(integrationSecrets.provider, provider), eq(integrationSecrets.keyName, keyName))).limit(1))[0];
  return row ? decryptSecret(row) : undefined;
}
