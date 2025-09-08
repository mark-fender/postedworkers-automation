import { APIRequestContext } from '@playwright/test';

export async function pdokLookupPostalCode(
  request: APIRequestContext,
  street: string,
  houseNumber: string,
  city: string
): Promise<string> {
  const query = `${street} ${houseNumber}, ${city}`;
  const lookupUrl =
    `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(query)}&rows=5`;
  const response = await request.get(lookupUrl);
  if (!response.ok()) {
    throw new Error(`PDOK request failed with status ${response.status()}`);
  }
  const responseData = await response.json();
  const docs = (responseData as any)?.response?.docs || [];
  for (const doc of docs) {
    const postcode = doc?.postcode || doc?.postalcode || doc?.pc6;
    if (postcode) return postcode;
  }
  throw new Error(`PDOK: No postcode found for query: ${query}`);
}
