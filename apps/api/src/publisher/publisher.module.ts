import { Module } from "@nestjs/common";
import { SecretCryptoModule } from "../common/crypto/secret-crypto.module";
import { PublisherService } from "./publisher.service";

@Module({
  imports: [SecretCryptoModule],
  providers: [PublisherService],
  exports: [PublisherService]
})
export class PublisherModule {}
