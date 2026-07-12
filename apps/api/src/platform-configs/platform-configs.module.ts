import { Module } from "@nestjs/common";
import { SecretCryptoModule } from "../common/crypto/secret-crypto.module";
import { PlatformConfigsController } from "./platform-configs.controller";
import { PlatformConfigsService } from "./platform-configs.service";

@Module({
  imports: [SecretCryptoModule],
  controllers: [PlatformConfigsController],
  providers: [PlatformConfigsService],
  exports: [PlatformConfigsService]
})
export class PlatformConfigsModule {}
