import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ContentChangedInterceptor } from "./common/content-changed.interceptor.js";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AdminModule } from "./admin/admin.module.js";
import { KioskModule } from "./kiosk/kiosk.module.js";
import { MediaModule } from "./media/media.module.js";
import { SyncModule } from "./sync/sync.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { RestaurantAuthModule } from "./restaurant-auth/restaurant-auth.module.js";

import { HealthController } from "./health/health.controller.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [
    MediaModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    AdminModule,
    SyncModule,
    KioskModule,
    RestaurantAuthModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Any successful change in the back office or the admin: that restaurant's kiosks reload what they show.
    { provide: APP_INTERCEPTOR, useClass: ContentChangedInterceptor },
    
  ],
})
export class AppModule {}