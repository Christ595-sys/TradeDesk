ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'USER';

CREATE INDEX "User_role_idx" ON "User"("role");
