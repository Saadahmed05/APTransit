export interface StateSeed {
  /** Fixed for AP so the backfill migration and the seed agree; new states get a generated id. */
  id?: string;
  code: string;
  nameEn: string;
  nameTe: string;
  codePrefix: string;
  /** [minLng, minLat, maxLng, maxLat] */
  bounds: [number, number, number, number];
  center: { lat: number; lng: number };
  zoom: number;
}

/** Same id as migration 20261009000100_states_backfill_ap (D-034). */
export const AP_STATE_ID = "stateap000000000000000000";

export const AP_STATE: StateSeed = {
  id: AP_STATE_ID,
  code: "AP",
  nameEn: "Andhra Pradesh",
  nameTe: "ఆంధ్రప్రదేశ్",
  codePrefix: "AP",
  bounds: [76.7, 12.6, 84.8, 19.95],
  center: { lat: 16, lng: 78 },
  zoom: 7,
};

export interface DistrictSeed {
  code: string;
  nameEn: string;
  nameTe: string;
}

export const DISTRICTS: DistrictSeed[] = [
  { code: "KNL", nameEn: "Kurnool", nameTe: "కర్నూలు" },
  { code: "NDL", nameEn: "Nandyal", nameTe: "నంద్యాల" },
  { code: "ATP", nameEn: "Anantapuramu", nameTe: "అనంతపురం" },
  { code: "KDP", nameEn: "YSR Kadapa", nameTe: "వైఎస్ఆర్ కడప" },
  { code: "TPT", nameEn: "Tirupati", nameTe: "తిరుపతి" },
  { code: "PKM", nameEn: "Prakasam", nameTe: "ప్రకాశం" },
  { code: "PLN", nameEn: "Palnadu", nameTe: "పల్నాడు" },
  { code: "GNT", nameEn: "Guntur", nameTe: "గుంటూరు" },
  { code: "NTR", nameEn: "NTR", nameTe: "ఎన్టీఆర్" },
  { code: "VSP", nameEn: "Visakhapatnam", nameTe: "విశాఖపట్నం" },
  // D-042: long journey corridor Vijayawada to Visakhapatnam
  { code: "ELR", nameEn: "Eluru", nameTe: "ఏలూరు" },
  { code: "EGD", nameEn: "East Godavari", nameTe: "తూర్పు గోదావరి" },
];

export interface StopSeed {
  code: string;
  nameEn: string;
  nameTe: string;
  districtCode: string;
  lat: number;
  lng: number;
  isBusStand: boolean;
}

