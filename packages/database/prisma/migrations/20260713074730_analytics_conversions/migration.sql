-- CreateTable
CREATE TABLE "VisitorLog" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "adId" TEXT,
    "landingPageId" TEXT,
    "offerId" TEXT,
    "pwaAppId" TEXT,
    "domainId" TEXT,
    "project" TEXT,
    "ip" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "client" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "event1" INTEGER NOT NULL DEFAULT 0,
    "event2" INTEGER NOT NULL DEFAULT 0,
    "event3" INTEGER NOT NULL DEFAULT 0,
    "clickCost" DECIMAL(18,4),
    "conversionRate" DECIMAL(9,4),
    "feedback" TEXT,
    "metadata" JSONB,
    "visitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionEvent" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "visitorLogId" TEXT,
    "requestId" TEXT,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "adId" TEXT,
    "landingPageId" TEXT,
    "offerId" TEXT,
    "pwaAppId" TEXT,
    "domainId" TEXT,
    "eventName" TEXT NOT NULL DEFAULT 'conversion',
    "eventValue" DECIMAL(18,4),
    "currency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "feedback" TEXT,
    "metadata" JSONB,
    "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitorLog_teamId_visitAt_idx" ON "VisitorLog"("teamId", "visitAt");

-- CreateIndex
CREATE INDEX "VisitorLog_requestId_idx" ON "VisitorLog"("requestId");

-- CreateIndex
CREATE INDEX "VisitorLog_campaignId_idx" ON "VisitorLog"("campaignId");

-- CreateIndex
CREATE INDEX "VisitorLog_landingPageId_idx" ON "VisitorLog"("landingPageId");

-- CreateIndex
CREATE INDEX "VisitorLog_offerId_idx" ON "VisitorLog"("offerId");

-- CreateIndex
CREATE INDEX "ConversionEvent_teamId_convertedAt_idx" ON "ConversionEvent"("teamId", "convertedAt");

-- CreateIndex
CREATE INDEX "ConversionEvent_requestId_idx" ON "ConversionEvent"("requestId");

-- CreateIndex
CREATE INDEX "ConversionEvent_campaignId_idx" ON "ConversionEvent"("campaignId");

-- CreateIndex
CREATE INDEX "ConversionEvent_landingPageId_idx" ON "ConversionEvent"("landingPageId");

-- CreateIndex
CREATE INDEX "ConversionEvent_offerId_idx" ON "ConversionEvent"("offerId");

-- AddForeignKey
ALTER TABLE "VisitorLog" ADD CONSTRAINT "VisitorLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_visitorLogId_fkey" FOREIGN KEY ("visitorLogId") REFERENCES "VisitorLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
