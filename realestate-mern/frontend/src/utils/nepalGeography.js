// Canonical Nepal geography for the UI — a static mirror of
// `backend/data/nepalGeography.js` (Province -> District -> Municipality).
// Keep the two files in sync: adding verified municipality names here
// switches that district's form field from a free-text input to a
// controlled dropdown automatically (see hasVerifiedMunicipalities).
//
// NOTE: there is intentionally no "city" list. Property locality is
// free-text (locality / tole).

export const NEPAL_PROVINCES = [
  { number: 1, name: 'Koshi Province' },
  { number: 2, name: 'Madhesh Province' },
  { number: 3, name: 'Bagmati Province' },
  { number: 4, name: 'Gandaki Province' },
  { number: 5, name: 'Lumbini Province' },
  { number: 6, name: 'Karnali Province' },
  { number: 7, name: 'Sudurpashchim Province' },
];

// { districtName: provinceName } — the 77 districts of Nepal.
export const DISTRICT_PROVINCE = {
  Bhojpur: 'Koshi Province',
  Dhankuta: 'Koshi Province',
  Ilam: 'Koshi Province',
  Jhapa: 'Koshi Province',
  Khotang: 'Koshi Province',
  Morang: 'Koshi Province',
  Okhaldhunga: 'Koshi Province',
  Panchthar: 'Koshi Province',
  Sankhuwasabha: 'Koshi Province',
  Solukhumbu: 'Koshi Province',
  Sunsari: 'Koshi Province',
  Taplejung: 'Koshi Province',
  Terhathum: 'Koshi Province',
  Udayapur: 'Koshi Province',
  Bara: 'Madhesh Province',
  Dhanusha: 'Madhesh Province',
  Mahottari: 'Madhesh Province',
  Parsa: 'Madhesh Province',
  Rautahat: 'Madhesh Province',
  Saptari: 'Madhesh Province',
  Sarlahi: 'Madhesh Province',
  Siraha: 'Madhesh Province',
  Bhaktapur: 'Bagmati Province',
  Chitwan: 'Bagmati Province',
  Dhading: 'Bagmati Province',
  Dolakha: 'Bagmati Province',
  Kathmandu: 'Bagmati Province',
  Kavrepalanchok: 'Bagmati Province',
  Lalitpur: 'Bagmati Province',
  Makwanpur: 'Bagmati Province',
  Nuwakot: 'Bagmati Province',
  Ramechhap: 'Bagmati Province',
  Rasuwa: 'Bagmati Province',
  Sindhuli: 'Bagmati Province',
  Sindhupalchok: 'Bagmati Province',
  Baglung: 'Gandaki Province',
  Gorkha: 'Gandaki Province',
  Kaski: 'Gandaki Province',
  Lamjung: 'Gandaki Province',
  Manang: 'Gandaki Province',
  Mustang: 'Gandaki Province',
  Myagdi: 'Gandaki Province',
  Nawalpur: 'Gandaki Province',
  Parbat: 'Gandaki Province',
  Syangja: 'Gandaki Province',
  Tanahun: 'Gandaki Province',
  Arghakhanchi: 'Lumbini Province',
  Banke: 'Lumbini Province',
  Bardiya: 'Lumbini Province',
  Dang: 'Lumbini Province',
  Gulmi: 'Lumbini Province',
  Kapilvastu: 'Lumbini Province',
  Parasi: 'Lumbini Province',
  Palpa: 'Lumbini Province',
  Pyuthan: 'Lumbini Province',
  Rolpa: 'Lumbini Province',
  'Rukum East': 'Lumbini Province',
  Rupandehi: 'Lumbini Province',
  Dailekh: 'Karnali Province',
  Dolpa: 'Karnali Province',
  Humla: 'Karnali Province',
  Jajarkot: 'Karnali Province',
  Jumla: 'Karnali Province',
  Kalikot: 'Karnali Province',
  Mugu: 'Karnali Province',
  'Rukum West': 'Karnali Province',
  Salyan: 'Karnali Province',
  Surkhet: 'Karnali Province',
  Achham: 'Sudurpashchim Province',
  Baitadi: 'Sudurpashchim Province',
  Bajhang: 'Sudurpashchim Province',
  Bajura: 'Sudurpashchim Province',
  Dadeldhura: 'Sudurpashchim Province',
  Darchula: 'Sudurpashchim Province',
  Kailali: 'Sudurpashchim Province',
  Kanchanpur: 'Sudurpashchim Province',
  Doti: 'Sudurpashchim Province',
};

