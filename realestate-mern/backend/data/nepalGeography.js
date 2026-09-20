// Canonical Nepal administrative geography (version-controlled reference data).
//
// Hierarchy:
//
//   Province
//     -> District                       (controlled: validated strictly)
//     -> Municipality / Rural Municipality (controlled: validated strictly
//         wherever this file lists verified names for the district)
//
// Only names present in `municipalities` are accepted for districts that
// have a non-empty list. Districts with an empty list (Manang, Mustang,
// Humla, Rukum East, Rasuwa — genuinely without urban municipalities)
// accept any municipality value until verified names are added here.
// Adding names is a data-only change: validation (`backend/utils/nepalGeography.js`)
// and the frontend form pick them up automatically with no code changes.
//
// Property-specific location detail (ward, locality/tole, street address,
// nearby landmark, map coordinates) is deliberately NOT part of this file —
// those are flexible per-property strings, never reference data.

const PROVINCES = [
  { number: 1, name: 'Koshi Province' },
  { number: 2, name: 'Madhesh Province' },
  { number: 3, name: 'Bagmati Province' },
  { number: 4, name: 'Gandaki Province' },
  { number: 5, name: 'Lumbini Province' },
  { number: 6, name: 'Karnali Province' },
  { number: 7, name: 'Sudurpashchim Province' },
];