export const STOPS: StopSeed[] = [
  {
    code: "KNL",
    nameEn: "Kurnool Bus Stand",
    nameTe: "కర్నూలు బస్ స్టాండ్",
    districtCode: "KNL",
    lat: 15.8281,
    lng: 78.0373,
    isBusStand: true,
  },
  {
    code: "ORV",
    nameEn: "Orvakal",
    nameTe: "ఓర్వకల్లు",
    districtCode: "KNL",
    lat: 15.67,
    lng: 78.11,
    isBusStand: false,
  },
  {
    code: "DHN",
    nameEn: "Dhone",
    nameTe: "డోన్",
    districtCode: "NDL",
    lat: 15.396,
    lng: 77.872,
    isBusStand: true,
  },
  {
    code: "PNY",
    nameEn: "Panyam",
    nameTe: "పాణ్యం",
    districtCode: "NDL",
    lat: 15.526,
    lng: 78.339,
    isBusStand: false,
  },
  {
    code: "NDL",
    nameEn: "Nandyal Bus Stand",
    nameTe: "నంద్యాల బస్ స్టాండ్",
    districtCode: "NDL",
    lat: 15.4786,
    lng: 78.4836,
    isBusStand: true,
  },
  {
    code: "AGD",
    nameEn: "Allagadda",
    nameTe: "ఆళ్లగడ్డ",
    districtCode: "NDL",
    lat: 15.131,
    lng: 78.513,
    isBusStand: false,
  },
  {
    code: "GDL",
    nameEn: "Giddalur",
    nameTe: "గిద్దలూరు",
    districtCode: "PKM",
    lat: 15.3789,
    lng: 78.9265,
    isBusStand: false,
  },
  {
    code: "MKP",
    nameEn: "Markapur",
    nameTe: "మార్కాపురం",
    districtCode: "PKM",
    lat: 15.7353,
    lng: 79.2698,
    isBusStand: true,
  },
  {
    code: "VKD",
    nameEn: "Vinukonda",
    nameTe: "వినుకొండ",
    districtCode: "PLN",
    lat: 16.0529,
    lng: 79.7394,
    isBusStand: false,
  },
  {
    code: "NRT",
    nameEn: "Narasaraopet",
    nameTe: "నరసరావుపేట",
    districtCode: "PLN",
    lat: 16.235,
    lng: 80.048,
    isBusStand: true,
  },
  {
    code: "GNT",
    nameEn: "Guntur Bus Stand",
    nameTe: "గుంటూరు బస్ స్టాండ్",
    districtCode: "GNT",
    lat: 16.3067,
    lng: 80.4365,
    isBusStand: true,
  },
  {
    code: "MGL",
    nameEn: "Mangalagiri",
    nameTe: "మంగళగిరి",
    districtCode: "GNT",
    lat: 16.43,
    lng: 80.568,
    isBusStand: false,
  },
  {
    code: "VJA",
    nameEn: "Vijayawada PNBS",
    nameTe: "విజయవాడ పీఎన్‌బీఎస్",
    districtCode: "NTR",
    lat: 16.5097,
    lng: 80.6197,
    isBusStand: true,
  },
  {
    code: "GTY",
    nameEn: "Gooty",
    nameTe: "గుత్తి",
    districtCode: "ATP",
    lat: 15.121,
    lng: 77.634,
    isBusStand: false,
  },
  {
    code: "ATP",
    nameEn: "Anantapur Bus Stand",
    nameTe: "అనంతపురం బస్ స్టాండ్",
    districtCode: "ATP",
    lat: 14.6819,
    lng: 77.6006,
    isBusStand: true,
  },
  {
    code: "MDK",
    nameEn: "Mydukur",
    nameTe: "మైదుకూరు",
    districtCode: "KDP",
    lat: 14.728,
    lng: 78.74,
    isBusStand: false,
  },
  {
    code: "KDP",
    nameEn: "Kadapa Bus Stand",
    nameTe: "కడప బస్ స్టాండ్",
    districtCode: "KDP",
    lat: 14.4673,
    lng: 78.8242,
    isBusStand: true,
  },
  {
    code: "RJP",
    nameEn: "Rajampet",
    nameTe: "రాజంపేట",
    districtCode: "KDP",
    lat: 14.19,
    lng: 79.16,
    isBusStand: false,
  },
  {
    code: "RGT",
    nameEn: "Renigunta",
    nameTe: "రేణిగుంట",
    districtCode: "TPT",
    lat: 13.636,
    lng: 79.512,
    isBusStand: false,
  },
  {
    code: "TPT",
    nameEn: "Tirupati Bus Stand",
    nameTe: "తిరుపతి బస్ స్టాండ్",
    districtCode: "TPT",
    lat: 13.6288,
    lng: 79.4192,
    isBusStand: true,
  },
  {
    code: "DWK",
    nameEn: "Dwaraka Bus Station",
    nameTe: "ద్వారకా బస్ స్టేషన్",
    districtCode: "VSP",
    lat: 17.724,
    lng: 83.305,
    isBusStand: true,
  },
  {
    code: "MDP",
    nameEn: "Maddilapalem",
    nameTe: "మద్దిలపాలెం",
    districtCode: "VSP",
    lat: 17.738,
    lng: 83.32,
    isBusStand: false,
  },
  {
    code: "HNW",
    nameEn: "Hanumanthawaka",
    nameTe: "హనుమంతవాక",
    districtCode: "VSP",
    lat: 17.756,
    lng: 83.322,
    isBusStand: false,
  },
  {
    code: "ELR",
    nameEn: "Eluru Bus Stand",
    nameTe: "ఏలూరు బస్ స్టాండ్",
    districtCode: "ELR",
    lat: 16.7107,
    lng: 81.0952,
    isBusStand: true,
  },
  {
    code: "RJY",
    nameEn: "Rajamahendravaram Bus Stand",
    nameTe: "రాజమహేంద్రవరం బస్ స్టాండ్",
    districtCode: "EGD",
    lat: 17.0005,
    lng: 81.804,
    isBusStand: true,
  },
  {
    code: "ANK",
    nameEn: "Anakapalli",
    nameTe: "అనకాపల్లి",
    districtCode: "VSP",
    lat: 17.6913,
    lng: 83.0039,
    isBusStand: false,
  },
  {
    code: "SMC",
    nameEn: "Simhachalam",
    nameTe: "సింహాచలం",
    districtCode: "VSP",
    lat: 17.766,
    lng: 83.25,
    isBusStand: false,
  },
];

