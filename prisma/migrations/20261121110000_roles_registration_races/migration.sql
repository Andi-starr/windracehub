-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'HOST', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "RaceStatus" AS ENUM ('PLANNED', 'SEQUENCE', 'RUNNING', 'FINISHED', 'ABANDONED');

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "crew" TEXT,
ADD COLUMN     "handicap" DOUBLE PRECISION,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "discards" TEXT,
ADD COLUMN     "entriesOpen" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'de',
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'PARTICIPANT';
-- keep existing admins; users who already host an event become hosts
UPDATE "User" SET "role" = 'ADMIN' WHERE "isAdmin" = true;
UPDATE "User" SET "role" = 'HOST' WHERE "role" = 'PARTICIPANT' AND "id" IN (SELECT "userId" FROM "EventRole" WHERE "role" = 'HOST');
ALTER TABLE "User" DROP COLUMN "isAdmin";

-- CreateTable
CREATE TABLE "Boat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "sailNumber" TEXT NOT NULL,
    "boatName" TEXT,
    "crew" TEXT,

    CONSTRAINT "Boat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Race" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "classId" TEXT,
    "number" INTEGER NOT NULL,
    "status" "RaceStatus" NOT NULL DEFAULT 'PLANNED',
    "sequence" TEXT NOT NULL DEFAULT '5,4,1,0',
    "prepFlag" TEXT NOT NULL DEFAULT 'P',
    "startAt" TIMESTAMP(3),
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finish" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "position" INTEGER,
    "code" TEXT,

    CONSTRAINT "Finish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Race_eventId_classId_number_key" ON "Race"("eventId", "classId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Finish_raceId_entryId_key" ON "Finish"("raceId", "entryId");

-- AddForeignKey
ALTER TABLE "Boat" ADD CONSTRAINT "Boat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_classId_fkey" FOREIGN KEY ("classId") REFERENCES "EventClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finish" ADD CONSTRAINT "Finish_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finish" ADD CONSTRAINT "Finish_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

