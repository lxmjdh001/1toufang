CREATE TABLE "WorkspaceRecord" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdById" TEXT,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceRecord_teamId_module_updatedAt_idx" ON "WorkspaceRecord"("teamId", "module", "updatedAt");
CREATE INDEX "WorkspaceRecord_teamId_status_idx" ON "WorkspaceRecord"("teamId", "status");

ALTER TABLE "WorkspaceRecord" ADD CONSTRAINT "WorkspaceRecord_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceRecord" ADD CONSTRAINT "WorkspaceRecord_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
