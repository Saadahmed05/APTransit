# 19 · Seed data

**Status: LOCKED.** Owner: Dev B. Implemented in `apps/api/prisma/seed.ts` (Day 2), deterministic (fixed random seed `20260923`), idempotent (upsert by `code`).

All coordinates are approximate. All bus registrations, staff names and fares are **demo values**, not official data. Town names are real so the demo feels familiar. District list is a subset, see [18](18-open-decisions.md) I2.

## State (D-034)

One `states` row: Andhra Pradesh, code `AP`, fixed id `stateap000000000000000000`, bounds `[76.7, 12.6, 84.8, 19.95]`, centre `[78, 16]`, zoom 7. Every district below belongs to it. Pass types and the TRANSPORT_OFFICER and STATE_ADMIN demo roles carry the AP state.

`pnpm db:seed --with-tg` adds a Telangana stub to prove a new state is only data: state `TG` (bounds `[77.23, 15.83, 81.33, 19.92]`, centre `[79.3, 17.9]`), districts `TG-HYD` Hyderabad and `TG-WGL` Hanumakonda, bus stands `TG-MGBS` and `TG-HNK`, depots `D-TG-HYD` and `D-TG-WGL` (no buses, routes or trips), and `admin.tg@aptransit.test` as STATE_ADMIN of TG. Demo data, not operations data.

## Districts (subset)

| Code | English | తెలుగు |
| --- | --- | --- |
| KNL | Kurnool | కర్నూలు |
| NDL | Nandyal | నంద్యాల |
| ATP | Anantapuramu | అనంతపురం |
| KDP | YSR Kadapa | వైఎస్ఆర్ కడప |
| TPT | Tirupati | తిరుపతి |
| PKM | Prakasam | ప్రకాశం |
| PLN | Palnadu | పల్నాడు |
| GNT | Guntur | గుంటూరు |
| NTR | NTR | ఎన్టీఆర్ |
| VSP | Visakhapatnam | విశాఖపట్నం |

## Stops and bus stands

| Code | English | తెలుగు | District | Lat, Lng | Bus stand |
| --- | --- | --- | --- | --- | --- |
| KNL | Kurnool Bus Stand | కర్నూలు బస్ స్టాండ్ | KNL | 15.8281, 78.0373 | yes |
| ORV | Orvakal | ఓర్వకల్లు | KNL | 15.6700, 78.1100 | |
| DHN | Dhone | డోన్ | NDL | 15.3960, 77.8720 | yes |
| PNY | Panyam | పాణ్యం | NDL | 15.5260, 78.3390 | |
| NDL | Nandyal Bus Stand | నంద్యాల బస్ స్టాండ్ | NDL | 15.4786, 78.4836 | yes |
| AGD | Allagadda | ఆళ్లగడ్డ | NDL | 15.1310, 78.5130 | |
| GDL | Giddalur | గిద్దలూరు | PKM | 15.3789, 78.9265 | |
| MKP | Markapur | మార్కాపురం | PKM | 15.7353, 79.2698 | yes |
| VKD | Vinukonda | వినుకొండ | PLN | 16.0529, 79.7394 | |
| NRT | Narasaraopet | నరసరావుపేట | PLN | 16.2350, 80.0480 | yes |
| GNT | Guntur Bus Stand | గుంటూరు బస్ స్టాండ్ | GNT | 16.3067, 80.4365 | yes |
| MGL | Mangalagiri | మంగళగిరి | GNT | 16.4300, 80.5680 | |
| VJA | Vijayawada PNBS | విజయవాడ పీఎన్‌బీఎస్ | NTR | 16.5097, 80.6197 | yes |
| GTY | Gooty | గుత్తి | ATP | 15.1210, 77.6340 | |
| ATP | Anantapur Bus Stand | అనంతపురం బస్ స్టాండ్ | ATP | 14.6819, 77.6006 | yes |
| MDK | Mydukur | మైదుకూరు | KDP | 14.7280, 78.7400 | |
| KDP | Kadapa Bus Stand | కడప బస్ స్టాండ్ | KDP | 14.4673, 78.8242 | yes |
| RJP | Rajampet | రాజంపేట | KDP | 14.1900, 79.1600 | |
| RGT | Renigunta | రేణిగుంట | TPT | 13.6360, 79.5120 | |
| TPT | Tirupati Bus Stand | తిరుపతి బస్ స్టాండ్ | TPT | 13.6288, 79.4192 | yes |
| DWK | Dwaraka Bus Station | ద్వారకా బస్ స్టేషన్ | VSP | 17.7240, 83.3050 | yes |
| MDP | Maddilapalem | మద్దిలపాలెం | VSP | 17.7380, 83.3200 | |
| HNW | Hanumanthawaka | హనుమంతవాక | VSP | 17.7560, 83.3220 | |
| SMC | Simhachalam | సింహాచలం | VSP | 17.7660, 83.2500 | |

