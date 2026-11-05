-- Vendor Documents (ADDITIVE ONLY).
-- Agreements, consent forms and supporting documents attached to a vendor
-- organization. No existing table, column, enum or constraint is modified.

-- CreateEnum
CREATE TYPE "VendorDocumentCategory" AS ENUM ('CONSENT', 'AGREEMENT', 'OTHER');

-- CreateTable
CREATE TABLE "vendor_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" "VendorDocumentCategory" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_documents_organizationId_idx" ON "vendor_documents"("organizationId");

-- AddForeignKey
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
