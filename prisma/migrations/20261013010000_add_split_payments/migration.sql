ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MIXED';

ALTER TABLE "appointments"
ADD COLUMN "cash_amount" DECIMAL(12,2),
ADD COLUMN "card_amount" DECIMAL(12,2);

UPDATE "appointments"
SET "cash_amount" = "amount"
WHERE "payment_method" = 'CASH' AND "amount" IS NOT NULL;

UPDATE "appointments"
SET "card_amount" = "amount"
WHERE "payment_method" = 'CARD' AND "amount" IS NOT NULL;
