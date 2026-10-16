-- D-048: one trip per timetable and service date. Trip codes now carry the service type, so two
-- services can leave a route at the same minute; this index keeps old and new codes from doubling.
CREATE UNIQUE INDEX "trips_timetableId_serviceDate_key" ON "trips"("timetableId", "serviceDate");
