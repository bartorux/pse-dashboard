import { NextResponse } from "next/server";

const DEFAULT_BASE_URLS = [
  process.env.PSE_API_BASE,
  "https://api.raporty.pse.pl/api",
  "https://api.raporty.pse.pl"
].filter(Boolean) as string[];
const ENDPOINT_PATTERN = /^[a-z0-9-]+$/i;

function buildApiUrl(baseUrl: string, endpoint: string, params: URLSearchParams) {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/${endpoint}`);

  const select = params.get("select");
  const filter = params.get("filter");
  const orderby = params.get("orderby");
  const first = params.get("first");
  const after = params.get("after");

  if (select) url.searchParams.set("$select", select);
  if (filter) url.searchParams.set("$filter", filter);
  if (orderby) url.searchParams.set("$orderby", orderby);
  if (first) url.searchParams.set("$first", first);
  if (after) url.searchParams.set("$after", after);

  return url;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const endpoint = (searchParams.get("endpoint") || "").trim();

  if (!endpoint || !ENDPOINT_PATTERN.test(endpoint)) {
    return NextResponse.json(
      { error: "Nieprawidłowy endpoint." },
      { status: 400 }
    );
  }

  try {
    let lastResponse: Response | null = null;
    let lastBaseUrl: string | null = null;

    for (const baseUrl of DEFAULT_BASE_URLS) {
      const apiUrl = buildApiUrl(baseUrl, endpoint, searchParams);
      const response = await fetch(apiUrl, {
        headers: {
          Accept: "application/json"
        },
        cache: "no-store"
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }

      if (response.status !== 404) {
        const text = await response.text();
        return NextResponse.json(
          { error: `Błąd API: ${response.status}`, details: text, baseUrl },
          { status: response.status }
        );
      }

      lastResponse = response;
      lastBaseUrl = baseUrl;
    }

    if (lastResponse) {
      const text = await lastResponse.text();
      return NextResponse.json(
        {
          error: `Błąd API: ${lastResponse.status}`,
          details: text,
          baseUrl: lastBaseUrl
        },
        { status: lastResponse.status }
      );
    }

    return NextResponse.json(
      { error: "Brak zdefiniowanych baz API." },
      { status: 500 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Nie udało się połączyć z API.", details: String(error) },
      { status: 502 }
    );
  }
}