## Depots

| Code | Name | District | Bus stand | Buses |
| --- | --- | --- | --- | --- |
| D-KNL | Kurnool depot | KNL | KNL | 24 |
| D-NDL | Nandyal depot | NDL | NDL | 8 |
| D-ATP | Anantapur depot | ATP | ATP | 6 |
| D-TPT | Tirupati depot | TPT | TPT | 6 |
| D-VJA | Vijayawada depot | NTR | VJA | 8 |
| D-VSP | Visakhapatnam depot | VSP | DWK | 8 |

## Routes (km from origin / minutes from origin)

| Code | Name | Depot | Stops |
| --- | --- | --- | --- |
| KNL-VJA-01 | Kurnool to Vijayawada | D-KNL | KNL 0/0, NDL 70/75, GDL 130/145, MKP 190/205, VKD 245/260, NRT 285/290, GNT 330/320, VJA 365/340 |
| KNL-TPT-01 | Kurnool to Tirupati | D-KNL | KNL 0/0, NDL 70/75, AGD 115/120, MDK 160/170, KDP 200/215, RJP 255/275, RGT 320/345, TPT 330/360 |
| KNL-ATP-01 | Kurnool to Anantapur | D-KNL | KNL 0/0, DHN 55/65, GTY 105/120, ATP 150/180 |
| KNL-NDL-01 | Kurnool to Nandyal | D-KNL | KNL 0/0, ORV 20/30, PNY 45/60, NDL 70/95 |
| VJA-GNT-01 | Vijayawada to Guntur | D-VJA | VJA 0/0, MGL 15/30, GNT 35/60 |
| VSP-SMC-01 | Dwaraka to Simhachalam | D-VSP | DWK 0/0, MDP 3/12, HNW 6/20, SMC 15/40 |

Every route also has its reverse (`...-02`) with mirrored stops. Polylines: straight segments between stops are fine for the MVP (encode with the Google polyline algorithm). Nicer road geometry is a Phase 2 task.

### v3 additions (D-042)

- Districts ELR (Eluru) and EGD (East Godavari). Stops ELR (Eluru Bus Stand), RJY (Rajamahendravaram Bus Stand), ANK (Anakapalli, village stop, VSP district).
- Long journey route VJA-VSP-01 Vijayawada to Visakhapatnam (D-VJA): VJA 0 / 0, ELR 60 / 75, RJY 150 / 190, ANK 315 / 390, DWK 350 / 435. Reverse VSP-VJA-02. Departures 07:00 Ultra Deluxe, 21:00 Garuda AC, 22:30 Super Luxury (overnight, arrives next day).
- Pass types: Day Pass 150 rupees, Zone Day Pass 60 rupees (zone), Zone Monthly Pass 900 rupees (zone), plus Weekly, Monthly and Free travel. Zone passes are valid on Pallevelugu, Ultra Pallevelugu and City Ordinary.
- `qr.periodSec` setting is 3.

## Bus types and demo fares

| Service type | Layout | Seats | AC | Free travel | Per km (paise) | Min fare | Reservation fee |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PALLEVELUGU | 3+2, 11 rows + 5 | 60 | no | yes | 110 | ₹10 | ₹0 |
| ULTRA_PALLEVELUGU | 3+2, 11 rows + 5 | 60 | no | yes | 120 | ₹10 | ₹0 |
| CITY_ORDINARY | 3+2, 9 rows + 5 | 50 | no | yes | 100 | ₹10 | ₹0 |
| METRO_EXPRESS | 2+2, 10 rows | 40 | no | yes | 130 | ₹15 | ₹0 |
| EXPRESS | 2+2, 11 rows | 44 | no | yes | 140 | ₹20 | ₹30 |
| ULTRA_DELUXE | 2+2, 10 rows | 40 | no | no | 160 | ₹30 | ₹30 |
| SUPER_LUXURY | 2+2, 9 rows + 4 | 40 | no | no | 180 | ₹40 | ₹30 |
| INDRA_AC | 2+2, 10 rows | 40 | yes | no | 210 | ₹50 | ₹30 |
| AMARAVATI_AC | 2+2, 11 rows | 44 | yes | no | 250 | ₹60 | ₹30 |
| GARUDA_AC | 2+2, 11 rows | 44 | yes | no | 270 | ₹60 | ₹30 |

