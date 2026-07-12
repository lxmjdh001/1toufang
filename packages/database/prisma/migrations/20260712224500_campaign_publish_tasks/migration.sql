-- CreateEnum
CREATE TYPE "PublishTaskStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PlatformObjectType" AS ENUM ('CAMPAIGN', 'AD_SET', 'AD_GROUP', 'CREATIVE', 'AD');

-- CreateTable
CREATE TABLE "PublishTask" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "status" "PublishTaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "requestedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformIdMapping" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "objectType" "PlatformObjectType" NOT NULL,
    "localKey" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformIdMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_teamId_status_idx" ON "Campaign"("teamId", "status");

-- CreateIndex
CREATE INDEX "Campaign_platform_status_idx" ON "Campaign"("platform", "status");

-- CreateIndex
CREATE INDEX "PublishTask_teamId_status_createdAt_idx" ON "PublishTask"("teamId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PublishTask_campaignId_createdAt_idx" ON "PublishTask"("campaignId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformIdMapping_campaignId_objectType_localKey_key" ON "PlatformIdMapping"("campaignId", "objectType", "localKey");

-- CreateIndex
CREATE INDEX "PlatformIdMapping_teamId_platform_objectType_idx" ON "PlatformIdMapping"("teamId", "platform", "objectType");

-- CreateIndex
CREATE INDEX "PlatformIdMapping_platform_objectType_externalId_idx" ON "PlatformIdMapping"("platform", "objectType", "externalId");

-- AddForeignKey
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishTask" ADD CONSTRAINT "PublishTask_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformIdMapping" ADD CONSTRAINT "PlatformIdMapping_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformIdMapping" ADD CONSTRAINT "PlatformIdMapping_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
