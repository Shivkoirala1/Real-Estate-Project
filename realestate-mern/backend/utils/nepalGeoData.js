// Canonical Nepal administrative geography: the 7 provinces established by
// the 2015 constitution, their 77 districts, and 1-3 well-known cities /
// municipalities per district (mainly district headquarters).
//
// This is what powers the cascading Province -> District -> City dropdowns
// on the Add Property form. Having the *complete, correct* list here - not
// just the handful of districts a few seeded sample listings happened to
// use - is what lets us lock the form down to "pick from the real list"
// instead of free-text entry, so no made-up districts/cities can be saved.
//
// Province numbers are included because that's still how many people in
// Nepal refer to them day-to-day (colloquially "Province 1, 2, ...7"),
// alongside their official names.

const PROVINCES = [
  { number: 1, name: 'Koshi Province' },
  { number: 2, name: 'Madhesh Province' },
  { number: 3, name: 'Bagmati Province' },
  { number: 4, name: 'Gandaki Province' },
  { number: 5, name: 'Lumbini Province' },
  { number: 6, name: 'Karnali Province' },
  { number: 7, name: 'Sudurpashchim Province' },
];

// { districtName: { province: <official province name>, cities: [...] } }
const DISTRICTS = {
  // ---- Koshi Province ----
  Bhojpur: { province: 'Koshi Province', cities: ['Bhojpur'] },
  Dhankuta: { province: 'Koshi Province', cities: ['Dhankuta'] },
  Ilam: { province: 'Koshi Province', cities: ['Ilam', 'Mai'] },
  Jhapa: { province: 'Koshi Province', cities: ['Birtamod', 'Damak', 'Bhadrapur'] },
  Khotang: { province: 'Koshi Province', cities: ['Diktel'] },
  Morang: { province: 'Koshi Province', cities: ['Biratnagar', 'Urlabari'] },
  Okhaldhunga: { province: 'Koshi Province', cities: ['Okhaldhunga'] },
  Panchthar: { province: 'Koshi Province', cities: ['Phidim'] },
  Sankhuwasabha: { province: 'Koshi Province', cities: ['Khandbari'] },
  Solukhumbu: { province: 'Koshi Province', cities: ['Salleri'] },
  Sunsari: { province: 'Koshi Province', cities: ['Itahari', 'Dharan', 'Inaruwa'] },
  Taplejung: { province: 'Koshi Province', cities: ['Taplejung'] },
  Terhathum: { province: 'Koshi Province', cities: ['Myanglung'] },
  Udayapur: { province: 'Koshi Province', cities: ['Gaighat', 'Katari'] },

  // ---- Madhesh Province ----
  Bara: { province: 'Madhesh Province', cities: ['Kalaiya'] },
  Dhanusha: { province: 'Madhesh Province', cities: ['Janakpur'] },
  Mahottari: { province: 'Madhesh Province', cities: ['Jaleshwar'] },
  Parsa: { province: 'Madhesh Province', cities: ['Birgunj'] },
  Rautahat: { province: 'Madhesh Province', cities: ['Gaur'] },
  Saptari: { province: 'Madhesh Province', cities: ['Rajbiraj'] },
  Sarlahi: { province: 'Madhesh Province', cities: ['Malangwa'] },
  Siraha: { province: 'Madhesh Province', cities: ['Siraha', 'Lahan'] },

  // ---- Bagmati Province ----
  Bhaktapur: { province: 'Bagmati Province', cities: ['Bhaktapur', 'Madhyapur Thimi'] },
  Chitwan: { province: 'Bagmati Province', cities: ['Bharatpur', 'Ratnanagar'] },
  Dhading: { province: 'Bagmati Province', cities: ['Dhading Besi'] },
  Dolakha: { province: 'Bagmati Province', cities: ['Charikot'] },
  Kathmandu: { province: 'Bagmati Province', cities: ['Kathmandu', 'Kirtipur'] },
  Kavrepalanchok: { province: 'Bagmati Province', cities: ['Dhulikhel', 'Banepa'] },
  Lalitpur: { province: 'Bagmati Province', cities: ['Lalitpur', 'Godawari'] },
  Makwanpur: { province: 'Bagmati Province', cities: ['Hetauda'] },
  Nuwakot: { province: 'Bagmati Province', cities: ['Bidur'] },
  Ramechhap: { province: 'Bagmati Province', cities: ['Manthali'] },
  Rasuwa: { province: 'Bagmati Province', cities: ['Dhunche'] },
  Sindhuli: { province: 'Bagmati Province', cities: ['Sindhulimadi'] },
  Sindhupalchok: { province: 'Bagmati Province', cities: ['Chautara'] },

  // ---- Gandaki Province ----
  Baglung: { province: 'Gandaki Province', cities: ['Baglung'] },
  Gorkha: { province: 'Gandaki Province', cities: ['Gorkha'] },
  Kaski: { province: 'Gandaki Province', cities: ['Pokhara'] },
  Lamjung: { province: 'Gandaki Province', cities: ['Besisahar'] },
  Manang: { province: 'Gandaki Province', cities: ['Chame'] },
  Mustang: { province: 'Gandaki Province', cities: ['Jomsom'] },
  Myagdi: { province: 'Gandaki Province', cities: ['Beni'] },
  Nawalpur: { province: 'Gandaki Province', cities: ['Kawasoti'] },
  Parbat: { province: 'Gandaki Province', cities: ['Kusma'] },
  Syangja: { province: 'Gandaki Province', cities: ['Putalibazar', 'Waling'] },
  Tanahun: { province: 'Gandaki Province', cities: ['Damauli'] },

  // ---- Lumbini Province ----
  Arghakhanchi: { province: 'Lumbini Province', cities: ['Sandhikharka'] },
  Banke: { province: 'Lumbini Province', cities: ['Nepalgunj'] },
  Bardiya: { province: 'Lumbini Province', cities: ['Gulariya'] },
  Dang: { province: 'Lumbini Province', cities: ['Ghorahi', 'Tulsipur'] },
  Gulmi: { province: 'Lumbini Province', cities: ['Tamghas'] },
  Kapilvastu: { province: 'Lumbini Province', cities: ['Taulihawa'] },
  Parasi: { province: 'Lumbini Province', cities: ['Ramgram'] },
  Palpa: { province: 'Lumbini Province', cities: ['Tansen'] },
  Pyuthan: { province: 'Lumbini Province', cities: ['Pyuthan'] },
  Rolpa: { province: 'Lumbini Province', cities: ['Liwang'] },
  'Rukum East': { province: 'Lumbini Province', cities: ['Rukumkot'] },
  Rupandehi: { province: 'Lumbini Province', cities: ['Butwal', 'Siddharthanagar'] },

  // ---- Karnali Province ----
  Dailekh: { province: 'Karnali Province', cities: ['Dailekh'] },
  Dolpa: { province: 'Karnali Province', cities: ['Dunai'] },
  Humla: { province: 'Karnali Province', cities: ['Simikot'] },
  Jajarkot: { province: 'Karnali Province', cities: ['Khalanga'] },
  Jumla: { province: 'Karnali Province', cities: ['Jumla'] },
  Kalikot: { province: 'Karnali Province', cities: ['Manma'] },
  Mugu: { province: 'Karnali Province', cities: ['Gamgadhi'] },
  'Rukum West': { province: 'Karnali Province', cities: ['Musikot'] },
  Salyan: { province: 'Karnali Province', cities: ['Salyan'] },
  Surkhet: { province: 'Karnali Province', cities: ['Birendranagar'] },

  // ---- Sudurpashchim Province ----
  Achham: { province: 'Sudurpashchim Province', cities: ['Mangalsen'] },
  Baitadi: { province: 'Sudurpashchim Province', cities: ['Baitadi'] },
  Bajhang: { province: 'Sudurpashchim Province', cities: ['Chainpur'] },
  Bajura: { province: 'Sudurpashchim Province', cities: ['Martadi'] },
  Dadeldhura: { province: 'Sudurpashchim Province', cities: ['Dadeldhura', 'Amargadhi'] },
  Darchula: { province: 'Sudurpashchim Province', cities: ['Darchula', 'Khalanga'] },
  Kailali: { province: 'Sudurpashchim Province', cities: ['Dhangadhi', 'Tikapur'] },
  Kanchanpur: { province: 'Sudurpashchim Province', cities: ['Mahendranagar'] },
  Doti: { province: 'Sudurpashchim Province', cities: ['Dipayal-Silgadhi'] },
};

module.exports = { PROVINCES, DISTRICTS };
