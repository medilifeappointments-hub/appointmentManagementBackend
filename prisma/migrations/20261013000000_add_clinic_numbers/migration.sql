CREATE TABLE "clinic_numbers" (
    "id" UUID NOT NULL,
    "number" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clinic_numbers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clinic_numbers_number_key" ON "clinic_numbers"("number");

INSERT INTO "clinic_numbers" ("id", "number") VALUES
    (gen_random_uuid(), '+971523452646'),
    (gen_random_uuid(), '+971523452647'),
    (gen_random_uuid(), '+971502851866'),
    (gen_random_uuid(), '+971586670701'),
    (gen_random_uuid(), '+971522265579'),
    (gen_random_uuid(), '+971509869177'),
    (gen_random_uuid(), '+971501329255'),
    (gen_random_uuid(), '+971586670702');

ALTER TABLE "appointments" ADD COLUMN "clinic_number" VARCHAR(20);
UPDATE "appointments" SET "clinic_number" = '+971523452646';
ALTER TABLE "appointments" ALTER COLUMN "clinic_number" SET NOT NULL;
