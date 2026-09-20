
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

const NEPAL_TIMEZONE = "Asia/Kathmandu";

export const nepaliInputToUTC = (dateTimeLocal) => {
  if (!dateTimeLocal) return null;

  return fromZonedTime(
    dateTimeLocal,
    NEPAL_TIMEZONE
  ).toISOString();
};

export const utcToNepaliInput = (utcDate) => {
  if (!utcDate) return "";

  return formatInTimeZone(
    utcDate,
    NEPAL_TIMEZONE,
    "yyyy-MM-dd h:mm a"
  );
};

// Same as above but in `datetime-local` input format ("yyyy-MM-ddTHH:mm"),
// for pre-filling scheduling inputs with the stored instant rendered back
// in Nepal wall time. Pair with nepaliInputToUTC on submit for a lossless
// round-trip.
export const utcToNepaliInputLocal = (utcDate) => {
  if (!utcDate) return "";

  return formatInTimeZone(
    utcDate,
    NEPAL_TIMEZONE,
    "yyyy-MM-dd'T'HH:mm"
  );
};