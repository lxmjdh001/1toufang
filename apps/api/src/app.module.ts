import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AdAccountsModule } from "./ad-accounts/ad-accounts.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AuditLogsModule } from "./audit-logs/audit-logs.module";
import { AuthModule } from "./auth/auth.module";
import { CampaignsModule } from "./campaigns/campaigns.module";
import { ChannelsModule } from "./channels/channels.module";
import { CopywritingsModule } from "./copywritings/copywritings.module";
import { CreativesModule } from "./creatives/creatives.module";
import { DatabaseModule } from "./database/database.module";
import { DemandsModule } from "./demands/demands.module";
import { DomainsModule } from "./domains/domains.module";
import { EmployeeAccountsModule } from "./employee-accounts/employee-accounts.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { LandingPagesModule } from "./landing-pages/landing-pages.module";
import { MediaAssetsModule } from "./media-assets/media-assets.module";
import { OffersModule } from "./offers/offers.module";
import { PermissionsModule } from "./permissions/permissions.module";
import { PlatformConfigsModule } from "./platform-configs/platform-configs.module";
import { PlatformAssetsModule } from "./platform-assets/platform-assets.module";
import { PwaAppsModule } from "./pwa-apps/pwa-apps.module";
import { ReportsModule } from "./reports/reports.module";
import { StrategiesModule } from "./strategies/strategies.module";
import { TargetingsModule } from "./targetings/targetings.module";
import { TeamsModule } from "./teams/teams.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_ACCESS_SECRET") ?? "dev-access-secret",
        signOptions: { expiresIn: "15m" }
      })
    }),
    DatabaseModule,
    AnalyticsModule,
    AuthModule,
    UsersModule,
    EmployeeAccountsModule,
    IntegrationsModule,
    AdAccountsModule,
    TeamsModule,
    PermissionsModule,
    StrategiesModule,
    TargetingsModule,
    CampaignsModule,
    ChannelsModule,
    LandingPagesModule,
    OffersModule,
    DomainsModule,
    MediaAssetsModule,
    CopywritingsModule,
    CreativesModule,
    DemandsModule,
    PlatformConfigsModule,
    PlatformAssetsModule,
    PwaAppsModule,
    ReportsModule,
    AuditLogsModule
  ]
})
export class AppModule {}
