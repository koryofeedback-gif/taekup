const EU_TIMEZONES = new Set([
  'Europe/Vienna', 'Europe/Brussels', 'Europe/Sofia', 'Europe/Zagreb', 'Europe/Nicosia',
  'Europe/Prague', 'Europe/Copenhagen', 'Europe/Tallinn', 'Europe/Helsinki', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Athens', 'Europe/Budapest', 'Europe/Dublin', 'Europe/Rome',
  'Europe/Riga', 'Europe/Vilnius', 'Europe/Luxembourg', 'Europe/Valletta', 'Europe/Amsterdam',
  'Europe/Warsaw', 'Europe/Lisbon', 'Europe/Bucharest', 'Europe/Bratislava', 'Europe/Ljubljana',
  'Europe/Madrid', 'Europe/Stockholm', 'Europe/Zurich', 'Europe/Monaco', 'Africa/Ceuta',
  'Atlantic/Canary', 'Atlantic/Azores', 'Indian/Reunion', 'Indian/Mayotte',
]);

const EUROZONE_COUNTRY_CODES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','CH',
]);

export function isEurozoneUser(clubCountry?: string): boolean {
  if (clubCountry && EUROZONE_COUNTRY_CODES.has(clubCountry.toUpperCase())) return true;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return EU_TIMEZONES.has(tz);
  } catch {
    return false;
  }
}

export function formatPriceWithCurrency(amount: number, clubCountry?: string): string {
  const isEU = isEurozoneUser(clubCountry);
  return `${isEU ? '€' : '$'}${amount.toFixed(2)}`;
}

export function getPremiumPrice(clubCountry?: string): string {
  return isEurozoneUser(clubCountry) ? '€4.99' : '$4.99';
}
