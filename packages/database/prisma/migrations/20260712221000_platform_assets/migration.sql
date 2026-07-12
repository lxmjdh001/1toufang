-- CreateEnum
CREATE TYPE "PlatformAssetType" AS ENUM ('BUSINESS_CENTER', 'FACEBOOK_PAGE', 'PIXEL', 'TIKTOK_ADVERTISER', 'TIKTOK_APP', 'CATALOG', 'PRODUCT_FEED');

-- CreateTable
CREATE TABLE "PlatformAsset" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "type" "PlatformAssetType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "metadata" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAsset_teamId_platform_type_externalId_key" ON "PlatformAsset"("teamId", "platform", "type", "externalId");

-- CreateIndex
CREATE INDEX "PlatformAsset_teamId_platform_type_idx" ON "PlatformAsset"("teamId", "platform", "type");

-- CreateIndex
CREATE INDEX "PlatformAsset_lastSyncedAt_idx" ON "PlatformAsset"("lastSyncedAt");

-- AddForeignKey
ALTER TABLE "PlatformAsset" ADD CONSTRAINT "PlatformAsset_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
