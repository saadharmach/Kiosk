/** Usage: pnpm --filter @kiosk/api create-restaurant-user <slug> <email> <password> [full name] */
import { PrismaClient } from "@kiosk/db";
import { hash } from "@node-rs/argon2";

const [slug, email, password, ...nameParts] = process.argv.slice(2);
if (!slug || !email || !password) {
  console.error("Usage: create-restaurant-user <slug> <email> <password> [full name]");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const prisma = new PrismaClient();
const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
if (!restaurant) {
  console.error(`No restaurant with slug "${slug}"`);
  process.exit(1);
}

const user = await prisma.restaurantUser.upsert({
  where: { restaurantId_email: { restaurantId: restaurant.id, email: email.toLowerCase() } },
  update: {},
  create: {
    restaurantId: restaurant.id,
    email: email.toLowerCase(),
    passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
    fullName: nameParts.join(" ") || null,
    role: "OWNER",
    // The operator chose this password on the command line: it is a real one, not an invitation still waiting.
    passwordSetAt: new Date(),
  },
  select: { id: true, email: true, role: true },
});
console.log("✅", slug, user.role, user.email, user.id);
await prisma.$disconnect();