export function formatDateToDutchLocale(dotDate: string): string {
  return dotDate.replace(/\./g, '-');
}
