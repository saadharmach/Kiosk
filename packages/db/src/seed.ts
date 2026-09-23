/** Creates one demo restaurant so we can verify tenancy. Safe to re-run. */
import { prisma } from "./index.js";

async function main() {
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: "demo-resto" },
    update: {},
    create: {
      slug: "demo-resto",
      name: "Demo Resto",
      city: "Casablanca",
      country: "MA",
      settings: { create: { takeAwayEnabled: true } },
      tpapi: {
        create: {
          host: "testapi.untill.com",
          port: 3063,
          appName: "KioskPlatform",
        },
      },
    },
    include: { settings: true, tpapi: true },
  });

  console.log("✅ Restaurant:", restaurant.id, restaurant.slug);
  console.log("   settings:", restaurant.settings?.id);
  console.log("   tpapi:   ", restaurant.tpapi?.host, restaurant.tpapi?.port);
}

main()
  .catch((e) => { console.error("❌", e); process.exit(1); })
  .finally(() => prisma.$disconnect());