export interface DepotSeed {
  code: string;
  nameEn: string;
  nameTe: string;
  districtCode: string;
  busStandCode: string;
  busCount: number;
}

export const DEPOTS: DepotSeed[] = [
  {
    code: "D-KNL",
    nameEn: "Kurnool depot",
    nameTe: "కర్నూలు డిపో",
    districtCode: "KNL",
    busStandCode: "KNL",
    busCount: 24,
  },
  {
    code: "D-NDL",
    nameEn: "Nandyal depot",
    nameTe: "నంద్యాల డిపో",
    districtCode: "NDL",
    busStandCode: "NDL",
    busCount: 8,
  },
  {
    code: "D-ATP",
    nameEn: "Anantapur depot",
    nameTe: "అనంతపురం డిపో",
    districtCode: "ATP",
    busStandCode: "ATP",
    busCount: 6,
  },
  {
    code: "D-TPT",
    nameEn: "Tirupati depot",
    nameTe: "తిరుపతి డిపో",
    districtCode: "TPT",
    busStandCode: "TPT",
    busCount: 6,
  },
  {
    code: "D-VJA",
    nameEn: "Vijayawada depot",
    nameTe: "విజయవాడ డిపో",
    districtCode: "NTR",
    busStandCode: "VJA",
    busCount: 8,
  },
  {
    code: "D-VSP",
    nameEn: "Visakhapatnam depot",
    nameTe: "విశాఖపట్నం డిపో",
    districtCode: "VSP",
    busStandCode: "DWK",
    busCount: 8,
  },
];

export interface RouteStopDef {
  stopCode: string;
  kmFromOrigin: number;
  minutesFromOrigin: number;
}

export interface RouteSeedDef {
  code: string;
  reverseCode: string;
  nameEn: string;
  reverseNameEn: string;
  nameTe: string;
  reverseNameTe: string;
  depotCode: string;
  stops: RouteStopDef[];
}

