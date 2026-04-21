export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  answer?: string;
}

export async function tavilySearch(
  query: string,
  options?: { maxResults?: number; includeAnswer?: boolean }
): Promise<SearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY not configured");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: options?.maxResults ?? 5,
      include_answer: options?.includeAnswer ?? true,
      include_raw_content: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tavily error: ${err}`);
  }

  const data = await res.json();

  return {
    query,
    results: (data.results ?? []).map((r: { title: string; url: string; content: string; score: number }) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    })),
    answer: data.answer,
  };
}

export function formatSearchResults(search: SearchResponse): string {
  let out = `Web search: "${search.query}"\n\n`;
  if (search.answer) {
    out += `Summary: ${search.answer}\n\n`;
  }
  out += search.results
    .slice(0, 4)
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content.slice(0, 300)}...\nSource: ${r.url}`)
    .join("\n\n");
  return out;
}
