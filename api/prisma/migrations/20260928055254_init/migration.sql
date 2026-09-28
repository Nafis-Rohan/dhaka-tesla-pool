-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('PASSENGER', 'DRIVER');

-- CreateEnum
CREATE TYPE "pool_status" AS ENUM ('MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "request_status" AS ENUM ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH');

-- CreateEnum
CREATE TYPE "cancel_reason" AS ENUM ('PASSENGER', 'NO_SHOW');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_adjacency" (
    "zone_a_id" UUID NOT NULL,
    "zone_b_id" UUID NOT NULL,

    CONSTRAINT "zone_adjacency_pkey" PRIMARY KEY ("zone_a_id","zone_b_id")
);

-- CreateTable
CREATE TABLE "zone_distances" (
    "zone_a_id" UUID NOT NULL,
    "zone_b_id" UUID NOT NULL,
    "distance_m" INTEGER NOT NULL,

    CONSTRAINT "zone_distances_pkey" PRIMARY KEY ("zone_a_id","zone_b_id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "current_zone_id" UUID,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "pickup_zone_id" UUID NOT NULL,
    "status" "pool_status" NOT NULL,
    "is_shared" BOOLEAN NOT NULL,
    "capacity" INTEGER NOT NULL,
    "seats_taken" INTEGER NOT NULL DEFAULT 0,
    "arrived_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "passenger_id" UUID NOT NULL,
    "pool_id" UUID,
    "pickup_zone_id" UUID NOT NULL,
    "dest_zone_id" UUID NOT NULL,
    "seats" INTEGER NOT NULL,
    "allow_pool" BOOLEAN NOT NULL,
    "status" "request_status" NOT NULL DEFAULT 'REQUESTED',
    "base_fare" INTEGER NOT NULL,
    "distance_charge" INTEGER NOT NULL,
    "pool_discount" INTEGER,
    "final_fare" INTEGER,
    "est_solo_fare" INTEGER NOT NULL,
    "est_pooled_fare" INTEGER NOT NULL,
    "payment_method" "payment_method",
    "cancel_reason" "cancel_reason",
    "cancelled_by" UUID,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_request_id" UUID,
    "pool_id" UUID,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "zones_name_key" ON "zones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_driver_id_key" ON "vehicles"("driver_id");

-- CreateIndex
CREATE INDEX "pools_status_pickup_zone_id_idx" ON "pools"("status", "pickup_zone_id");

-- CreateIndex
CREATE INDEX "ride_requests_status_pickup_zone_id_idx" ON "ride_requests"("status", "pickup_zone_id");

-- CreateIndex
CREATE INDEX "ride_requests_pool_id_idx" ON "ride_requests"("pool_id");

-- CreateIndex
CREATE INDEX "ride_requests_passenger_id_created_at_idx" ON "ride_requests"("passenger_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ride_events_ride_request_id_idx" ON "ride_events"("ride_request_id");

-- CreateIndex
CREATE INDEX "ride_events_pool_id_idx" ON "ride_events"("pool_id");

-- AddForeignKey
ALTER TABLE "zone_adjacency" ADD CONSTRAINT "zone_adjacency_zone_a_id_fkey" FOREIGN KEY ("zone_a_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_adjacency" ADD CONSTRAINT "zone_adjacency_zone_b_id_fkey" FOREIGN KEY ("zone_b_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_distances" ADD CONSTRAINT "zone_distances_zone_a_id_fkey" FOREIGN KEY ("zone_a_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_distances" ADD CONSTRAINT "zone_distances_zone_b_id_fkey" FOREIGN KEY ("zone_b_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_zone_id_fkey" FOREIGN KEY ("current_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_pickup_zone_id_fkey" FOREIGN KEY ("pickup_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pickup_zone_id_fkey" FOREIGN KEY ("pickup_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_dest_zone_id_fkey" FOREIGN KEY ("dest_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_ride_request_id_fkey" FOREIGN KEY ("ride_request_id") REFERENCES "ride_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Hand-written below: rules Prisma's schema language cannot express.
-- Kept in sync with docs/erd.md ("Constraints and indexes").
-- ============================================================

-- a Tesla has between 1 and 3 seats (assumption: Bullet has 3, so 3 is the max)
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_capacity_range"
  CHECK ("capacity" BETWEEN 1 AND 3);

-- capacity can never be exceeded, even by buggy code
ALTER TABLE "pools" ADD CONSTRAINT "pools_seats_within_capacity"
  CHECK ("seats_taken" >= 0 AND "seats_taken" <= "capacity");

-- one active pool per vehicle
CREATE UNIQUE INDEX "one_active_pool_per_vehicle"
  ON "pools" ("vehicle_id")
  WHERE "status" IN ('MATCHED', 'DRIVER_ARRIVED', 'STARTED');

-- one active ride per passenger (also blocks double-submit)
CREATE UNIQUE INDEX "one_active_request_per_passenger"
  ON "ride_requests" ("passenger_id")
  WHERE "status" IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED');

ALTER TABLE "ride_requests" ADD CONSTRAINT "pickup_differs_from_dest"
  CHECK ("pickup_zone_id" <> "dest_zone_id");
ALTER TABLE "ride_requests" ADD CONSTRAINT "seats_positive"
  CHECK ("seats" >= 1);
ALTER TABLE "ride_requests" ADD CONSTRAINT "fares_non_negative"
  CHECK (
    "base_fare" >= 0 AND "distance_charge" >= 0
    AND "est_solo_fare" >= 0 AND "est_pooled_fare" >= 0
    AND COALESCE("pool_discount", 0) >= 0 AND COALESCE("final_fare", 0) >= 0
  );

-- each zone pair is stored once, smaller id first
ALTER TABLE "zone_adjacency" ADD CONSTRAINT "adjacency_ordered"
  CHECK ("zone_a_id" < "zone_b_id");
ALTER TABLE "zone_distances" ADD CONSTRAINT "distances_ordered"
  CHECK ("zone_a_id" < "zone_b_id");
ALTER TABLE "zone_distances" ADD CONSTRAINT "distance_positive"
  CHECK ("distance_m" > 0);
