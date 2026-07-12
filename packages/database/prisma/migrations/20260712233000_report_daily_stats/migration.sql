-- CreateEnum
CREATE TYPE "ReportSyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "AccountDailyStat" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "date" DATE NOT NULL,
    "currency" TEXT,
    "spend" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDailyStat" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adAccountId" TEXT,
    "platform" "Platform" NOT NULL,
    "date" DATE NOT NULL,
    "currency" TEXT,
    "spend" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSyncRun" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "platform" "Platform",
    "adAccountId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'dry_run',
    "status" "ReportSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "rangeStart" DATE NOT NULL,
    "rangeEnd" DATE NOT NULL,
    "message" TEXT,
    "raw" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountDailyStat_teamId_adAccountId_date_key" ON "AccountDailyStat"("teamId", "adAccountId", "date");

-- CreateIndex
CREATE INDEX "AccountDailyStat_teamId_platform_date_idx" ON "AccountDailyStat"("teamId", "platform", "date");

-- CreateIndex
CREATE INDEX "AccountDailyStat_date_idx" ON "AccountDailyStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignDailyStat_teamId_campaignId_date_key" ON "CampaignDailyStat"("teamId", "campaignId", "date");

-- CreateIndex
CREATE INDEX "CampaignDailyStat_teamId_platform_date_idx" ON "CampaignDailyStat"("teamId", "platform", "date");

-- CreateIndex
CREATE INDEX "CampaignDailyStat_campaignId_date_idx" ON "CampaignDailyStat"("campaignId", "date");

-- CreateIndex
CREATE INDEX "CampaignDailyStat_adAccountId_date_idx" ON "CampaignDailyStat"("adAccountId", "date");

-- CreateIndex
CREATE INDEX "ReportSyncRun_teamId_status_createdAt_idx" ON "ReportSyncRun"("teamId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ReportSyncRun_teamId_platform_rangeStart_rangeEnd_idx" ON "ReportSyncRun"("teamId", "platform", "rangeStart", "rangeEnd");

-- AddForeignKey
ALTER TABLE "AccountDailyStat" ADD CONSTRAINT "AccountDailyStat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDailyStat" ADD CONSTRAINT "AccountDailyStat_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDailyStat" ADD CONSTRAINT "CampaignDailyStat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDailyStat" ADD CONSTRAINT "CampaignDailyStat_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDailyStat" ADD CONSTRAINT "CampaignDailyStat_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSyncRun" ADD CONSTRAINT "ReportSyncRun_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSyncRun" ADD CONSTRAINT "ReportSyncRun_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
