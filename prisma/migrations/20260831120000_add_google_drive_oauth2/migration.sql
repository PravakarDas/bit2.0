-- CreateEnum
CREATE TYPE "GoogleDriveAuthMethod" AS ENUM ('SERVICE_ACCOUNT', 'OAUTH2');

-- AlterTable
ALTER TABLE "GoogleDriveConfig" ADD COLUMN     "authenticationMethod" "GoogleDriveAuthMethod" NOT NULL DEFAULT 'SERVICE_ACCOUNT',
ADD COLUMN     "oauthClientId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "oauthClientSecretEncrypted" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "oauthConnectedEmail" TEXT,
ADD COLUMN     "oauthRefreshTokenEncrypted" TEXT NOT NULL DEFAULT '';
