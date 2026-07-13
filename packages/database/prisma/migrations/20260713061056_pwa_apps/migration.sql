-- CreateTable
CREATE TABLE "PwaApp" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PwaApp_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PwaApp" ADD CONSTRAINT "PwaApp_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
