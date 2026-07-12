import { Module } from "@nestjs/common";
import { EmployeeAccountsController } from "./employee-accounts.controller";
import { EmployeeAccountsService } from "./employee-accounts.service";

@Module({
  controllers: [EmployeeAccountsController],
  providers: [EmployeeAccountsService]
})
export class EmployeeAccountsModule {}
