import { Module } from "@nestjs/common";
import { SecretCryptoService } from "./secret-crypto.service";

@Module({
  providers: [SecretCryptoService],
  exports: [SecretCryptoService]
})
export class SecretCryptoModule {}
