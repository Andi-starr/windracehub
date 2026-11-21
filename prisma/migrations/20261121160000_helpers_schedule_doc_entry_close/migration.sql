-- AlterEnum
ALTER TYPE "DocType" ADD VALUE 'SCHEDULE';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'HELPER';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "entriesCloseAt" TIMESTAMP(3),
ALTER COLUMN "entriesOpen" SET DEFAULT true;

