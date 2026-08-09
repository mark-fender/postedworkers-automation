import { expect, test } from '@playwright/test';
import { pdokLookupPostalCode } from '../utils/pdok';

type ResponseDocument = Record<string, unknown>;

function response(docs: ResponseDocument[]) {
  return {
    ok: () => true,
    status: () => 200,
    json: async () => ({ response: { docs } }),
  };
}

test('recovers a one-character street-name typo only after validating the address', async () => {
  const requests: URL[] = [];
  const request = {
    get: async (url: string) => {
      const parsed = new URL(url);
      requests.push(parsed);
      const query = parsed.searchParams.get('q');

      if (query === 'Woubrugestraat 3, Amsterdam') return response([]);
      if (query === 'Woubrugestraat~') {
        return response([
          { type: 'weg', straatnaam: 'Woubruggestraat', woonplaatsnaam: 'Amsterdam' },
        ]);
      }
      if (query === 'Woubruggestraat 3, Amsterdam') {
        return response([
          {
            type: 'adres',
            straatnaam: 'Woubruggestraat',
            woonplaatsnaam: 'Amsterdam',
            huisnummer: 3,
            postcode: '1059VN',
          },
        ]);
      }
      throw new Error(`Unexpected PDOK query: ${query}`);
    },
  };

  await expect(
    pdokLookupPostalCode(request as never, 'Woubrugestraat', '3', 'Amsterdam')
  ).resolves.toBe('1059VN');
  expect(requests).toHaveLength(3);
  expect(requests[1].searchParams.get('fq')).toContain('type:weg');
});

test('does not accept a distant road as a correction', async () => {
  const request = {
    get: async (url: string) => {
      const query = new URL(url).searchParams.get('q');
      if (query === 'Wrongstreet 3, Amsterdam') return response([]);
      return response([
        { type: 'weg', straatnaam: 'Completely Different Road', woonplaatsnaam: 'Amsterdam' },
      ]);
    },
  };

  await expect(
    pdokLookupPostalCode(request as never, 'Wrongstreet', '3', 'Amsterdam')
  ).rejects.toThrow('No safe street-name correction was found');
});

test('recovers a typo in a multi-word street name', async () => {
  const request = {
    get: async (url: string) => {
      const query = new URL(url).searchParams.get('q');
      if (query === 'Oude Hvenkade 12, Delft') return response([]);
      if (query === 'Oude~ Hvenkade~') {
        return response([
          { type: 'weg', straatnaam: 'Oude Havenkade', woonplaatsnaam: 'Delft' },
        ]);
      }
      if (query === 'Oude Havenkade 12, Delft') {
        return response([
          {
            type: 'adres',
            straatnaam: 'Oude Havenkade',
            woonplaatsnaam: 'Delft',
            huisnummer: 12,
            postcode: '2611AB',
          },
        ]);
      }
      throw new Error(`Unexpected PDOK query: ${query}`);
    },
  };

  await expect(
    pdokLookupPostalCode(request as never, 'Oude Hvenkade', '12', 'Delft')
  ).resolves.toBe('2611AB');
});

test('uses an exact result when spelling differs only by case or punctuation', async () => {
  const requests: URL[] = [];
  const request = {
    get: async (url: string) => {
      requests.push(new URL(url));
      return response([
        {
          type: 'adres',
          straatnaam: 'Sint-Jansplein',
          woonplaatsnaam: 'Utrecht',
          huisnummer: 8,
          postalcode: '3512CD',
        },
      ]);
    },
  };

  await expect(
    pdokLookupPostalCode(request as never, 'sint jansplein', '8', 'utrecht')
  ).resolves.toBe('3512CD');
  expect(requests).toHaveLength(1);
});

test('accepts a house-number suffix by validating its numeric base number', async () => {
  const request = {
    get: async () =>
      response([
        {
          type: 'adres',
          straatnaam: 'Cloverlaan',
          woonplaatsnaam: 'Leiden',
          huisnummer: 12,
          pc6: '2311EF',
        },
      ]),
  };

  await expect(
    pdokLookupPostalCode(request as never, 'Cloverlaan', '12B', 'Leiden')
  ).resolves.toBe('2311EF');
});

test('rejects a corrected street when its returned address has a different house number', async () => {
  const request = {
    get: async (url: string) => {
      const query = new URL(url).searchParams.get('q');
      if (query === 'Clverlaan 12, Leiden') return response([]);
      if (query === 'Clverlaan~') {
        return response([{ type: 'weg', straatnaam: 'Cloverlaan', woonplaatsnaam: 'Leiden' }]);
      }
      if (query === 'Cloverlaan 12, Leiden') {
        return response([
          {
            type: 'adres',
            straatnaam: 'Cloverlaan',
            woonplaatsnaam: 'Leiden',
            huisnummer: 21,
            postcode: '2311EF',
          },
        ]);
      }
      throw new Error(`Unexpected PDOK query: ${query}`);
    },
  };

  await expect(
    pdokLookupPostalCode(request as never, 'Clverlaan', '12', 'Leiden')
  ).rejects.toThrow('No safe street-name correction was found');
});
