/**
 * Re-seals a restaurant's TPAPI credentials with the current ENCRYPTION_KEY,
 * taking them from TPAPI_USERNAME / TPAPI_PASSWORD / TPAPI_APPTOKEN in the env.
 * Host, port and every other connection field are left alone.
 * Usage: pnpm --filter @kiosk/api set-tpapi-credentials <slug>
 */
import { PrismaClient } from "@kiosk/db";
import { CryptoService } from "../common/crypto.service.js";

const slug = process.argv[2];
const { TPAPI_USERNAME: userName, TPAPI_PASSWORD: password, TPAPI_APPTOKEN: appToken } = process.env;
if (!slug || !userName || !password) {
  console.error("Usage: set-tpapi-credentials <slug>  (needs TPAPI_USERNAME and TPAPI_PASSWORD in the env)");
  process.exit(1);
}

const prisma = new PrismaClient();
const crypto = new CryptoService();

const conn = await prisma.tpapiConnection.findFirst({ where: { restaurant: { slug } } });
if (!conn) {
  console.error(`No TPAPI connection for "${slug}"`);
  process.exit(1);
}

if (conn.credentialsCiphertext && conn.credentialsIv && conn.credentialsAuthTag) {
  try {
    crypto.openJson({
      ciphertext: conn.credentialsCiphertext,
      iv: conn.credentialsIv,
      authTag: conn.credentialsAuthTag,
    });
    console.log("Stored credentials already decrypt with the current key — nothing to do.");
    await prisma.$disconnect();
    process.exit(0);
  } catch {
    console.log("Stored credentials do not decrypt with the current key — replacing them.");
  }
}

const sealed = crypto.sealJson({ userName, password, appToken: appToken ?? "" });
await prisma.tpapiConnection.update({
  where: { id: conn.id },
  data: {
    credentialsCiphertext: sealed.ciphertext,
    credentialsIv: sealed.iv,
    credentialsAuthTag: sealed.authTag,
  },
});
console.log(`✅ ${slug}: credentials re-sealed for ${conn.host}:${conn.port}`);
await prisma.$disconnect();
