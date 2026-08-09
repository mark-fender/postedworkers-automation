import { APIRequestContext } from '@playwright/test';

type PdokDocument = {
  type?: string;
  straatnaam?: string;
  woonplaatsnaam?: string;
  huisnummer?: string | number;
  postcode?: string;
  postalcode?: string;
  pc6?: string;
};

const PDOK_FREE_URL =
  'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('nl-NL')
    .replace(/[^a-z0-9]/g, '');
}

function baseHouseNumber(value: string): string {
  return value.trim().match(/^\d+/)?.[0] ?? value.trim();
}

function postcodeForExactAddress(
  docs: PdokDocument[],
  street: string,
  houseNumber: string,
  city: string
): string | undefined {
  const expectedHouseNumber = baseHouseNumber(houseNumber);

  for (const doc of docs) {
    const postcode = doc.postcode || doc.postalcode || doc.pc6;
    if (
      doc.type === 'adres' &&
      postcode &&
      normalize(doc.straatnaam ?? '') === normalize(street) &&
      normalize(doc.woonplaatsnaam ?? '') === normalize(city) &&
      String(doc.huisnummer ?? '') === expectedHouseNumber
    ) {
      return postcode;
    }
  }
}

function fuzzyStreetQuery(street: string): string {
  // PDOK uses a Solr-compatible query parser. Applying fuzzy matching to each
  // word makes one-character omissions/substitutions recoverable, while the
  // result is still checked locally before it can be used.
  return street
    .trim()
    .split(/\s+/)
    .map((word) => `${word.replace(/([+\-!(){}[\]^"~*?:\\/])/g, '\\$1')}~`)
    .join(' ');
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }

  return previous[right.length];
}

function isCloseStreetMatch(input: string, candidate: string): boolean {
  const normalizedInput = normalize(input);
  const normalizedCandidate = normalize(candidate);
  const maximumEdits = Math.max(1, Math.min(3, Math.floor(normalizedInput.length * 0.15)));

  return levenshteinDistance(normalizedInput, normalizedCandidate) <= maximumEdits;
}

async function pdokSearch(
  request: APIRequestContext,
  query: string,
  filter: string,
  rows = 10
): Promise<PdokDocument[]> {
  const params = new URLSearchParams({ q: query, fq: filter, rows: String(rows) });
  const response = await request.get(`${PDOK_FREE_URL}?${params}`);
  if (!response.ok()) {
    throw new Error(`PDOK request failed with status ${response.status()}`);
  }

  const responseData: unknown = await response.json();
  const docs = (responseData as { response?: { docs?: unknown } })?.response?.docs;
  return Array.isArray(docs) ? (docs as PdokDocument[]) : [];
}

export async function pdokLookupPostalCode(
  request: APIRequestContext,
  street: string,
  houseNumber: string,
  city: string
): Promise<string> {
  const query = `${street} ${houseNumber}, ${city}`;
  const addressFilter = 'type:adres';
  const exactDocs = await pdokSearch(request, query, addressFilter);
  const exactPostcode = postcodeForExactAddress(exactDocs, street, houseNumber, city);
  if (exactPostcode) return exactPostcode;

  // PDOK's normal free-text search does not correct spelling. Search only for
  // roads in the supplied city, then accept candidates only within a small
  // edit-distance threshold before resolving the full address again.
  const streetCandidates = await pdokSearch(
    request,
    fuzzyStreetQuery(street),
    `type:weg AND woonplaatsnaam:"${city.replace(/"/g, '\\"')}"`,
    20
  );
  const correctedStreets = [
    ...new Set(
      streetCandidates
        .map((doc) => doc.straatnaam)
        .filter((candidate): candidate is string => Boolean(candidate))
        .filter((candidate) => isCloseStreetMatch(street, candidate))
    ),
  ];

  for (const correctedStreet of correctedStreets) {
    const correctedQuery = `${correctedStreet} ${houseNumber}, ${city}`;
    const correctedDocs = await pdokSearch(request, correctedQuery, addressFilter);
    const postcode = postcodeForExactAddress(
      correctedDocs,
      correctedStreet,
      houseNumber,
      city
    );
    if (postcode) return postcode;
  }

  throw new Error(
    `PDOK: No postcode found for query: ${query}. No safe street-name correction was found.`
  );
}
