import { Module } from "@nestjs/common";
import { SecretCryptoModule } from "../common/crypto/secret-crypto.module";
import { DatabaseModule } from "../database/database.module";
import { TargetingsController } from "./targetings.controller";
import { TargetingsService } from "./targetings.service";

@Module({
  imports: [DatabaseModule, SecretCryptoModule],
  controllers: [TargetingsController],
  providers: [TargetingsService]
})
export class TargetingsModule {}
