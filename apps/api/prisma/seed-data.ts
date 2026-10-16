import { LOCAL_ROUTE_MAX_KM } from "@aptransit/shared";

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
  // D-046: Kurnool landmarks and nearby towns (positions from OpenStreetMap)
  {
    code: "KRS",
    nameEn: "Kurnool City Railway Station",
    nameTe: "కర్నూలు సిటీ రైల్వే స్టేషన్",
    districtCode: "KNL",
    lat: 15.8326,
    lng: 78.0326,
    isBusStand: false,
  },
  {
    code: "JYM",
    nameEn: "Jyothi Mall",
    nameTe: "జ్యోతి మాల్",
    districtCode: "KNL",
    lat: 15.8304,
    lng: 78.0403,
    isBusStand: false,
  },
  {
    code: "CHM",
    nameEn: "Chandana Bros Shopping Mall",
    nameTe: "చందన బ్రదర్స్ షాపింగ్ మాల్",
    districtCode: "KNL",
    lat: 15.8297,
    lng: 78.0397,
    isBusStand: false,
  },
  {
    code: "JGM",
    nameEn: "Jagdeesh Mall",
    nameTe: "జగదీష్ మాల్",
    districtCode: "KNL",
    lat: 15.8069,
    lng: 78.0393,
    isBusStand: false,
  },
  // Owner supplied Google Maps pins (2026-10-16)
  {
    code: "CSM",
    nameEn: "TGV Anantha City Square Mall",
    nameTe: "టిజివి అనంత సిటీ స్క్వేర్ మాల్",
    districtCode: "KNL",
    lat: 15.826733,
    lng: 78.0352714,
    isBusStand: false,
  },
  {
    code: "PRT",
    nameEn: "Skandhanshi Prithvi",
    nameTe: "స్కందన్షి పృథ్వి",
    districtCode: "KNL",
    lat: 15.8303874,
    lng: 78.0361676,
    isBusStand: false,
  },
  {
    code: "KMC",
    nameEn: "Kurnool Medical College",
    nameTe: "కర్నూలు మెడికల్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.8198,
    lng: 78.0378,
    isBusStand: false,
  },
  {
    code: "OSU",
    nameEn: "Osmania College",
    nameTe: "ఉస్మానియా కాలేజ్",
    districtCode: "KNL",
    lat: 15.8264,
    lng: 78.0475,
    isBusStand: false,
  },
  {
    code: "GPR",
    nameEn: "G Pulla Reddy Engineering College",
    nameTe: "జి పుల్లారెడ్డి ఇంజనీరింగ్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.775,
    lng: 78.0571,
    isBusStand: false,
  },
  {
    code: "GPC",
    nameEn: "G Pullaiah College of Engineering and Technology",
    nameTe: "జి పుల్లయ్య ఇంజనీరింగ్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.797,
    lng: 78.0775,
    isBusStand: false,
  },
  {
    code: "KDM",
    nameEn: "Kodumur",
    nameTe: "కోడుమూరు",
    districtCode: "KNL",
    lat: 15.6832,
    lng: 77.772,
    isBusStand: false,
  },
  {
    code: "YMG",
    nameEn: "Yemmiganur",
    nameTe: "ఎమ్మిగనూరు",
    districtCode: "KNL",
    lat: 15.7681,
    lng: 77.4819,
    isBusStand: false,
  },
  {
    code: "ADN",
    nameEn: "Adoni",
    nameTe: "ఆదోని",
    districtCode: "KNL",
    lat: 15.6261,
    lng: 77.2724,
    isBusStand: false,
  },
  {
    code: "NKR",
    nameEn: "Nandikotkur",
    nameTe: "నందికొట్కూరు",
    districtCode: "NDL",
    lat: 15.8562,
    lng: 78.27,
    isBusStand: false,
  },
  {
    code: "ATK",
    nameEn: "Atmakur",
    nameTe: "ఆత్మకూరు",
    districtCode: "NDL",
    lat: 15.9149,
    lng: 78.708,
    isBusStand: false,
  },
  {
    code: "BNP",
    nameEn: "Banaganapalle",
    nameTe: "బనగానపల్లె",
    districtCode: "NDL",
    lat: 15.3206,
    lng: 78.225,
    isBusStand: false,
  },
  // D-046: more Kurnool spots from OpenStreetMap (colleges, malls, hospitals, landmarks)
  {
    code: "SVC",
    nameEn: "S V Complex",
    nameTe: "ఎస్ వి కాంప్లెక్స్",
    districtCode: "KNL",
    lat: 15.8335,
    lng: 78.0396,
    isBusStand: false,
  },
  {
    code: "VCS",
    nameEn: "Variety Cine Shoppy",
    nameTe: "వెరైటీ సినీ షాపీ",
    districtCode: "KNL",
    lat: 15.8265,
    lng: 78.0354,
    isBusStand: false,
  },
  {
    code: "SKC",
    nameEn: "Skanda Chand Shopping Complex",
    nameTe: "స్కంద్ చంద్ షాపింగ్ కాంప్లెక్స్",
    districtCode: "KNL",
    lat: 15.8313,
    lng: 78.0472,
    isBusStand: false,
  },
  {
    code: "RWD",
    nameEn: "Ravider Women's Degree College",
    nameTe: "రవిదర్ మహిళా డిగ్రీ కాలేజ్",
    districtCode: "KNL",
    lat: 15.8034,
    lng: 78.0471,
    isBusStand: false,
  },
  {
    code: "MMJ",
    nameEn: "Master Minds Junior College",
    nameTe: "మాస్టర్ మైండ్స్ జూనియర్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.8017,
    lng: 78.0483,
    isBusStand: false,
  },
  {
    code: "GUJ",
    nameEn: "Government Urdu Junior College",
    nameTe: "ప్రభుత్వ ఉర్దూ జూనియర్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.8126,
    lng: 78.0247,
    isBusStand: false,
  },
  {
    code: "KWD",
    nameEn: "KVR Government Degree College for Women",
    nameTe: "కె.వి.ఆర్ ప్రభుత్వ మహిళా డిగ్రీ కాలేజ్",
    districtCode: "KNL",
    lat: 15.8307,
    lng: 78.0336,
    isBusStand: false,
  },
  {
    code: "GJC",
    nameEn: "Government Junior College",
    nameTe: "ప్రభుత్వ జూనియర్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.8326,
    lng: 78.0458,
    isBusStand: false,
  },
  {
    code: "COL",
    nameEn: "Coles College",
    nameTe: "కోల్స్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.8334,
    lng: 78.0466,
    isBusStand: false,
  },
  {
    code: "SJC",
    nameEn: "Saint Joseph's College",
    nameTe: "సెయింట్ జోసెఫ్స్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.8426,
    lng: 78.0344,
    isBusStand: false,
  },
  {
    code: "NJC",
    nameEn: "Narayana Junior College",
    nameTe: "నారాయణ జూనియర్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.8167,
    lng: 78.0336,
    isBusStand: false,
  },
  {
    code: "SJU",
    nameEn: "Silver Jubilee College",
    nameTe: "సిల్వర్ జూబ్లీ కాలేజ్",
    districtCode: "KNL",
    lat: 15.801,
    lng: 78.0393,
    isBusStand: false,
  },
  {
    code: "STB",
    nameEn: "STBC College",
    nameTe: "ఎస్.టి.బి.సి కాలేజ్",
    districtCode: "KNL",
    lat: 15.8335,
    lng: 78.0382,
    isBusStand: false,
  },
  {
    code: "GDM",
    nameEn: "Government Degree College for Men",
    nameTe: "ప్రభుత్వ పురుషుల డిగ్రీ కాలేజ్",
    districtCode: "KNL",
    lat: 15.7966,
    lng: 78.0439,
    isBusStand: false,
  },
  {
    code: "SSE",
    nameEn: "Sri Sankara's College of Education",
    nameTe: "శ్రీ శంకర్స్ కాలేజ్ ఆఫ్ ఎడ్యుకేషన్",
    districtCode: "KNL",
    lat: 15.799,
    lng: 78.0637,
    isBusStand: false,
  },
  {
    code: "RCW",
    nameEn: "Ravindra College of Engineering for Women",
    nameTe: "రవీంద్ర ఇంజనీరింగ్ కాలేజ్ ఫర్ ఉమెన్",
    districtCode: "KNL",
    lat: 15.7951,
    lng: 78.0773,
    isBusStand: false,
  },
  {
    code: "RCR",
    nameEn: "R C Reddy Degree College",
    nameTe: "ఆర్ సి రెడ్డి డిగ్రీ కాలేజ్",
    districtCode: "KNL",
    lat: 15.8051,
    lng: 78.0392,
    isBusStand: false,
  },
  {
    code: "GGH",
    nameEn: "Government General Hospital",
    nameTe: "ప్రభుత్వ సర్వజన ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.8186,
    lng: 78.0398,
    isBusStand: false,
  },
  {
    code: "KIM",
    nameEn: "KIMS Hospital",
    nameTe: "కిమ్స్ ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.8134,
    lng: 78.0572,
    isBusStand: false,
  },
  {
    code: "PCH",
    nameEn: "Padma Chandra Super Speciality Hospital",
    nameTe: "పద్మ చంద్ర సూపర్ స్పెషాలిటీ ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.8186,
    lng: 78.0405,
    isBusStand: false,
  },
  {
    code: "SVH",
    nameEn: "Sri Venkateswara Super Speciality Hospital",
    nameTe: "శ్రీ వెంకటేశ్వర సూపర్ స్పెషాలిటీ ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.8225,
    lng: 78.0287,
    isBusStand: false,
  },
  {
    code: "KMH",
    nameEn: "KM Hospital",
    nameTe: "కె.ఎం ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.8273,
    lng: 78.0477,
    isBusStand: false,
  },
  {
    code: "AMM",
    nameEn: "Amma Hospital",
    nameTe: "అమ్మ ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.8011,
    lng: 78.047,
    isBusStand: false,
  },
  {
    code: "SRY",
    nameEn: "Surya Hospital",
    nameTe: "సూర్య ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.815,
    lng: 78.0461,
    isBusStand: false,
  },
  {
    code: "OMN",
    nameEn: "Omni Hospitals",
    nameTe: "ఓమ్ని ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.8235,
    lng: 78.0414,
    isBusStand: false,
  },
  {
    code: "GVR",
    nameEn: "GVR Hospitals",
    nameTe: "జి.వి.ఆర్ ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.8358,
    lng: 78.0422,
    isBusStand: false,
  },
  {
    code: "SVD",
    nameEn: "Sri Vijaya Heart and Multi Speciality Centre",
    nameTe: "శ్రీ విజయ హార్ట్ అండ్ మల్టీ స్పెషాలిటీ సెంటర్",
    districtCode: "KNL",
    lat: 15.8213,
    lng: 78.0405,
    isBusStand: false,
  },
  {
    code: "SIM",
    nameEn: "Sanjeevani Institute of Medical Sciences",
    nameTe: "సంజీవని ఇన్స్టిట్యూట్ ఆఫ్ మెడికల్ సైన్సెస్",
    districtCode: "KNL",
    lat: 15.844,
    lng: 78.0258,
    isBusStand: false,
  },
  {
    code: "OCH",
    nameEn: "Omega Cancer Hospital",
    nameTe: "ఒమేగా క్యాన్సర్ ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.7957,
    lng: 78.0635,
    isBusStand: false,
  },
  {
    code: "KCH",
    nameEn: "Kasthuriranga Children's Hospital",
    nameTe: "కస్తూరిరంగ చిల్డ్రన్స్ ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.8283,
    lng: 78.037,
    isBusStand: false,
  },
  {
    code: "DTH",
    nameEn: "Deepak Tej Hospital",
    nameTe: "దీపక్ తేజ్ ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.8361,
    lng: 78.0369,
    isBusStand: false,
  },
  {
    code: "SNH",
    nameEn: "Siri Noble Hospital",
    nameTe: "సిరి నోబుల్ ఆసుపత్రి",
    districtCode: "KNL",
    lat: 15.8415,
    lng: 78.0331,
    isBusStand: false,
  },
  {
    code: "KRF",
    nameEn: "Konda Reddy Fort",
    nameTe: "కొండారెడ్డి బురుజు",
    districtCode: "KNL",
    lat: 15.8338,
    lng: 78.0487,
    isBusStand: false,
  },
  {
    code: "COC",
    nameEn: "Kurnool Collectorate",
    nameTe: "కర్నూలు కలెక్టరేట్",
    districtCode: "KNL",
    lat: 15.8178,
    lng: 78.0418,
    isBusStand: false,
  },
  {
    code: "BWB",
    nameEn: "Budhwarpet Bridge",
    nameTe: "బుధవారపేట బ్రిడ్జ్",
    districtCode: "KNL",
    lat: 15.8247,
    lng: 78.0474,
    isBusStand: false,
  },
  {
    code: "KLR",
    nameEn: "Kallur",
    nameTe: "కల్లూరు",
    districtCode: "KNL",
    lat: 15.7997,
    lng: 78.0317,
    isBusStand: false,
  },
  {
    code: "OBS",
    nameEn: "Kurnool Old Bus Stand",
    nameTe: "కర్నూలు పాత బస్ స్టాండ్",
    districtCode: "KNL",
    lat: 15.8332,
    lng: 78.0495,
    isBusStand: false,
  },
  // D-048: more Kurnool spots (parks, libraries, museums, stadiums, schools) with OpenStreetMap positions via Nominatim; Telugu names pending native review
  {
    code: "MYK",
    nameEn: "Market Yard Kurnool",
    nameTe: "మార్కెట్ యార్డ్ కర్నూలు",
    districtCode: "KNL",
    lat: 15.8266024,
    lng: 78.0293132,
    isBusStand: false,
  },
  {
    code: "AMK",
    nameEn: "Archaeological Museum Kurnool",
    nameTe: "కర్నూలు పురావస్తు ప్రదర్శనశాల",
    districtCode: "KNL",
    lat: 15.8245997,
    lng: 78.0393986,
    isBusStand: false,
  },
  {
    code: "DSM",
    nameEn: "District Science Museum",
    nameTe: "జిల్లా సైన్స్ మ్యూజియం",
    districtCode: "KNL",
    lat: 15.8328365,
    lng: 78.0424751,
    isBusStand: false,
  },
  {
    code: "DLK",
    nameEn: "District Library Kurnool",
    nameTe: "జిల్లా గ్రంథాలయం కర్నూలు",
    districtCode: "KNL",
    lat: 15.8344103,
    lng: 78.0499956,
    isBusStand: false,
  },
  {
    code: "RUV",
    nameEn: "Rayalseema University",
    nameTe: "రాయలసీమ విశ్వవిద్యాలయం",
    districtCode: "KNL",
    lat: 15.7746175,
    lng: 78.0635015,
    isBusStand: false,
  },
  {
    code: "CLB",
    nameEn: "Central Library",
    nameTe: "సెంట్రల్ లైబ్రరీ",
    districtCode: "KNL",
    lat: 15.7735997,
    lng: 78.0568431,
    isBusStand: false,
  },
  {
    code: "CCP",
    nameEn: "CSI Compound Children's Park",
    nameTe: "సీఎస్ఐ కాంపౌండ్ చిల్డ్రన్స్ పార్క్",
    districtCode: "KNL",
    lat: 15.8336278,
    lng: 78.0414822,
    isBusStand: false,
  },
  {
    code: "DCP",
    nameEn: "Doctors Colony Park",
    nameTe: "డాక్టర్స్ కాలనీ పార్క్",
    districtCode: "KNL",
    lat: 15.7959309,
    lng: 78.0413284,
    isBusStand: false,
  },
  {
    code: "RCP",
    nameEn: "Revenue Colony Park",
    nameTe: "రెవెన్యూ కాలనీ పార్క్",
    districtCode: "KNL",
    lat: 15.8046712,
    lng: 78.0482959,
    isBusStand: false,
  },
  {
    code: "GPK",
    nameEn: "Government Park",
    nameTe: "గవర్నమెంట్ పార్క్",
    districtCode: "KNL",
    lat: 15.7940524,
    lng: 78.038585,
    isBusStand: false,
  },
  {
    code: "MMP",
    nameEn: "Maruti Mega City Park",
    nameTe: "మారుతి మెగా సిటీ పార్క్",
    districtCode: "KNL",
    lat: 15.7851259,
    lng: 78.0579642,
    isBusStand: false,
  },
  {
    code: "RST",
    nameEn: "Sri Raghavendra Swamy Temple Park",
    nameTe: "శ్రీ రాఘవేంద్ర స్వామి టెంపుల్ పార్క్",
    districtCode: "KNL",
    lat: 15.7728833,
    lng: 78.0465315,
    isBusStand: false,
  },
  {
    code: "VGP",
    nameEn: "Vinayaka Ghat Park",
    nameTe: "వినాయక ఘాట్ పార్క్",
    districtCode: "KNL",
    lat: 15.8149114,
    lng: 78.0404343,
    isBusStand: false,
  },
  {
    code: "RGP",
    nameEn: "Rajiv Gandhi Park",
    nameTe: "రాజీవ్ గాంధీ పార్క్",
    districtCode: "KNL",
    lat: 15.835953,
    lng: 78.0237088,
    isBusStand: false,
  },
  {
    code: "MNP",
    nameEn: "Madhav Nagar Park",
    nameTe: "మాధవ నగర్ పార్క్",
    districtCode: "KNL",
    lat: 15.8001842,
    lng: 78.0467626,
    isBusStand: false,
  },
  {
    code: "KVP",
    nameEn: "KVR Park",
    nameTe: "కేవీఆర్ పార్క్",
    districtCode: "KNL",
    lat: 15.8278652,
    lng: 78.0464105,
    isBusStand: false,
  },
  {
    code: "KMP",
    nameEn: "KMC Park",
    nameTe: "కేఎంసీ పార్క్",
    districtCode: "KNL",
    lat: 15.7938536,
    lng: 78.0556886,
    isBusStand: false,
  },
  {
    code: "KNP",
    nameEn: "Kisan Nagar Park",
    nameTe: "కిసాన్ నగర్ పార్క్",
    districtCode: "KNL",
    lat: 15.7952577,
    lng: 78.0452816,
    isBusStand: false,
  },
  {
    code: "TGP",
    nameEn: "TGV Park",
    nameTe: "టీజీవీ పార్క్",
    districtCode: "KNL",
    lat: 15.8413188,
    lng: 78.0423776,
    isBusStand: false,
  },
  {
    code: "TNP",
    nameEn: "Telecom Nagar Park",
    nameTe: "టెలికాం నగర్ పార్క్",
    districtCode: "KNL",
    lat: 15.7981132,
    lng: 78.0496189,
    isBusStand: false,
  },
  {
    code: "MMI",
    nameEn: "Municipal Mini Park",
    nameTe: "మున్సిపల్ మినీ పార్క్",
    districtCode: "KNL",
    lat: 15.8140433,
    lng: 78.0378573,
    isBusStand: false,
  },
  {
    code: "VCP",
    nameEn: "Venkataramana Colony Park",
    nameTe: "వెంకటరమణ కాలనీ పార్క్",
    districtCode: "KNL",
    lat: 15.8344245,
    lng: 78.0225184,
    isBusStand: false,
  },
  {
    code: "GPP",
    nameEn: "Government Public Park",
    nameTe: "గవర్నమెంట్ పబ్లిక్ పార్క్",
    districtCode: "KNL",
    lat: 15.8044473,
    lng: 78.0404372,
    isBusStand: false,
  },
  {
    code: "MPK",
    nameEn: "Municipal Park",
    nameTe: "మున్సిపల్ పార్క్",
    districtCode: "KNL",
    lat: 15.8035124,
    lng: 78.0498656,
    isBusStand: false,
  },
  {
    code: "VNP",
    nameEn: "KMC Venkatadri Nagar Park",
    nameTe: "కేఎంసీ వెంకటాద్రి నగర్ పార్క్",
    districtCode: "KNL",
    lat: 15.8334169,
    lng: 78.0199668,
    isBusStand: false,
  },
  {
    code: "DDP",
    nameEn: "Dinnedevarapadu Park",
    nameTe: "దిన్నెదేవరపాడు పార్క్",
    districtCode: "KNL",
    lat: 15.7705503,
    lng: 78.0368354,
    isBusStand: false,
  },
  {
    code: "TPC",
    nameEn: "Traffic Police Control Station",
    nameTe: "ట్రాఫిక్ పోలీస్ కంట్రోల్ స్టేషన్",
    districtCode: "KNL",
    lat: 15.8054805,
    lng: 78.0435232,
    isBusStand: false,
  },
  {
    code: "APS",
    nameEn: "Andhra Pradesh Special Police Force Station",
    nameTe: "ఆంధ్రప్రదేశ్ స్పెషల్ పోలీస్ ఫోర్స్ స్టేషన్",
    districtCode: "KNL",
    lat: 15.8294036,
    lng: 78.0193641,
    isBusStand: false,
  },
  {
    code: "IPO",
    nameEn: "Indian Post Office",
    nameTe: "ఇండియన్ పోస్ట్ ఆఫీస్",
    districtCode: "KNL",
    lat: 15.8328522,
    lng: 78.0477819,
    isBusStand: false,
  },
  {
    code: "SPO",
    nameEn: "SAP Camp Post Office",
    nameTe: "ఎస్ఏపీ క్యాంప్ పోస్ట్ ఆఫీస్",
    districtCode: "KNL",
    lat: 15.8260561,
    lng: 78.0225339,
    isBusStand: false,
  },
  {
    code: "COS",
    nameEn: "Kurnool City Outdoor Stadium",
    nameTe: "కర్నూలు సిటీ అవుట్‌డోర్ స్టేడియం",
    districtCode: "KNL",
    lat: 15.8354125,
    lng: 78.0396398,
    isBusStand: false,
  },
  {
    code: "TVI",
    nameEn: "Sri TG Venkatesh Indoor Stadium",
    nameTe: "శ్రీ టీజీ వెంకటేష్ ఇండోర్ స్టేడియం",
    districtCode: "KNL",
    lat: 15.7731145,
    lng: 78.0604865,
    isBusStand: false,
  },
  {
    code: "INS",
    nameEn: "Indoor Stadium",
    nameTe: "ఇండోర్ స్టేడియం",
    districtCode: "KNL",
    lat: 15.8318737,
    lng: 78.0441129,
    isBusStand: false,
  },
  {
    code: "SGP",
    nameEn: "SGPR Government Polytechnic College",
    nameTe: "ఎస్‌జీపీఆర్ ప్రభుత్వ పాలిటెక్నిక్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.7705168,
    lng: 78.0644377,
    isBusStand: false,
  },
  {
    code: "CSC",
    nameEn: "CSI Church",
    nameTe: "సీఎస్ఐ చర్చి",
    districtCode: "KNL",
    lat: 15.8323837,
    lng: 78.0419054,
    isBusStand: false,
  },
  {
    code: "GCN",
    nameEn: "Government College of Nursing",
    nameTe: "ప్రభుత్వ నర్సింగ్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.8236352,
    lng: 78.0378711,
    isBusStand: false,
  },
  {
    code: "SGC",
    nameEn: "Sri Gayatri College",
    nameTe: "శ్రీ గాయత్రి కాలేజ్",
    districtCode: "KNL",
    lat: 15.7729712,
    lng: 78.0576297,
    isBusStand: false,
  },
  {
    code: "STM",
    nameEn: "Saint Mary College",
    nameTe: "సెయింట్ మేరీ కాలేజ్",
    districtCode: "KNL",
    lat: 15.7761869,
    lng: 78.0596546,
    isBusStand: false,
  },
  {
    code: "CVR",
    nameEn: "C V Raman Junior College",
    nameTe: "సి వి రామన్ జూనియర్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.8245829,
    lng: 78.0316505,
    isBusStand: false,
  },
  {
    code: "SCG",
    nameEn: "Sri Chaitanya Girls Junior College",
    nameTe: "శ్రీ చైతన్య గర్ల్స్ జూనియర్ కాలేజ్",
    districtCode: "KNL",
    lat: 15.7726069,
    lng: 78.0259055,
    isBusStand: false,
  },
  {
    code: "SJG",
    nameEn: "St Joseph's Junior College for Girls",
    nameTe: "సెయింట్ జోసెఫ్స్ జూనియర్ కాలేజ్ ఫర్ గర్ల్స్",
    districtCode: "KNL",
    lat: 15.7950414,
    lng: 78.0675141,
    isBusStand: false,
  },
  {
    code: "HJW",
    nameEn: "Hajira Junior College for Women",
    nameTe: "హాజిరా జూనియర్ కాలేజ్ ఫర్ ఉమెన్",
    districtCode: "KNL",
    lat: 15.8266721,
    lng: 78.0471293,
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
    // Guntur into Palnadu: local, express, super express and luxury buses
    code: "GNT-VKD-01",
    reverseCode: "VKD-GNT-02",
    nameEn: "Guntur to Vinukonda",
    reverseNameEn: "Vinukonda to Guntur",
    nameTe: "గుంటూరు నుండి వినుకొండ",
    reverseNameTe: "వినుకొండ నుండి గుంటూరు",
    depotCode: "D-VJA",
    stops: [
      { stopCode: "GNT", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "NRT", kmFromOrigin: 47, minutesFromOrigin: 75 },
      { stopCode: "VKD", kmFromOrigin: 92, minutesFromOrigin: 150 },
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
  // D-046: local only routes. Pallevelugu never runs further than LOCAL_ROUTE_MAX_KM.
  {
    code: "KNL-ADN-01",
    reverseCode: "ADN-KNL-02",
    nameEn: "Kurnool to Adoni",
    reverseNameEn: "Adoni to Kurnool",
    nameTe: "కర్నూలు నుండి ఆదోని",
    reverseNameTe: "ఆదోని నుండి కర్నూలు",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "KDM", kmFromOrigin: 42.4, minutesFromOrigin: 58 },
      { stopCode: "YMG", kmFromOrigin: 84.6, minutesFromOrigin: 116 },
      { stopCode: "ADN", kmFromOrigin: 120.3, minutesFromOrigin: 165 },
    ],
  },
  {
    code: "KNL-ATK-01",
    reverseCode: "ATK-KNL-02",
    nameEn: "Kurnool to Atmakur",
    reverseNameEn: "Atmakur to Kurnool",
    nameTe: "కర్నూలు నుండి ఆత్మకూరు",
    reverseNameTe: "ఆత్మకూరు నుండి కర్నూలు",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "NKR", kmFromOrigin: 32.6, minutesFromOrigin: 45 },
      { stopCode: "ATK", kmFromOrigin: 94.1, minutesFromOrigin: 128 },
    ],
  },
  {
    code: "DHN-NDL-01",
    reverseCode: "NDL-DHN-02",
    nameEn: "Dhone to Nandyal",
    reverseNameEn: "Nandyal to Dhone",
    nameTe: "డోన్ నుండి నంద్యాల",
    reverseNameTe: "నంద్యాల నుండి డోన్",
    depotCode: "D-NDL",
    stops: [
      { stopCode: "DHN", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "BNP", kmFromOrigin: 50.4, minutesFromOrigin: 69 },
      { stopCode: "NDL", kmFromOrigin: 93.1, minutesFromOrigin: 127 },
    ],
  },
  // D-046: Kurnool city lines between the malls and colleges (OpenStreetMap positions)
  {
    code: "KCM-01",
    reverseCode: "MKC-02",
    nameEn: "Kurnool malls line",
    reverseNameEn: "Kurnool malls line, return",
    nameTe: "కర్నూలు మాల్స్ లైన్",
    reverseNameTe: "కర్నూలు మాల్స్ లైన్, తిరుగు ప్రయాణం",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "PRT", kmFromOrigin: 0.5, minutesFromOrigin: 2 },
      { stopCode: "CSM", kmFromOrigin: 0.9, minutesFromOrigin: 3 },
      { stopCode: "VCS", kmFromOrigin: 1.0, minutesFromOrigin: 4 },
      { stopCode: "CHM", kmFromOrigin: 1.1, minutesFromOrigin: 5 },
      { stopCode: "JYM", kmFromOrigin: 1.2, minutesFromOrigin: 7 },
      { stopCode: "SVC", kmFromOrigin: 1.5, minutesFromOrigin: 8 },
      { stopCode: "SKC", kmFromOrigin: 1.8, minutesFromOrigin: 10 },
      { stopCode: "KRS", kmFromOrigin: 2.0, minutesFromOrigin: 13 },
    ],
  },
  {
    code: "KCC-01",
    reverseCode: "CCK-02",
    nameEn: "Kurnool colleges line",
    reverseNameEn: "Kurnool colleges line, return",
    nameTe: "కర్నూలు కాలేజీల లైన్",
    reverseNameTe: "కర్నూలు కాలేజీల లైన్, తిరుగు ప్రయాణం",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "KMC", kmFromOrigin: 1.2, minutesFromOrigin: 6 },
      { stopCode: "OSU", kmFromOrigin: 2.9, minutesFromOrigin: 13 },
      { stopCode: "RWD", kmFromOrigin: 4, minutesFromOrigin: 16 },
      { stopCode: "MMJ", kmFromOrigin: 4.3, minutesFromOrigin: 17 },
      { stopCode: "SSE", kmFromOrigin: 5.8, minutesFromOrigin: 22 },
      { stopCode: "JGM", kmFromOrigin: 5.9, minutesFromOrigin: 24 },
      { stopCode: "GPR", kmFromOrigin: 11.1, minutesFromOrigin: 40 },
      { stopCode: "GPC", kmFromOrigin: 15.4, minutesFromOrigin: 53 },
    ],
  },
  {
    code: "KHL-01",
    reverseCode: "LHK-02",
    nameEn: "Kurnool hospitals line",
    reverseNameEn: "Kurnool hospitals line, return",
    nameTe: "కర్నూలు ఆసుపత్రుల లైన్",
    reverseNameTe: "కర్నూలు ఆసుపత్రుల లైన్, తిరుగు ప్రయాణం",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "KCH", kmFromOrigin: 0.1, minutesFromOrigin: 2 },
      { stopCode: "SVD", kmFromOrigin: 1.1, minutesFromOrigin: 6 },
      { stopCode: "DTH", kmFromOrigin: 1.2, minutesFromOrigin: 7 },
      { stopCode: "GGH", kmFromOrigin: 1.4, minutesFromOrigin: 8 },
      { stopCode: "GVR", kmFromOrigin: 1.4, minutesFromOrigin: 9 },
      { stopCode: "PCH", kmFromOrigin: 1.5, minutesFromOrigin: 10 },
      { stopCode: "SNH", kmFromOrigin: 2.1, minutesFromOrigin: 11 },
      { stopCode: "SRY", kmFromOrigin: 2.3, minutesFromOrigin: 12 },
      { stopCode: "SIM", kmFromOrigin: 2.9, minutesFromOrigin: 13 },
      { stopCode: "KMH", kmFromOrigin: 3.1, minutesFromOrigin: 14 },
      { stopCode: "OMN", kmFromOrigin: 4.2, minutesFromOrigin: 18 },
      { stopCode: "AMM", kmFromOrigin: 4.3, minutesFromOrigin: 19 },
      { stopCode: "SVH", kmFromOrigin: 5.9, minutesFromOrigin: 25 },
      { stopCode: "OCH", kmFromOrigin: 6.2, minutesFromOrigin: 26 },
      { stopCode: "KIM", kmFromOrigin: 10.1, minutesFromOrigin: 37 },
    ],
  },
  {
    code: "KCL-01",
    reverseCode: "LCK-02",
    nameEn: "Kurnool colleges line 2",
    reverseNameEn: "Kurnool colleges line 2, return",
    nameTe: "కర్నూలు కాలేజీల లైన్ 2",
    reverseNameTe: "కర్నూలు కాలేజీల లైన్ 2, తిరుగు ప్రయాణం",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "KWD", kmFromOrigin: 0.7, minutesFromOrigin: 4 },
      { stopCode: "GJC", kmFromOrigin: 1.3, minutesFromOrigin: 5 },
      { stopCode: "COL", kmFromOrigin: 1.5, minutesFromOrigin: 8 },
      { stopCode: "NJC", kmFromOrigin: 1.8, minutesFromOrigin: 9 },
      { stopCode: "STB", kmFromOrigin: 2.7, minutesFromOrigin: 13 },
      { stopCode: "GUJ", kmFromOrigin: 3, minutesFromOrigin: 14 },
      { stopCode: "SJU", kmFromOrigin: 4.1, minutesFromOrigin: 16 },
      { stopCode: "SJC", kmFromOrigin: 4.1, minutesFromOrigin: 18 },
      { stopCode: "GDM", kmFromOrigin: 10.9, minutesFromOrigin: 37 },
      { stopCode: "RCR", kmFromOrigin: 12.3, minutesFromOrigin: 43 },
      { stopCode: "RCW", kmFromOrigin: 17.8, minutesFromOrigin: 58 },
    ],
  },
  {
    code: "KOT-01",
    reverseCode: "TOK-02",
    nameEn: "Kurnool old town line",
    reverseNameEn: "Kurnool old town line, return",
    nameTe: "కర్నూలు పాత పట్టణ లైన్",
    reverseNameTe: "కర్నూలు పాత పట్టణ లైన్, తిరుగు ప్రయాణం",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "OBS", kmFromOrigin: 1.8, minutesFromOrigin: 7 },
      { stopCode: "KRF", kmFromOrigin: 2.0, minutesFromOrigin: 9 },
      { stopCode: "BWB", kmFromOrigin: 3.3, minutesFromOrigin: 14 },
      { stopCode: "COC", kmFromOrigin: 4.6, minutesFromOrigin: 19 },
      { stopCode: "KLR", kmFromOrigin: 7.6, minutesFromOrigin: 29 },
    ],
  },
  {
    code: "KSA-01",
    reverseCode: "SAK-02",
    nameEn: "Kurnool spots line A",
    reverseNameEn: "Kurnool spots line A, return",
    nameTe: "కర్నూలు ప్రదేశాల లైన్ A",
    reverseNameTe: "కర్నూలు ప్రదేశాల లైన్ A, తిరుగు ప్రయాణం",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "GCN", kmFromOrigin: 0.7, minutesFromOrigin: 3 },
      { stopCode: "CVR", kmFromOrigin: 1.5, minutesFromOrigin: 7 },
      { stopCode: "MYK", kmFromOrigin: 2.0, minutesFromOrigin: 9 },
      { stopCode: "SPO", kmFromOrigin: 2.9, minutesFromOrigin: 13 },
      { stopCode: "MMI", kmFromOrigin: 5.7, minutesFromOrigin: 24 },
      { stopCode: "GPP", kmFromOrigin: 7.1, minutesFromOrigin: 30 },
      { stopCode: "DCP", kmFromOrigin: 8.3, minutesFromOrigin: 35 },
      { stopCode: "GPK", kmFromOrigin: 8.8, minutesFromOrigin: 37 },
      { stopCode: "RST", kmFromOrigin: 12.1, minutesFromOrigin: 50 },
      { stopCode: "DDP", kmFromOrigin: 13.4, minutesFromOrigin: 56 },
      { stopCode: "SCG", kmFromOrigin: 15.0, minutesFromOrigin: 62 },
    ],
  },
  {
    code: "KSB-01",
    reverseCode: "SBK-02",
    nameEn: "Kurnool spots line B",
    reverseNameEn: "Kurnool spots line B, return",
    nameTe: "కర్నూలు ప్రదేశాల లైన్ B",
    reverseNameTe: "కర్నూలు ప్రదేశాల లైన్ B, తిరుగు ప్రయాణం",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "VGP", kmFromOrigin: 2.0, minutesFromOrigin: 8 },
      { stopCode: "TPC", kmFromOrigin: 3.4, minutesFromOrigin: 14 },
      { stopCode: "RCP", kmFromOrigin: 4.1, minutesFromOrigin: 17 },
      { stopCode: "MNP", kmFromOrigin: 4.7, minutesFromOrigin: 20 },
      { stopCode: "TNP", kmFromOrigin: 5.2, minutesFromOrigin: 22 },
      { stopCode: "KNP", kmFromOrigin: 6.0, minutesFromOrigin: 25 },
      { stopCode: "STM", kmFromOrigin: 9.4, minutesFromOrigin: 39 },
      { stopCode: "TVI", kmFromOrigin: 9.8, minutesFromOrigin: 41 },
      { stopCode: "SGC", kmFromOrigin: 10.2, minutesFromOrigin: 43 },
      { stopCode: "CLB", kmFromOrigin: 10.4, minutesFromOrigin: 45 },
      { stopCode: "SGP", kmFromOrigin: 11.6, minutesFromOrigin: 50 },
    ],
  },
  {
    code: "KSC-01",
    reverseCode: "SCK-02",
    nameEn: "Kurnool spots line C",
    reverseNameEn: "Kurnool spots line C, return",
    nameTe: "కర్నూలు ప్రదేశాల లైన్ C",
    reverseNameTe: "కర్నూలు ప్రదేశాల లైన్ C, తిరుగు ప్రయాణం",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "AMK", kmFromOrigin: 0.6, minutesFromOrigin: 2 },
      { stopCode: "KVP", kmFromOrigin: 1.7, minutesFromOrigin: 6 },
      { stopCode: "HJW", kmFromOrigin: 1.9, minutesFromOrigin: 8 },
      { stopCode: "INS", kmFromOrigin: 2.7, minutesFromOrigin: 11 },
      { stopCode: "IPO", kmFromOrigin: 3.3, minutesFromOrigin: 13 },
      { stopCode: "DLK", kmFromOrigin: 3.6, minutesFromOrigin: 15 },
      { stopCode: "MPK", kmFromOrigin: 8.1, minutesFromOrigin: 33 },
      { stopCode: "KMP", kmFromOrigin: 9.7, minutesFromOrigin: 39 },
      { stopCode: "MMP", kmFromOrigin: 11.0, minutesFromOrigin: 44 },
      { stopCode: "RUV", kmFromOrigin: 12.7, minutesFromOrigin: 51 },
      { stopCode: "SJG", kmFromOrigin: 15.7, minutesFromOrigin: 63 },
    ],
  },
  {
    code: "KSD-01",
    reverseCode: "SDK-02",
    nameEn: "Kurnool spots line D",
    reverseNameEn: "Kurnool spots line D, return",
    nameTe: "కర్నూలు ప్రదేశాల లైన్ D",
    reverseNameTe: "కర్నూలు ప్రదేశాల లైన్ D, తిరుగు ప్రయాణం",
    depotCode: "D-KNL",
    stops: [
      { stopCode: "KNL", kmFromOrigin: 0, minutesFromOrigin: 0 },
      { stopCode: "CSC", kmFromOrigin: 0.9, minutesFromOrigin: 4 },
      { stopCode: "DSM", kmFromOrigin: 1.1, minutesFromOrigin: 6 },
      { stopCode: "CCP", kmFromOrigin: 1.3, minutesFromOrigin: 8 },
      { stopCode: "COS", kmFromOrigin: 1.7, minutesFromOrigin: 10 },
      { stopCode: "TGP", kmFromOrigin: 2.6, minutesFromOrigin: 14 },
      { stopCode: "RGP", kmFromOrigin: 5.3, minutesFromOrigin: 25 },
      { stopCode: "VCP", kmFromOrigin: 5.6, minutesFromOrigin: 27 },
      { stopCode: "VNP", kmFromOrigin: 6.0, minutesFromOrigin: 29 },
      { stopCode: "APS", kmFromOrigin: 6.5, minutesFromOrigin: 31 },
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

/** Route length in km (the last stop's distance from the origin). */
function routeKm(code: string): number {
  const route = ROUTE_DEFS.find((r) => r.code === code);
  if (!route) throw new Error(`Unknown route ${code}`);
  return route.stops[route.stops.length - 1]!.kmFromOrigin;
}

type Departure = [string, BusTypeSeed["serviceType"]];

/** D-048: intercity and town routes run every class every hour, 05:00 to 23:00. */
const SERVICE_HOURS = everyMinutes("05:00", "23:00", 60);
/** AC sleepers and seaters take the Super Luxury slot on the long runs from 20:00 (A). */
const NIGHT_AC: Record<string, BusTypeSeed["serviceType"]> = {
  "KNL-VJA-01": "AMARAVATI_AC",
  "KNL-TPT-01": "INDRA_AC",
  "VJA-VSP-01": "GARUDA_AC",
};

/**
 * D-048 (owner, 2026-10-16): every hour an Express, an Ultra Deluxe (super express) and a Super
 * Luxury bus. Routes up to LOCAL_ROUTE_MAX_KM (130) also have Pallevelugu (local), every 30 min
 * like other local buses (every fourth an Ultra Pallevelugu).
 */
function hourlyClasses(routeCode: string): Departure[] {
  const km = routeKm(routeCode);
  const departures: Departure[] = [];
  SERVICE_HOURS.forEach((t) => {
    departures.push([t, "EXPRESS"]);
    departures.push([t, "ULTRA_DELUXE"]);
    departures.push([t, toMinutes(t) >= toMinutes("20:00") ? (NIGHT_AC[routeCode] ?? "SUPER_LUXURY") : "SUPER_LUXURY"]);
  });
  if (km <= LOCAL_ROUTE_MAX_KM) {
    everyMinutes("05:00", "23:00", 30).forEach((t, i) =>
      departures.push([t, i % 4 === 3 ? "ULTRA_PALLEVELUGU" : "PALLEVELUGU"]),
    );
  }
  return departures;
}

const INTERCITY: [string, string][] = [
  ["KNL-VJA-01", "VJA-KNL-02"],
  ["KNL-TPT-01", "TPT-KNL-02"],
  ["KNL-ATP-01", "ATP-KNL-02"],
  ["KNL-NDL-01", "NDL-KNL-02"],
  ["VJA-VSP-01", "VSP-VJA-02"],
  ["KNL-ADN-01", "ADN-KNL-02"],
  ["KNL-ATK-01", "ATK-KNL-02"],
  ["DHN-NDL-01", "NDL-DHN-02"],
  ["GNT-VKD-01", "VKD-GNT-02"],
];

const FORWARD_TIMETABLES: {
  routeCode: string;
  reverseCode: string;
  departures: Departure[];
}[] = [
  ...INTERCITY.map(([routeCode, reverseCode]) => ({ routeCode, reverseCode, departures: hourlyClasses(routeCode) })),
  {
    routeCode: "VJA-GNT-01",
    reverseCode: "GNT-VJA-02",
    // Metro Express every 15 min is the Express class here; Super Luxury hourly and Pallevelugu every 30 min join it
    departures: [
      ...everyMinutes("05:30", "22:00", 15).map((t): Departure => [t, "METRO_EXPRESS"]),
      ...SERVICE_HOURS.map((t): Departure => [t, "EXPRESS"]),
      ...SERVICE_HOURS.map((t): Departure => [t, "ULTRA_DELUXE"]),
      ...SERVICE_HOURS.map((t): Departure => [t, "SUPER_LUXURY"]),
      ...everyMinutes("05:00", "23:00", 30).map((t, i): Departure => [t, i % 4 === 3 ? "ULTRA_PALLEVELUGU" : "PALLEVELUGU"]),
    ],
  },
  {
    routeCode: "VSP-SMC-01",
    reverseCode: "SMC-VSP-02",
    departures: everyMinutes("05:30", "22:30", 10).map((t) => [t, "CITY_ORDINARY"]),
  },
  // Kurnool city lines (D-046, D-048): local buses at least every 30 min, 05:00 to 23:00
  ...(
    [
      ["KCM-01", "MKC-02", 20],
      ["KCC-01", "CCK-02", 20],
      ["KHL-01", "LHK-02", 30],
      ["KCL-01", "LCK-02", 30],
      ["KOT-01", "TOK-02", 30],
      ["KSA-01", "SAK-02", 30],
      ["KSB-01", "SBK-02", 30],
      ["KSC-01", "SCK-02", 30],
      ["KSD-01", "SDK-02", 30],
    ] as const
  ).map(([routeCode, reverseCode, step]) => ({
    routeCode,
    reverseCode,
    departures: everyMinutes("05:00", "23:00", step).map((t): Departure => [t, "CITY_ORDINARY"]),
  })),
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
