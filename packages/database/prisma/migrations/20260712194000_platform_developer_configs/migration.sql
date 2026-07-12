-- CreateTable
CREATE TABLE "PlatformDeveloperConfig" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "appId" TEXT,
    "appSecretEncrypted" TEXT,
    "redirectUri" TEXT,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "apiVersion" TEXT,
    "apiBaseUrl" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformDeveloperConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformDeveloperConfig_platform_key" ON "PlatformDeveloperConfig"("platform");

-- CreateIndex
CREATE INDEX "PlatformDeveloperConfig_isEnabled_idx" ON "PlatformDeveloperConfig"("isEnabled");
