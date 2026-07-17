-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ArtistProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "legalName" TEXT,
    "birthDate" DATETIME,
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "city" TEXT,
    "bio" TEXT,
    "physical" TEXT NOT NULL DEFAULT '{}',
    "preferences" TEXT NOT NULL DEFAULT '{}',
    "mobilityCountries" TEXT NOT NULL DEFAULT '[]',
    "minRateCents" INTEGER,
    "completenessScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArtistProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ArtistProfile" ("bio", "birthDate", "city", "completenessScore", "createdAt", "id", "isMinor", "legalName", "minRateCents", "mobilityCountries", "phone", "physical", "stageName", "status", "updatedAt", "userId") SELECT "bio", "birthDate", "city", "completenessScore", "createdAt", "id", "isMinor", "legalName", "minRateCents", "mobilityCountries", "phone", "physical", "stageName", "status", "updatedAt", "userId" FROM "ArtistProfile";
DROP TABLE "ArtistProfile";
ALTER TABLE "new_ArtistProfile" RENAME TO "ArtistProfile";
CREATE UNIQUE INDEX "ArtistProfile_userId_key" ON "ArtistProfile"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
