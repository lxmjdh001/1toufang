import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PublisherModule } from "../publisher/publisher.module";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";

@Module({
  imports: [DatabaseModule, PublisherModule],
  controllers: [CampaignsController],
  providers: [CampaignsService]
})
export class CampaignsModule {}