// Verified Municipality / Rural Municipality names per district (mirror of
// the backend dataset). Districts with an empty list (Manang, Mustang,
// Humla, Rukum East, Rasuwa) render a free-text input until verified names
// are added.
export const MUNICIPALITIES_BY_DISTRICT = {
  Bhojpur: ['Bhojpur', 'Shadananda'],
  Dhankuta: ['Dhankuta', 'Mahalaxmi', 'Pakhribas'],
  Ilam: ['Deumai', 'Ilam', 'Mai', 'Suryodaya'],
  Jhapa: ['Arjundhara', 'Bhadrapur', 'Birtamod', 'Damak', 'Gauradaha', 'Kankai', 'Mechinagar', 'Shivasatakshi'],
  Khotang: ['Diktel Rupakot Majhuwagadhi', 'Halesi Tuwachung'],
  Morang: ['Belbari', 'Biratnagar', 'Letang', 'Pathari Shanischare', 'Rangeli', 'Ratuwamai', 'Sundar Haraincha', 'Sunawarshi', 'Urlabari'],
  Okhaldhunga: ['Siddhicharan'],
  Panchthar: ['Phidim'],
  Sankhuwasabha: ['Chainpur', 'Dharmadevi', 'Khandbari', 'Madi', 'Panchkhapan'],
  Solukhumbu: ['Solu Dudhkunda'],
  Sunsari: ['Barahachhetra', 'Dharan', 'Duhabi', 'Inaruwa', 'Itahari', 'Ramdhuni'],
  Taplejung: ['Phungling'],
  Terhathum: ['Laligurans', 'Myanglung'],
  Udayapur: ['Belaka', 'Chaudandigadhi', 'Katari', 'Triyuga'],
  Bara: ['Jitpur-Simara', 'Kalaiya', 'Kolhabi', 'Mahagadhimai', 'Nijgadh', 'Pacharauta', 'Simraungadh'],
  Dhanusha: ['Chhireshwarnath', 'Dhanushadham', 'Ganeshman Charanath', 'Hansapur', 'Janakpur', 'Kamala', 'Mithila', 'Mithila Bihari', 'Nagarain', 'Sabaila', 'Shahidnagar', 'Videha'],
  Mahottari: ['Aurahi', 'Balawa', 'Bardibas', 'Bhangaha', 'Gaushala', 'Jaleshwar', 'Loharpatti', 'Manara Shiswa', 'Matihani', 'Ramgopalpur'],
  Parsa: ['Bahudarmai', 'Birgunj', 'Parsagadhi', 'Pokhariya'],
  Rautahat: ['Baudhimai', 'Brindaban', 'Chandrapur', 'Dewahi Gonahi', 'Gadhimai', 'Garuda', 'Gaur', 'Gujara', 'Ishnath', 'Katahariya', 'Madhav Narayan', 'Maulapur', 'Paroha', 'Phatuwa Bijayapur', 'Rajdevi', 'Rajpur'],
  Saptari: ['Bodebarsain', 'Dakneshwari', 'Hanumannagar Kankalini', 'Kanchanrup', 'Khadak', 'Rajbiraj', 'Saptakoshi', 'Shambhunath', 'Surunga'],
  Sarlahi: ['Bagmati', 'Balara', 'Barahathawa', 'Godaita', 'Hariwan', 'Haripur', 'Haripurwa', 'Ishwarpur', 'Kabilasi', 'Lalbandi', 'Malangwa'],
  Siraha: ['Dhangadimai', 'Golbazar', 'Kalyanpur', 'Karjanha', 'Lahan', 'Mirchaiya', 'Siraha', 'Sukhipur'],
  Bhaktapur: ['Bhaktapur', 'Changunarayan', 'Madhyapur Thimi', 'Suryabinayak'],
  Chitwan: ['Bharatpur', 'Kalika', 'Khairhani', 'Madi', 'Ratnanagar', 'Rapti'],
  Dhading: ['Dhunibeshi', 'Nilkantha'],
  Dolakha: ['Bhimeshwar', 'Jiri'],
  Kathmandu: ['Budhanilkantha', 'Chandragiri', 'Dakshinkali', 'Gokarneshwar', 'Kageshwari-Manohara', 'Kathmandu', 'Kirtipur', 'Nagarjun', 'Shankharapur', 'Tarakeshwar', 'Tokha'],
  Kavrepalanchok: ['Banepa', 'Dhulikhel', 'Mandan Deupur', 'Namobuddha', 'Panchkhal', 'Panauti'],
  Lalitpur: ['Godawari', 'Lalitpur', 'Mahalaxmi'],
  Makwanpur: ['Hetauda', 'Thaha'],
  Nuwakot: ['Belkotgadhi', 'Bidur'],
  Ramechhap: ['Manthali', 'Ramechhap'],
  Rasuwa: [],
  Sindhuli: ['Dudhauli', 'Kamalamai'],
  Sindhupalchok: ['Barhabise', 'Chautara Sangachokgadhi', 'Melamchi'],
  Baglung: ['Baglung', 'Dhorpatan', 'Galkot', 'Jaimini'],
  Gorkha: ['Gorkha', 'Palungtar'],
  Kaski: ['Pokhara'],
  Lamjung: ['Besisahar', 'Madhya Nepal', 'Rainas', 'Sundarbazar'],
  Manang: [],
  Mustang: [],
  Myagdi: ['Beni'],
  Nawalpur: ['Devchuli', 'Gaindakot', 'Kawasoti', 'Madhyabindu'],
  Parbat: ['Kushma', 'Phalebas'],
  Syangja: ['Bhirkot', 'Chapakot', 'Galyang', 'Putalibazar', 'Waling'],
  Tanahun: ['Bhanu', 'Bhimad', 'Shuklagandaki', 'Vyas'],
  Arghakhanchi: ['Bhumikasthan', 'Sandhikharka', 'Sitganga'],
  Banke: ['Nepalgunj', 'Kohalpur'],
  Bardiya: ['Bansgadhi', 'Barbardiya', 'Gulariya', 'Madhuwan', 'Rajapur', 'Thakurbaba'],
  Dang: ['Ghorahi', 'Lamahi', 'Tulsipur'],
  Gulmi: ['Musikot', 'Resunga'],
  Kapilvastu: ['Banganga', 'Buddhabhumi', 'Kapilvastu', 'Krishnanagar', 'Maharajganj', 'Shivaraj'],
  Parasi: ['Bardaghat', 'Ramgram', 'Sunawal'],
  Palpa: ['Rampur', 'Tansen'],
  Pyuthan: ['Pyuthan', 'Swargadwari'],
  Rolpa: ['Rolpa'],
  'Rukum East': [],
  Rupandehi: ['Butwal', 'Devdaha', 'Lumbini Sanskritik', 'Sainamaina', 'Siddharthanagar', 'Tilottama'],
  Dailekh: ['Aathabis', 'Chamunda Bindrasaini', 'Dullu', 'Narayan'],
  Dolpa: ['Thuli Bheri', 'Tripura Sundari'],
  Humla: [],
  Jajarkot: ['Bheri', 'Chhedagad', 'Nalgad'],
  Jumla: ['Chandannath'],
  Kalikot: ['Khandachakra', 'Raskot', 'Tilagupha'],
  Mugu: ['Chhayanath Rara'],
  'Rukum West': ['Aathabiskot', 'Chaurjahari', 'Musikot'],
  Salyan: ['Bagchaur', 'Bangad Kupinde', 'Sharada'],
  Surkhet: ['Bheriganga', 'Birendranagar', 'Gurbhakot', 'Lekbeshi', 'Panchapuri'],
  Achham: ['Kamalbazar', 'Mangalsen', 'Panchadewal Binayak', 'Sanphebagar'],
  Baitadi: ['Dasharathchand', 'Melauli', 'Patan', 'Purchaudi'],
  Bajhang: ['Bungal', 'Jaya Prithvi'],
  Bajura: ['Badimalika', 'Budhiganga', 'Budhinanda', 'Tribeni'],
  Dadeldhura: ['Amargadhi', 'Parshuram'],
  Darchula: ['Mahakali', 'Shailyashikhar'],
  Kailali: ['Bhajani', 'Dhangadhi', 'Gauriganga', 'Ghodaghodi', 'Godawari', 'Lamki Chuha', 'Tikapur'],
  Kanchanpur: ['Bedkot', 'Belauri', 'Bhimdatta', 'Dodhara Chandani', 'Krishnapur', 'Punarbas', 'Shuklaphanta'],
  Doti: ['Dipayal Silgadhi', 'Shikhar'],
};

export const getDistrictsByProvince = (province) => {
  if (!province) return Object.keys(DISTRICT_PROVINCE).sort((a, b) => a.localeCompare(b));
  return Object.entries(DISTRICT_PROVINCE)
    .filter(([, p]) => p === province)
    .map(([d]) => d)
    .sort((a, b) => a.localeCompare(b));
};

export const getMunicipalitiesByDistrict = (district) =>
  [...(MUNICIPALITIES_BY_DISTRICT[district] || [])].sort((a, b) => a.localeCompare(b));

export const hasVerifiedMunicipalities = (district) => getMunicipalitiesByDistrict(district).length > 0;

export const isValidDistrict = (province, district) =>
  !!province && !!district && DISTRICT_PROVINCE[district] === province;

// Accepts both plain strings and `{ name }` objects when reading a location
// value, so one renderer works for every response shape.
export const locationName = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.name === 'string') return value.name;
  return '';
};
