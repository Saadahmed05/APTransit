-- CreateIndex
CREATE INDEX "maintenance_records_busId_startAt_idx" ON "maintenance_records"("busId", "startAt");

-- CreateIndex
CREATE INDEX "trip_assignments_tripId_idx" ON "trip_assignments"("tripId");

-- CreateIndex
CREATE INDEX "trip_assignments_busId_startedAt_idx" ON "trip_assignments"("busId", "startedAt");

-- CreateIndex
CREATE INDEX "incidents_tripId_idx" ON "incidents"("tripId");

-- CreateIndex
CREATE INDEX "bookings_tripId_idx" ON "bookings"("tripId");

-- CreateIndex
CREATE INDEX "booking_passengers_bookingId_idx" ON "booking_passengers"("bookingId");

-- CreateIndex
CREATE INDEX "tickets_bookingId_idx" ON "tickets"("bookingId");

-- CreateIndex
CREATE INDEX "tickets_passengerId_idx" ON "tickets"("passengerId");

-- CreateIndex
CREATE INDEX "ticket_scans_tripId_scannedAt_idx" ON "ticket_scans"("tripId", "scannedAt");

-- CreateIndex
CREATE INDEX "ticket_scans_ticketId_idx" ON "ticket_scans"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_scans_passId_idx" ON "ticket_scans"("passId");

-- CreateIndex
CREATE INDEX "ticket_transfers_ticketId_idx" ON "ticket_transfers"("ticketId");

-- CreateIndex
CREATE INDEX "payments_bookingId_idx" ON "payments"("bookingId");

-- CreateIndex
CREATE INDEX "payments_passId_idx" ON "payments"("passId");

-- CreateIndex
CREATE INDEX "refunds_paymentId_idx" ON "refunds"("paymentId");

-- CreateIndex
CREATE INDEX "refunds_ticketId_idx" ON "refunds"("ticketId");

-- CreateIndex
CREATE INDEX "complaints_depotId_createdAt_idx" ON "complaints"("depotId", "createdAt");

-- CreateIndex
CREATE INDEX "daily_stats_date_routeId_idx" ON "daily_stats"("date", "routeId");

