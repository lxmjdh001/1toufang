import { Module } from "@nestjs/common";
import { SecretCryptoModule } from "../common/crypto/secret-crypto.module";
import { PlatformConfigsModule } from "../platform-configs/platform-configs.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";

@Module({
  imports: [PlatformConfigsModule, SecretCryptoModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService]
})
export class IntegrationsModule {}
