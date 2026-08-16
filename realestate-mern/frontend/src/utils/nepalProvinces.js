// The 7 provinces of Nepal - numbers are how people commonly refer to them
// day-to-day ("Province 3"), names are the official ones. These must match
// the `province` string saved on each District document exactly (see
// backend/utils/nepalGeoData.js), since the Add Property form filters the
// fetched district list by this name to build the cascading dropdown.
export const NEPAL_PROVINCES = [
  { number: 1, name: 'Koshi Province' },
  { number: 2, name: 'Madhesh Province' },
  { number: 3, name: 'Bagmati Province' },
  { number: 4, name: 'Gandaki Province' },
  { number: 5, name: 'Lumbini Province' },
  { number: 6, name: 'Karnali Province' },
  { number: 7, name: 'Sudurpashchim Province' },
];
