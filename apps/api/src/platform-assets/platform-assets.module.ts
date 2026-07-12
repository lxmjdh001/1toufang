import { Module } from "@nestjs/common";
import { SecretCryptoModule } from "../common/crypto/secret-crypto.module";
import { PlatformAssetsController } from "./platform-assets.controller";
import { PlatformAssetsService } from "./platform-assets.service";

@Module({
  imports: [SecretCryptoModule],
  controllers: [PlatformAssetsController],
  providers: [PlatformAssetsService],
  exports: [PlatformAssetsService]
})
export class PlatformAssetsModule {}
