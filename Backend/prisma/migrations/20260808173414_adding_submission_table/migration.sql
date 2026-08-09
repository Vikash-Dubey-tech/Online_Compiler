-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('processing', 'Success', 'Failure');

-- CreateTable
CREATE TABLE "submission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "submissionstatus" "SubmissionStatus" DEFAULT 'processing',
    "output" TEXT,

    CONSTRAINT "submission_pkey" PRIMARY KEY ("id")
);