// { districtName: { province: <official province name>, municipalities: [...] } }
// `municipalities` holds ONLY verified Municipality / Sub-Metropolitan / Metropolitan
// names for the district.
const DISTRICTS = {
  // ---- Koshi Province ----
  Bhojpur: { province: 'Koshi Province', municipalities: ['Bhojpur', 'Shadananda'] },
  Dhankuta: { province: 'Koshi Province', municipalities: ['Dhankuta', 'Mahalaxmi', 'Pakhribas'] },
  Ilam: { province: 'Koshi Province', municipalities: ['Deumai', 'Ilam', 'Mai', 'Suryodaya'] },
  Jhapa: {
    province: 'Koshi Province',
    municipalities: ['Arjundhara', 'Bhadrapur', 'Birtamod', 'Damak', 'Gauradaha', 'Kankai', 'Mechinagar', 'Shivasatakshi'],
  },
  Khotang: { province: 'Koshi Province', municipalities: ['Diktel Rupakot Majhuwagadhi', 'Halesi Tuwachung'] },
  Morang: {
    province: 'Koshi Province',
    municipalities: ['Belbari', 'Biratnagar', 'Letang', 'Pathari Shanischare', 'Rangeli', 'Ratuwamai', 'Sundar Haraincha', 'Sunawarshi', 'Urlabari'],
  },
  Okhaldhunga: { province: 'Koshi Province', municipalities: ['Siddhicharan'] },
  Panchthar: { province: 'Koshi Province', municipalities: ['Phidim'] },
  Sankhuwasabha: {
    province: 'Koshi Province',
    municipalities: ['Chainpur', 'Dharmadevi', 'Khandbari', 'Madi', 'Panchkhapan'],
  },
  Solukhumbu: { province: 'Koshi Province', municipalities: ['Solu Dudhkunda'] },
  Sunsari: {
    province: 'Koshi Province',
    municipalities: ['Barahachhetra', 'Dharan', 'Duhabi', 'Inaruwa', 'Itahari', 'Ramdhuni'],
  },
  Taplejung: { province: 'Koshi Province', municipalities: ['Phungling'] },
  Terhathum: { province: 'Koshi Province', municipalities: ['Laligurans', 'Myanglung'] },
  Udayapur: { province: 'Koshi Province', municipalities: ['Belaka', 'Chaudandigadhi', 'Katari', 'Triyuga'] },

  // ---- Madhesh Province ----
  Bara: {
    province: 'Madhesh Province',
    municipalities: ['Jitpur-Simara', 'Kalaiya', 'Kolhabi', 'Mahagadhimai', 'Nijgadh', 'Pacharauta', 'Simraungadh'],
  },
  Dhanusha: {
    province: 'Madhesh Province',
    municipalities: ['Chhireshwarnath', 'Dhanushadham', 'Ganeshman Charanath', 'Hansapur', 'Janakpur', 'Kamala', 'Mithila', 'Mithila Bihari', 'Nagarain', 'Sabaila', 'Shahidnagar', 'Videha'],
  },
  Mahottari: {
    province: 'Madhesh Province',
    municipalities: ['Aurahi', 'Balawa', 'Bardibas', 'Bhangaha', 'Gaushala', 'Jaleshwar', 'Loharpatti', 'Manara Shiswa', 'Matihani', 'Ramgopalpur'],
  },
  Parsa: { province: 'Madhesh Province', municipalities: ['Bahudarmai', 'Birgunj', 'Parsagadhi', 'Pokhariya'] },
  Rautahat: {
    province: 'Madhesh Province',
    municipalities: ['Baudhimai', 'Brindaban', 'Chandrapur', 'Dewahi Gonahi', 'Gadhimai', 'Garuda', 'Gaur', 'Gujara', 'Ishnath', 'Katahariya', 'Madhav Narayan', 'Maulapur', 'Paroha', 'Phatuwa Bijayapur', 'Rajdevi', 'Rajpur'],
  },
  Saptari: {
    province: 'Madhesh Province',
    municipalities: ['Bodebarsain', 'Dakneshwari', 'Hanumannagar Kankalini', 'Kanchanrup', 'Khadak', 'Rajbiraj', 'Saptakoshi', 'Shambhunath', 'Surunga'],
  },
  Sarlahi: {
    province: 'Madhesh Province',
    municipalities: ['Bagmati', 'Balara', 'Barahathawa', 'Godaita', 'Hariwan', 'Haripur', 'Haripurwa', 'Ishwarpur', 'Kabilasi', 'Lalbandi', 'Malangwa'],
  },
  Siraha: {
    province: 'Madhesh Province',
    municipalities: ['Dhangadimai', 'Golbazar', 'Kalyanpur', 'Karjanha', 'Lahan', 'Mirchaiya', 'Siraha', 'Sukhipur'],
  },

  // ---- Bagmati Province ----
  Bhaktapur: {
    province: 'Bagmati Province',
    municipalities: ['Bhaktapur', 'Changunarayan', 'Madhyapur Thimi', 'Suryabinayak'],
  },
  Chitwan: {
    province: 'Bagmati Province',
    municipalities: ['Bharatpur', 'Kalika', 'Khairhani', 'Madi', 'Ratnanagar', 'Rapti'],
  },
  Dhading: { province: 'Bagmati Province', municipalities: ['Dhunibeshi', 'Nilkantha'] },
  Dolakha: { province: 'Bagmati Province', municipalities: ['Bhimeshwar', 'Jiri'] },
  Kathmandu: {
    province: 'Bagmati Province',
    municipalities: ['Budhanilkantha', 'Chandragiri', 'Dakshinkali', 'Gokarneshwar', 'Kageshwari-Manohara', 'Kathmandu', 'Kirtipur', 'Nagarjun', 'Shankharapur', 'Tarakeshwar', 'Tokha'],
  },
  Kavrepalanchok: {
    province: 'Bagmati Province',
    municipalities: ['Banepa', 'Dhulikhel', 'Mandan Deupur', 'Namobuddha', 'Panchkhal', 'Panauti'],
  },
  Lalitpur: { province: 'Bagmati Province', municipalities: ['Godawari', 'Lalitpur', 'Mahalaxmi'] },
  Makwanpur: { province: 'Bagmati Province', municipalities: ['Hetauda', 'Thaha'] },
  Nuwakot: { province: 'Bagmati Province', municipalities: ['Belkotgadhi', 'Bidur'] },
  Ramechhap: { province: 'Bagmati Province', municipalities: ['Manthali', 'Ramechhap'] },
  Rasuwa: { province: 'Bagmati Province', municipalities: [] },
  Sindhuli: { province: 'Bagmati Province', municipalities: ['Dudhauli', 'Kamalamai'] },
  Sindhupalchok: { province: 'Bagmati Province', municipalities: ['Barhabise', 'Chautara Sangachokgadhi', 'Melamchi'] },

  // ---- Gandaki Province ----
  Baglung: { province: 'Gandaki Province', municipalities: ['Baglung', 'Dhorpatan', 'Galkot', 'Jaimini'] },
  Gorkha: { province: 'Gandaki Province', municipalities: ['Gorkha', 'Palungtar'] },
  Kaski: { province: 'Gandaki Province', municipalities: ['Pokhara'] },
  Lamjung: { province: 'Gandaki Province', municipalities: ['Besisahar', 'Madhya Nepal', 'Rainas', 'Sundarbazar'] },
  Manang: { province: 'Gandaki Province', municipalities: [] },
  Mustang: { province: 'Gandaki Province', municipalities: [] },
  Myagdi: { province: 'Gandaki Province', municipalities: ['Beni'] },
  Nawalpur: { province: 'Gandaki Province', municipalities: ['Devchuli', 'Gaindakot', 'Kawasoti', 'Madhyabindu'] },
  Parbat: { province: 'Gandaki Province', municipalities: ['Kushma', 'Phalebas'] },
  Syangja: { province: 'Gandaki Province', municipalities: ['Bhirkot', 'Chapakot', 'Galyang', 'Putalibazar', 'Waling'] },
  Tanahun: { province: 'Gandaki Province', municipalities: ['Bhanu', 'Bhimad', 'Shuklagandaki', 'Vyas'] },

  // ---- Lumbini Province ----
  Arghakhanchi: { province: 'Lumbini Province', municipalities: ['Bhumikasthan', 'Sandhikharka', 'Sitganga'] },
  Banke: { province: 'Lumbini Province', municipalities: ['Nepalgunj', 'Kohalpur'] },
  Bardiya: {
    province: 'Lumbini Province',
    municipalities: ['Bansgadhi', 'Barbardiya', 'Gulariya', 'Madhuwan', 'Rajapur', 'Thakurbaba'],
  },
  Dang: { province: 'Lumbini Province', municipalities: ['Ghorahi', 'Lamahi', 'Tulsipur'] },
  Gulmi: { province: 'Lumbini Province', municipalities: ['Musikot', 'Resunga'] },
  Kapilvastu: {
    province: 'Lumbini Province',
    municipalities: ['Banganga', 'Buddhabhumi', 'Kapilvastu', 'Krishnanagar', 'Maharajganj', 'Shivaraj'],
  },
  Parasi: { province: 'Lumbini Province', municipalities: ['Bardaghat', 'Ramgram', 'Sunawal'] },
  Palpa: { province: 'Lumbini Province', municipalities: ['Rampur', 'Tansen'] },
  Pyuthan: { province: 'Lumbini Province', municipalities: ['Pyuthan', 'Swargadwari'] },
  Rolpa: { province: 'Lumbini Province', municipalities: ['Rolpa'] },
  'Rukum East': { province: 'Lumbini Province', municipalities: [] },
  Rupandehi: {
    province: 'Lumbini Province',
    municipalities: ['Butwal', 'Devdaha', 'Lumbini Sanskritik', 'Sainamaina', 'Siddharthanagar', 'Tilottama'],
  },

  // ---- Karnali Province ----
  Dailekh: { province: 'Karnali Province', municipalities: ['Aathabis', 'Chamunda Bindrasaini', 'Dullu', 'Narayan'] },
  Dolpa: { province: 'Karnali Province', municipalities: ['Thuli Bheri', 'Tripura Sundari'] },
  Humla: { province: 'Karnali Province', municipalities: [] },
  Jajarkot: { province: 'Karnali Province', municipalities: ['Bheri', 'Chhedagad', 'Nalgad'] },
  Jumla: { province: 'Karnali Province', municipalities: ['Chandannath'] },
  Kalikot: { province: 'Karnali Province', municipalities: ['Khandachakra', 'Raskot', 'Tilagupha'] },
  Mugu: { province: 'Karnali Province', municipalities: ['Chhayanath Rara'] },
  'Rukum West': { province: 'Karnali Province', municipalities: ['Aathabiskot', 'Chaurjahari', 'Musikot'] },
  Salyan: { province: 'Karnali Province', municipalities: ['Bagchaur', 'Bangad Kupinde', 'Sharada'] },
  Surkhet: {
    province: 'Karnali Province',
    municipalities: ['Bheriganga', 'Birendranagar', 'Gurbhakot', 'Lekbeshi', 'Panchapuri'],
  },

  // ---- Sudurpashchim Province ----
  Achham: {
    province: 'Sudurpashchim Province',
    municipalities: ['Kamalbazar', 'Mangalsen', 'Panchadewal Binayak', 'Sanphebagar'],
  },
  Baitadi: { province: 'Sudurpashchim Province', municipalities: ['Dasharathchand', 'Melauli', 'Patan', 'Purchaudi'] },
  Bajhang: { province: 'Sudurpashchim Province', municipalities: ['Bungal', 'Jaya Prithvi'] },
  Bajura: { province: 'Sudurpashchim Province', municipalities: ['Badimalika', 'Budhiganga', 'Budhinanda', 'Tribeni'] },
  Dadeldhura: { province: 'Sudurpashchim Province', municipalities: ['Amargadhi', 'Parshuram'] },
  Darchula: { province: 'Sudurpashchim Province', municipalities: ['Mahakali', 'Shailyashikhar'] },
  Kailali: {
    province: 'Sudurpashchim Province',
    municipalities: ['Bhajani', 'Dhangadhi', 'Gauriganga', 'Ghodaghodi', 'Godawari', 'Lamki Chuha', 'Tikapur'],
  },
  Kanchanpur: {
    province: 'Sudurpashchim Province',
    municipalities: ['Bedkot', 'Belauri', 'Bhimdatta', 'Dodhara Chandani', 'Krishnapur', 'Punarbas', 'Shuklaphanta'],
  },
  Doti: { province: 'Sudurpashchim Province', municipalities: ['Dipayal Silgadhi', 'Shikhar'] },
};

