/** Usage: pnpm --filter @kiosk/api create-admin <email> <password> [fullName] */
import { PrismaClient } from "@kiosk/db";
import { hash } from "@node-rs/argon2";

const [email, password, ...nameParts] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: create-admin <email> <password> [full name]");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const prisma = new PrismaClient();

const user = await prisma.platformUser.upsert({
  where: { email: email.toLowerCase() },
  update: {},
  create: {
    email: email.toLowerCase(),
    passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
    fullName: nameParts.join(" ") || null,
    role: "SUPER_ADMIN",
  },
  select: { id: true, email: true, role: true },
});

console.log("✅", user.role, user.email, user.id);
await prisma.$disconnect();