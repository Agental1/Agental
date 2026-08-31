-- AlterTable
ALTER TABLE "MatchScore" DROP COLUMN "justification",
ADD COLUMN     "reasons" TEXT NOT NULL DEFAULT '[]';