Example: Kurnool to Vijayawada, Express, 365 km: 365 x ₹1.40 = ₹511 + ₹30 = **₹541**. Fare is always computed by `fare.ts`, rounded to the nearest rupee.

## Timetables

| Route | Departures (IST) | Service types |
| --- | --- | --- |
| KNL-VJA-01 | 05:30, 06:30, 08:00, 10:00, 13:00, 21:30 | Express, Express, Super Luxury, Express, Ultra Deluxe, Amaravati AC |
| KNL-TPT-01 | 06:00, 09:00, 21:00 | Express, Super Luxury, Indra AC |
| KNL-ATP-01 | Every 60 min 05:00 to 20:00 | Alternating Pallevelugu and Express |
| KNL-NDL-01 | Every 30 min 05:00 to 21:00 | Pallevelugu, every 4th Ultra Pallevelugu |
| VJA-GNT-01 | Every 15 min 05:30 to 22:00 | Metro Express |
| VSP-SMC-01 | Every 10 min 05:30 to 22:30 | City Ordinary |
| Reverse routes | Same pattern, offset by 30 min | Same |

All run every day (`daysMask` 127). Trips generated for today minus 14 days to today plus 7 days.

## Pass types (D-036, DEMO prices)

| Kind | Price | Validity | Group | Notes |
| --- | --- | --- | --- | --- |
| DAY | 12,000 paise | until 23:59:59 IST of activation day | 1 | |
| WEEKLY | 45,000 paise | 7 days | 1 | |
| MONTHLY | 160,000 paise | 30 days | 1 | |
| FAMILY | 100,000 paise | 7 days | 4 | |
| SCHOOL | 60,000 paise | 30 days | 1 | scheme STUDENT, route restricted |
| ANNUAL | 1,500,000 paise | 365 days | 1 | |
| FREE_TRAVEL | 0 | 365 days | 1 | scheme STREE_SHAKTI, not a demo price |

All paid types have `isDemo = true` and are sold on the five standard services. The seed upserts by kind, so reseeding resets demo prices.

## Buses and staff

- Registrations: `AP 39 Z 0101` to `AP 39 Z 0160` style, fictional. Assigned by depot and type so every timetable can be covered.
- Kurnool depot: 24 buses, 24 drivers, 24 conductors, 2 depot staff, 1 manager. Other depots: drivers and conductors equal to buses.
- Statuses today: about 85 percent RUNNING or IDLE by schedule, 2 in MAINTENANCE, 1 BREAKDOWN (with an open incident) at Kurnool so the dashboard has something to show.
- Driver names are common Telugu names, generated from a fixed list, clearly demo.

## History (for analytics and dashboards)

Generated for the last 14 days with the fixed random seed:

- Trips: 97 percent COMPLETED, 3 percent CANCELLED. Delays: mostly 0 to 10 min, evening (17:00 to 20:00) trips on KNL-VJA and VJA-GNT get 10 to 30 min (so the delay insight in plan sec 39 shows a real pattern).
- Tickets: load factor 40 to 95 percent, higher in mornings and evenings (demand bands, sec 38), weekends higher on KNL-TPT.
- 200 synthetic citizens (`citizen+NNN@aptransit.test`), 30 active weekly passes, 20 monthly, 60 free travel passes with scans.
- 25 complaints across categories and statuses.
- 12 incidents across types, all resolved except the one open breakdown.
- `daily_stats` rolled up for all 14 days.

## Demo accounts

See [08-roles-permissions.md](08-roles-permissions.md). Plus two approved driver devices with fixed keys printed by the seed script for the simulator.

## Commands

```bash
pnpm db:seed                 # base data + today and next 7 days
pnpm db:seed --history 14    # also 14 days of history (used on staging)
pnpm db:seed --with-tg       # also the Telangana stub (D-034)
pnpm db:reset                # drop, migrate, seed (local only)
```