// Legacy seed-only data for the admin-curated District/City collections
// (NOT authoritative for property locations — use DISTRICTS above).
// NOTE: the legacy 'Kusma' spelling is kept here because existing City
// documents/seed data use it; the canonical municipalities list uses 'Kushma'.
const LEGACY_CITIES_BY_DISTRICT = {
  Bhojpur: ['Bhojpur'],
  Dhankuta: ['Dhankuta'],
  Ilam: ['Ilam', 'Mai'],
  Jhapa: ['Birtamod', 'Damak', 'Bhadrapur'],
  Khotang: ['Diktel'],
  Morang: ['Biratnagar', 'Urlabari'],
  Okhaldhunga: ['Okhaldhunga'],
  Panchthar: ['Phidim'],
  Sankhuwasabha: ['Khandbari'],
  Solukhumbu: ['Salleri'],
  Sunsari: ['Itahari', 'Dharan', 'Inaruwa'],
  Taplejung: ['Taplejung'],
  Terhathum: ['Myanglung'],
  Udayapur: ['Gaighat', 'Katari'],
  Bara: ['Kalaiya'],
  Dhanusha: ['Janakpur'],
  Mahottari: ['Jaleshwar'],
  Parsa: ['Birgunj'],
  Rautahat: ['Gaur'],
  Saptari: ['Rajbiraj'],
  Sarlahi: ['Malangwa'],
  Siraha: ['Siraha', 'Lahan'],
  Bhaktapur: ['Bhaktapur', 'Madhyapur Thimi'],
  Chitwan: ['Bharatpur', 'Ratnanagar'],
  Dhading: ['Dhading Besi'],
  Dolakha: ['Charikot'],
  Kathmandu: ['Kathmandu', 'Kirtipur'],
  Kavrepalanchok: ['Dhulikhel', 'Banepa'],
  Lalitpur: ['Lalitpur', 'Godawari'],
  Makwanpur: ['Hetauda'],
  Nuwakot: ['Bidur'],
  Ramechhap: ['Manthali'],
  Rasuwa: ['Dhunche'],
  Sindhuli: ['Sindhulimadi'],
  Sindhupalchok: ['Chautara'],
  Baglung: ['Baglung'],
  Gorkha: ['Gorkha'],
  Kaski: ['Pokhara'],
  Lamjung: ['Besisahar'],
  Manang: ['Chame'],
  Mustang: ['Jomsom'],
  Myagdi: ['Beni'],
  Nawalpur: ['Kawasoti'],
  Parbat: ['Kusma'],
  Syangja: ['Putalibazar', 'Waling'],
  Tanahun: ['Damauli'],
  Arghakhanchi: ['Sandhikharka'],
  Banke: ['Nepalgunj'],
  Bardiya: ['Gulariya'],
  Dang: ['Ghorahi', 'Tulsipur'],
  Gulmi: ['Tamghas'],
  Kapilvastu: ['Taulihawa'],
  Parasi: ['Ramgram'],
  Palpa: ['Tansen'],
  Pyuthan: ['Pyuthan'],
  Rolpa: ['Liwang'],
  'Rukum East': ['Rukumkot'],
  Rupandehi: ['Butwal', 'Siddharthanagar'],
  Dailekh: ['Dailekh'],
  Dolpa: ['Dunai'],
  Humla: ['Simikot'],
  Jajarkot: ['Khalanga'],
  Jumla: ['Jumla'],
  Kalikot: ['Manma'],
  Mugu: ['Gamgadhi'],
  'Rukum West': ['Musikot'],
  Salyan: ['Salyan'],
  Surkhet: ['Birendranagar'],
  Achham: ['Mangalsen'],
  Baitadi: ['Baitadi'],
  Bajhang: ['Chainpur'],
  Bajura: ['Martadi'],
  Dadeldhura: ['Dadeldhura', 'Amargadhi'],
  Darchula: ['Darchula', 'Khalanga'],
  Kailali: ['Dhangadhi', 'Tikapur'],
  Kanchanpur: ['Mahendranagar'],
  Doti: ['Dipayal-Silgadhi'],
};

module.exports = { PROVINCES, DISTRICTS, LEGACY_CITIES_BY_DISTRICT };