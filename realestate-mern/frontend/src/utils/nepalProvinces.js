// Backward-compatibility re-export. The canonical frontend geography module
// is now `./nepalGeography.js` (Province -> District -> Municipality);
// this file is kept so existing `import { NEPAL_PROVINCES } from
// '../../utils/nepalProvinces'` statements keep working.
export { NEPAL_PROVINCES } from './nepalGeography';
