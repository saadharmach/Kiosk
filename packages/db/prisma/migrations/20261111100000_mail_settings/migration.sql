-- The platform's email (SMTP) settings, set in the admin.
-- CreateEnum
CREATE TYPE "MailSecurity" AS ENUM ('NONE', 'SSL', 'STARTTLS');

-- CreateTable
CREATE TABLE "mail_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "security" "MailSecurity" NOT NULL DEFAULT 'STARTTLS',
    "authEnabled" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "passwordSealed" JSONB,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_settings_pkey" PRIMARY KEY ("id")
);

