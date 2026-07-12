import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { MediaAssetsController } from "./media-assets.controller";
import { MediaAssetsService } from "./media-assets.service";

@Module({
  imports: [DatabaseModule],
  controllers: [MediaAssetsController],
  providers: [MediaAssetsService]
})
export class MediaAssetsModule {}
