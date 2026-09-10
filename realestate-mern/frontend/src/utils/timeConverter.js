
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