export const ROUTE_DEFS: RouteSeedDef[] = [
  {
    code: "KNL-VJA-01",
    reverseCode: "VJA-KNL-02",
    nameEn: "Kurnool to Vijayawada",
    reverseNameEn: "Vijayawada to Kurnool",
    nameTe: "కర్నూలు నుండి విజయవాడ",
    reverseNameTe: "విజయవాడ నుండి కర్నూలు",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "NDL", kmFromOrigin: 70, minutesFromOrigin: 75 },
      { stopCode: "GDL", kmFromOrigin: 130, minutesFromOrigin: 145 },
      { stopCode: "MKP", kmFromOrigin: 190, minutesFromOrigin: 205 },
      { stopCode: "VKD", kmFromOrigin: 245, minutesFromOrigin: 260 },
      { stopCode: "NRT", kmFromOrigin: 285, minutesFromOrigin: 290 },
      { stopCode: "GNT", kmFromOrigin: 330, minutesFromOrigin: 320 },
      { stopCode: "VJA", kmFromOrigin: 365, minutesFromOrigin: 340 },
    ],
  },
  {
    code: "KNL-TPT-01",
    reverseCode: "TPT-KNL-02",
    nameEn: "Kurnool to Tirupati",
    reverseNameEn: "Tirupati to Kurnool",
    nameTe: "కర్నూలు నుండి తిరుపతి",
    reverseNameTe: "తిరుపతి నుండి కర్నూలు",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "NDL", kmFromOrigin: 70, minutesFromOrigin: 75 },
      { stopCode: "AGD", kmFromOrigin: 115, minutesFromOrigin: 120 },
      { stopCode: "MDK", kmFromOrigin: 160, minutesFromOrigin: 170 },
      { stopCode: "KDP", kmFromOrigin: 200, minutesFromOrigin: 215 },
      { stopCode: "RJP", kmFromOrigin: 255, minutesFromOrigin: 275 },
      { stopCode: "RGT", kmFromOrigin: 320, minutesFromOrigin: 345 },
      { stopCode: "TPT", kmFromOrigin: 330, minutesFromOrigin: 360 },
    ],
  },
  {
    code: "KNL-ATP-01",
    reverseCode: "ATP-KNL-02",
    nameEn: "Kurnool to Anantapur",
    reverseNameEn: "Anantapur to Kurnool",
    nameTe: "కర్నూలు నుండి అనంతపురం",
    reverseNameTe: "అనంతపురం నుండి కర్నూలు",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "DHN", kmFromOrigin: 55, minutesFromOrigin: 65 },
      { stopCode: "GTY", kmFromOrigin: 105, minutesFromOrigin: 120 },
      { stopCode: "ATP", kmFromOrigin: 150, minutesFromOrigin: 180 },
    ],
  },
  {
    code: "KNL-NDL-01",
    reverseCode: "NDL-KNL-02",
    nameEn: "Kurnool to Nandyal",
    reverseNameEn: "Nandyal to Kurnool",
    nameTe: "కర్నూలు నుండి నంద్యాల",
    reverseNameTe: "నంద్యాల నుండి కర్నూలు",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "ORV", kmFromOrigin: 20, minutesFromOrigin: 30 },
      { stopCode: "PNY", kmFromOrigin: 45, minutesFromOrigin: 60 },
      { stopCode: "NDL", kmFromOrigin: 70, minutesFromOrigin: 95 },
    ],
  },
  {
    code: "VJA-GNT-01",
    reverseCode: "GNT-VJA-02",
    nameEn: "Vijayawada to Guntur",
    reverseNameEn: "Guntur to Vijayawada",
    nameTe: "విజయవాడ నుండి గుంటూరు",
    reverseNameTe: "గుంటూరు నుండి విజయవాడ",
    depotCode: "D-VJA",
    stops: [
      { stopCode: "VJA", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "MGL", kmFromOrigin: 15, minutesFromOrigin: 30 },
      { stopCode: "GNT", kmFromOrigin: 35, minutesFromOrigin: 60 },
    ],
  },
  {
    // D-042: long overnight journey (350 km)
    code: "VJA-VSP-01",
    reverseCode: "VSP-VJA-02",
    nameEn: "Vijayawada to Visakhapatnam",
    reverseNameEn: "Visakhapatnam to Vijayawada",
    nameTe: "విజయవాడ నుండి విశాఖపట్నం",
    reverseNameTe: "విశాఖపట్నం నుండి విజయవాడ",
    depotCode: "D-VJA",
    stops: [
      { stopCode: "VJA", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "ELR", kmFromOrigin: 60, minutesFromOrigin: 75 },
      { stopCode: "RJY", kmFromOrigin: 150, minutesFromOrigin: 190 },
      { stopCode: "ANK", kmFromOrigin: 315, minutesFromOrigin: 390 },
      { stopCode: "DWK", kmFromOrigin: 350, minutesFromOrigin: 435 },
    ],
  },
  {
    code: "VSP-SMC-01",
    reverseCode: "SMC-VSP-02",
    nameEn: "Dwaraka to Simhachalam",
    reverseNameEn: "Simhachalam to Dwaraka",
    nameTe: "ద్వారకా నుండి సింహాచలం",
    reverseNameTe: "సింహాచలం నుండి ద్వారకా",
    depotCode: "D-VSP",
    stops: [
      { stopCode: "DWK", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "MDP", kmFromOrigin: 3, minutesFromOrigin: 12 },
      { stopCode: "HNW", kmFromOrigin: 6, minutesFromOrigin: 20 },
      { stopCode: "SMC", kmFromOrigin: 15, minutesFromOrigin: 40 },
    ],
  },
];

