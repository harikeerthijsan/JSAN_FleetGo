CREATE TABLE "web_test_datasets" (
  "marker" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "web_test_datasets_pkey" PRIMARY KEY ("marker")
);
