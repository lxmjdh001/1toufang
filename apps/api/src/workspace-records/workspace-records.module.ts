import { Module } from "@nestjs/common";
import { WorkspaceRecordsController } from "./workspace-records.controller";
import { WorkspaceRecordsService } from "./workspace-records.service";

@Module({
  controllers: [WorkspaceRecordsController],
  providers: [WorkspaceRecordsService]
})
export class WorkspaceRecordsModule {}
