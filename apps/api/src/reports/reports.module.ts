import { Module } from "@nestjs/common";
import { SecretCryptoModule } from "../common/crypto/secret-crypto.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [SecretCryptoModule],
  controllers: [ReportsController],
  providers: [ReportsService]
})
export class ReportsModule {}
