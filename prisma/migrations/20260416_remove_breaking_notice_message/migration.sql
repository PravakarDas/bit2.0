-- Drop message field from breaking notices (title-only notices)
ALTER TABLE "BreakingNotice"
DROP COLUMN IF EXISTS "message";