export interface BusTypeSeed {
  serviceType:
    | "PALLEVELUGU"
    | "ULTRA_PALLEVELUGU"
    | "CITY_ORDINARY"
    | "METRO_EXPRESS"
    | "EXPRESS"
    | "ULTRA_DELUXE"
    | "SUPER_LUXURY"
    | "INDRA_AC"
    | "AMARAVATI_AC"
    | "GARUDA_AC";
  nameEn: string;
  nameTe: string;
  totalSeats: number;
  isAc: boolean;
  freeTravelEligible: boolean;
  perKmPaise: number;
  minFarePaise: number;
  reservationFeePaise: number;
  /** Flat part added before the per km fare. 0 for every demo type (docs/19 fares are per km with a minimum). */
  baseFarePaise: number;
  layout: {
    rows: number;
    columns: number;
    aisleIndex: number;
    labels: string[];
    blockedCells?: { row: number; col: number }[];
  };
}

function makeSeatLabels(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${i + 1}`);
}

export const BUS_TYPES: BusTypeSeed[] = [
  {
    serviceType: "PALLEVELUGU",
    nameEn: "Pallevelugu",
    nameTe: "పల్లెవెలుగు",
    totalSeats: 60,
    isAc: false,
    freeTravelEligible: true,
    perKmPaise: 110,
    minFarePaise: 1000,
    reservationFeePaise: 0,
    baseFarePaise: 0,
    layout: { rows: 12, columns: 5, aisleIndex: 3, labels: makeSeatLabels(60) },
  },
  {
    serviceType: "ULTRA_PALLEVELUGU",
    nameEn: "Ultra Pallevelugu",
    nameTe: "అల్ట్రా పల్లెవెలుగు",
    totalSeats: 60,
    isAc: false,
    freeTravelEligible: true,
    perKmPaise: 120,
    minFarePaise: 1000,
    reservationFeePaise: 0,
    baseFarePaise: 0,
    layout: { rows: 12, columns: 5, aisleIndex: 3, labels: makeSeatLabels(60) },
  },
  {
    serviceType: "CITY_ORDINARY",
    nameEn: "City Ordinary",
    nameTe: "సిటీ ఆర్డినరీ",
    totalSeats: 50,
    isAc: false,
    freeTravelEligible: true,
    perKmPaise: 100,
    minFarePaise: 1000,
    reservationFeePaise: 0,
    baseFarePaise: 0,
    layout: { rows: 10, columns: 5, aisleIndex: 3, labels: makeSeatLabels(50) },
  },
  {
    serviceType: "METRO_EXPRESS",
    nameEn: "Metro Express",
    nameTe: "మెట్రో ఎక్స్‌ప్రెస్",
    totalSeats: 40,
    isAc: false,
    freeTravelEligible: true,
    perKmPaise: 130,
    minFarePaise: 1500,
    reservationFeePaise: 0,
    baseFarePaise: 0,
    layout: { rows: 10, columns: 4, aisleIndex: 2, labels: makeSeatLabels(40) },
  },
  {
    serviceType: "EXPRESS",
    nameEn: "Express",
    nameTe: "ఎక్స్‌ప్రెస్",
    totalSeats: 44,
    isAc: false,
    freeTravelEligible: true,
    perKmPaise: 140,
    minFarePaise: 2000,
    reservationFeePaise: 3000,
    baseFarePaise: 0,
    layout: { rows: 11, columns: 4, aisleIndex: 2, labels: makeSeatLabels(44) },
  },
  {
    serviceType: "ULTRA_DELUXE",
    nameEn: "Ultra Deluxe",
    nameTe: "అల్ట్రా డీలక్స్",
    totalSeats: 40,
    isAc: false,
    freeTravelEligible: false,
    perKmPaise: 160,
    minFarePaise: 3000,
    reservationFeePaise: 3000,
    baseFarePaise: 0,
    layout: { rows: 10, columns: 4, aisleIndex: 2, labels: makeSeatLabels(40) },
  },
  {
    serviceType: "SUPER_LUXURY",
    nameEn: "Super Luxury",
    nameTe: "సూపర్ లగ్జరీ",
    totalSeats: 40,
    isAc: false,
    freeTravelEligible: false,
    perKmPaise: 180,
    minFarePaise: 4000,
    reservationFeePaise: 3000,
    baseFarePaise: 0,
    layout: { rows: 10, columns: 4, aisleIndex: 2, labels: makeSeatLabels(40) },
  },
  {
    serviceType: "INDRA_AC",
    nameEn: "Indra AC",
    nameTe: "ఇంద్ర ఏసీ",
    totalSeats: 40,
    isAc: true,
    freeTravelEligible: false,
    perKmPaise: 210,
    minFarePaise: 5000,
    reservationFeePaise: 3000,
    baseFarePaise: 0,
    layout: { rows: 10, columns: 4, aisleIndex: 2, labels: makeSeatLabels(40) },
  },
  {
    serviceType: "AMARAVATI_AC",
    nameEn: "Amaravati AC",
    nameTe: "అమరావతి ఏసీ",
    totalSeats: 44,
    isAc: true,
    freeTravelEligible: false,
    perKmPaise: 250,
    minFarePaise: 6000,
    reservationFeePaise: 3000,
    baseFarePaise: 0,
    layout: { rows: 11, columns: 4, aisleIndex: 2, labels: makeSeatLabels(44) },
  },
  {
    serviceType: "GARUDA_AC",
    nameEn: "Garuda AC",
    nameTe: "గరుడ ఏసీ",
    totalSeats: 44,
    isAc: true,
    freeTravelEligible: false,
    perKmPaise: 270,
    minFarePaise: 6000,
    reservationFeePaise: 3000,
    baseFarePaise: 0,
    layout: { rows: 11, columns: 4, aisleIndex: 2, labels: makeSeatLabels(44) },
  },
];

export interface TimetableSeedDef {
  routeCode: string;
  departureLocal: string;
  serviceType: BusTypeSeed["serviceType"];
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

function toHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
}

function everyMinutes(first: string, last: string, stepMin: number): string[] {
  const out: string[] = [];
  for (let t = toMinutes(first); t <= toMinutes(last); t += stepMin) out.push(toHhmm(t));
  return out;
}

const FORWARD_TIMETABLES: {
  routeCode: string;
  reverseCode: string;
  departures: [string, BusTypeSeed["serviceType"]][];
}[] = [
  {
    routeCode: "KNL-VJA-01",
    reverseCode: "VJA-KNL-02",
    departures: [
      ["05:30", "EXPRESS"],
      ["06:30", "EXPRESS"],
      ["08:00", "SUPER_LUXURY"],
      ["10:00", "EXPRESS"],
      ["13:00", "ULTRA_DELUXE"],
      ["21:30", "AMARAVATI_AC"],
    ],
  },
  {
    routeCode: "KNL-TPT-01",
    reverseCode: "TPT-KNL-02",
    departures: [
      ["06:00", "EXPRESS"],
      ["09:00", "SUPER_LUXURY"],
      ["21:00", "INDRA_AC"],
    ],
  },
  {
    routeCode: "KNL-ATP-01",
    reverseCode: "ATP-KNL-02",
    departures: everyMinutes("05:00", "20:00", 60).map((t, i) => [
      t,
      i % 2 === 0 ? "PALLEVELUGU" : "EXPRESS",
    ]),
  },
  {
    routeCode: "KNL-NDL-01",
    reverseCode: "NDL-KNL-02",
    departures: everyMinutes("05:00", "21:00", 30).map((t, i) => [
      t,
      i % 4 === 3 ? "ULTRA_PALLEVELUGU" : "PALLEVELUGU",
    ]),
  },
  {
    routeCode: "VJA-GNT-01",
    reverseCode: "GNT-VJA-02",
    departures: everyMinutes("05:30", "22:00", 15).map((t) => [t, "METRO_EXPRESS"]),
  },
  {
    routeCode: "VJA-VSP-01",
    reverseCode: "VSP-VJA-02",
    departures: [
      ["07:00", "ULTRA_DELUXE"],
      ["21:00", "GARUDA_AC"],
      ["22:30", "SUPER_LUXURY"],
    ],
  },
  {
    routeCode: "VSP-SMC-01",
    reverseCode: "SMC-VSP-02",
    departures: everyMinutes("05:30", "22:30", 10).map((t) => [t, "CITY_ORDINARY"]),
  },
];

/** docs/19 "Timetables": forward departures, and the reverse route with the same pattern 30 min later. */
export const TIMETABLE_DEFS: TimetableSeedDef[] = FORWARD_TIMETABLES.flatMap(({ routeCode, reverseCode, departures }) => [
  ...departures.map(([departureLocal, serviceType]) => ({ routeCode, departureLocal, serviceType })),
  ...departures.map(([departureLocal, serviceType]) => ({
    routeCode: reverseCode,
    departureLocal: toHhmm(toMinutes(departureLocal) + 30),
    serviceType,
  })),
]);

/**
 * Telangana stub behind `pnpm db:seed --with-tg` (D-034): two districts, each with a bus stand and
 * a depot, and a state admin. It proves a new state needs only data. Not real operations data.
 */
export const TG_STATE: StateSeed = {
  code: "TG",
  nameEn: "Telangana",
  nameTe: "తెలంగాణ",
  codePrefix: "TG",
  bounds: [77.23, 15.83, 81.33, 19.92],
  center: { lat: 17.9, lng: 79.3 },
  zoom: 7,
};

export const TG_DISTRICTS: DistrictSeed[] = [
  { code: "TG-HYD", nameEn: "Hyderabad", nameTe: "హైదరాబాద్" },
  { code: "TG-WGL", nameEn: "Hanumakonda", nameTe: "హనుమకొండ" },
];

export const TG_STOPS: StopSeed[] = [
  { code: "TG-MGBS", nameEn: "Hyderabad MGBS", nameTe: "హైదరాబాద్ ఎంజీబీఎస్", districtCode: "TG-HYD", lat: 17.3786, lng: 78.4833, isBusStand: true },
  { code: "TG-HNK", nameEn: "Hanumakonda Bus Stand", nameTe: "హనుమకొండ బస్ స్టాండ్", districtCode: "TG-WGL", lat: 18.0072, lng: 79.5582, isBusStand: true },
];

export const TG_DEPOTS: DepotSeed[] = [
  { code: "D-TG-HYD", nameEn: "Hyderabad depot", nameTe: "హైదరాబాద్ డిపో", districtCode: "TG-HYD", busStandCode: "TG-MGBS", busCount: 0 },
  { code: "D-TG-WGL", nameEn: "Hanumakonda depot", nameTe: "హనుమకొండ డిపో", districtCode: "TG-WGL", busStandCode: "TG-HNK", busCount: 0 },
];
