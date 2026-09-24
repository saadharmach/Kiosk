/** Usage: pnpm --filter @kiosk/api create-restaurant <slug> <name> */
import { PrismaClient } from "@kiosk/db";

const [slug, ...nameParts] = process.argv.slice(2);
if (!slug || !nameParts.length) {
  console.error("Usage: create-restaurant <slug> <name>");
  process.exit(1);
}

const prisma = new PrismaClient();
const r = await prisma.restaurant.upsert({
  where: { slug },
  update: {},
  create: { slug, name: nameParts.join(" "), settings: { create: {} } },
  select: { id: true, slug: true, name: true },
});
console.log("✅", r.slug, r.name, r.id);
await prisma.$disconnect();
