import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CopywritingsController } from "./copywritings.controller";
import { CopywritingsService } from "./copywritings.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CopywritingsController],
  providers: [CopywritingsService]
})
export class CopywritingsModule {}
