import "server-only";
import { getOctokit } from "./github-auth";

const MAX_FILE_BYTES = 200_000;
const MAX_RESULTS = 30;

export function ghError(err: unknown): string {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      return "TOOL_ERROR: github_not_found. Repo, file, or resource does not exist (or your token can't see it). STOP.";
    }
    if (status === 401 || status === 403) {
      const message = (err as { message?: string }).message ?? "";
      if (/rate limit|api rate/i.test(message)) {
        return "TOOL_ERROR: github_rate_limited. Hit GitHub's API rate limit. Connect a PAT in Settings → Integrations to raise the limit to 5,000/hr. STOP.";
      }
      return "TOOL_ERROR: github_forbidden. The repo is private and your GitHub PAT can't see it. Tell the user: 'Connect your GitHub account in Settings → Integrations and I'll pull the code.' STOP.";
    }
    if (status === 429) {
      return "TOOL_ERROR: github_rate_limited. Hit GitHub's API rate limit. Connect a PAT in Settings → Integrations to raise the limit to 5,000/hr. STOP.";
    }
    if (status === 422) {
      const message = (err as { message?: string }).message ?? "";
      return `TOOL_ERROR: github_invalid_query. ${message}. STOP.`;
    }
  }
  return `TOOL_ERROR: github_request_failed: ${err instanceof Error ? err.message : String(err)}. STOP.`;
}

function clamp(n: unknown, def: number, max = MAX_RESULTS): number {
  const v = Number(n ?? def);
  if (!Number.isFinite(v) || v <= 0) return def;
  return Math.min(Math.floor(v), max);
}

export async function searchRepos(userId: string, query: string, perPage = 10): Promise<string> {
  const q = query.trim();
  if (!q) return "TOOL_ERROR: query is required. STOP.";
  try {
    const octo = await getOctokit(userId);
    const { data } = await octo.search.repos({ q, per_page: clamp(perPage, 10) });
    if (!data.items.length) return "No repositories matched.";
    return data.items
      .map((r, i) => {
        const lic = r.license?.spdx_id ?? "no-license";
        const desc = r.description ? `\n  ${r.description}` : "";
        return `[${i + 1}] ${r.full_name} ★${r.stargazers_count} · ${r.language ?? "—"} · ${lic}${desc}\n  ${r.html_url}`;
      })
      .join("\n\n");
  } catch (err) {
    return ghError(err);
  }
}

export async function getRepo(userId: string, owner: string, repo: string): Promise<string> {
  if (!owner?.trim() || !repo?.trim()) return "TOOL_ERROR: owner and repo are required. STOP.";
  try {
    const octo = await getOctokit(userId);
    const { data } = await octo.repos.get({ owner, repo });
    return [
      `${data.full_name}${data.private ? " (private)" : ""}`,
      data.description ?? "(no description)",
      `default_branch: ${data.default_branch}`,
      `language: ${data.language ?? "—"}`,
      `license: ${data.license?.spdx_id ?? "—"}`,
      `stars: ${data.stargazers_count} · forks: ${data.forks_count} · open_issues: ${data.open_issues_count}`,
      `topics: ${(data.topics ?? []).join(", ") || "—"}`,
      `homepage: ${data.homepage || "—"}`,
      `url: ${data.html_url}`,
      `pushed_at: ${data.pushed_at}`,
    ].join("\n");
  } catch (err) {
    return ghError(err);
  }
}

export async function readFile(
  userId: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string> {
  if (!owner?.trim() || !repo?.trim() || !path?.trim()) {
    return "TOOL_ERROR: owner, repo, and path are required. STOP.";
  }
  try {
    const octo = await getOctokit(userId);
    const { data } = await octo.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data)) {
      return `TOOL_ERROR: ${path} is a directory, not a file. Use github_list_directory instead. STOP.`;
    }
    if (data.type !== "file") {
      return `TOOL_ERROR: ${path} is a ${data.type}, not a regular file. STOP.`;
    }
    if (typeof data.content !== "string") {
      return `TOOL_ERROR: ${path} has no inline content (likely too large). STOP.`;
    }
    const decoded = Buffer.from(data.content, data.encoding === "base64" ? "base64" : "utf-8").toString("utf-8");
    if (decoded.length > MAX_FILE_BYTES) {
      const truncated = decoded.slice(0, MAX_FILE_BYTES);
      return `${owner}/${repo}/${path}${ref ? ` @ ${ref}` : ""} (${data.size} bytes total, truncated to ${MAX_FILE_BYTES}):\n\n${truncated}\n\n[truncated — file is ${data.size} bytes total]`;
    }
    return `${owner}/${repo}/${path}${ref ? ` @ ${ref}` : ""} (${data.size} bytes):\n\n${decoded}`;
  } catch (err) {
    return ghError(err);
  }
}

export async function listDirectory(
  userId: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string> {
  if (!owner?.trim() || !repo?.trim()) return "TOOL_ERROR: owner and repo are required. STOP.";
  const dirPath = (path ?? "").replace(/^\/+|\/+$/g, "");
  try {
    const octo = await getOctokit(userId);
    const { data } = await octo.repos.getContent({ owner, repo, path: dirPath, ref });
    if (!Array.isArray(data)) {
      return `TOOL_ERROR: ${dirPath || "/"} is a file, not a directory. Use github_read_file instead. STOP.`;
    }
    if (!data.length) return `(empty directory) ${owner}/${repo}/${dirPath || ""}`;
    const dirs = data.filter((e) => e.type === "dir").map((e) => `  ${e.name}/`);
    const files = data.filter((e) => e.type !== "dir").map((e) => `  ${e.name} (${e.size} bytes)`);
    return [
      `${owner}/${repo}/${dirPath || ""}${ref ? ` @ ${ref}` : ""}:`,
      ...dirs,
      ...files,
    ].join("\n");
  } catch (err) {
    return ghError(err);
  }
}

export async function searchCode(userId: string, query: string, perPage = 10): Promise<string> {
  const q = query.trim();
  if (!q) return "TOOL_ERROR: query is required. Include a repo: or org: qualifier (e.g. 'useState repo:vercel/next.js'). STOP.";
  try {
    const octo = await getOctokit(userId);
    const { data } = await octo.search.code({ q, per_page: clamp(perPage, 10) });
    if (!data.items.length) return "No code matches.";
    return data.items
      .map((r, i) => `[${i + 1}] ${r.repository.full_name} · ${r.path}\n  ${r.html_url}`)
      .join("\n\n");
  } catch (err) {
    return ghError(err);
  }
}

export async function listCommits(
  userId: string,
  owner: string,
  repo: string,
  path?: string,
  perPage = 10
): Promise<string> {
  if (!owner?.trim() || !repo?.trim()) return "TOOL_ERROR: owner and repo are required. STOP.";
  try {
    const octo = await getOctokit(userId);
    const { data } = await octo.repos.listCommits({
      owner,
      repo,
      path: path?.trim() || undefined,
      per_page: clamp(perPage, 10),
    });
    if (!data.length) return "No commits found.";
    return data
      .map((c, i) => {
        const author = c.commit.author?.name ?? c.author?.login ?? "unknown";
        const date = c.commit.author?.date ?? "?";
        const sha = c.sha.slice(0, 7);
        const msg = (c.commit.message ?? "").split("\n")[0];
        return `[${i + 1}] ${sha} — ${author} (${date})\n  ${msg}`;
      })
      .join("\n\n");
  } catch (err) {
    return ghError(err);
  }
}

export async function listIssues(
  userId: string,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
  perPage = 15
): Promise<string> {
  if (!owner?.trim() || !repo?.trim()) return "TOOL_ERROR: owner and repo are required. STOP.";
  try {
    const octo = await getOctokit(userId);
    const { data } = await octo.issues.listForRepo({
      owner,
      repo,
      state,
      per_page: clamp(perPage, 15),
    });
    const issuesOnly = data.filter((i) => !i.pull_request);
    if (!issuesOnly.length) return `No ${state} issues.`;
    return issuesOnly
      .map((it) => {
        const labels = it.labels
          .map((l) => (typeof l === "string" ? l : l.name))
          .filter(Boolean)
          .join(", ");
        return `#${it.number} [${it.state}] ${it.title}${labels ? ` · {${labels}}` : ""}\n  by ${it.user?.login ?? "?"} · ${it.created_at}\n  ${it.html_url}`;
      })
      .join("\n\n");
  } catch (err) {
    return ghError(err);
  }
}

export async function getIssue(
  userId: string,
  owner: string,
  repo: string,
  number: number
): Promise<string> {
  if (!owner?.trim() || !repo?.trim() || !Number.isFinite(number)) {
    return "TOOL_ERROR: owner, repo, and number are required. STOP.";
  }
  try {
    const octo = await getOctokit(userId);
    const [issue, comments] = await Promise.all([
      octo.issues.get({ owner, repo, issue_number: number }),
      octo.issues.listComments({ owner, repo, issue_number: number, per_page: 20 }),
    ]);
    const it = issue.data;
    const labels = it.labels
      .map((l) => (typeof l === "string" ? l : l.name))
      .filter(Boolean)
      .join(", ");
    const body = (it.body ?? "(no body)").slice(0, 8_000);
    const commentsBlock = comments.data.length
      ? comments.data
          .map((c) => `--- ${c.user?.login ?? "?"} @ ${c.created_at}\n${(c.body ?? "").slice(0, 4_000)}`)
          .join("\n\n")
      : "(no comments)";
    return [
      `#${it.number} [${it.state}] ${it.title}`,
      `by ${it.user?.login ?? "?"} · opened ${it.created_at}${labels ? ` · {${labels}}` : ""}`,
      it.html_url,
      "",
      body,
      "",
      `=== Comments (${comments.data.length}) ===`,
      commentsBlock,
    ].join("\n");
  } catch (err) {
    return ghError(err);
  }
}

export async function listPullRequests(
  userId: string,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
  perPage = 15
): Promise<string> {
  if (!owner?.trim() || !repo?.trim()) return "TOOL_ERROR: owner and repo are required. STOP.";
  try {
    const octo = await getOctokit(userId);
    const { data } = await octo.pulls.list({
      owner,
      repo,
      state,
      per_page: clamp(perPage, 15),
    });
    if (!data.length) return `No ${state} pull requests.`;
    return data
      .map((p) => `#${p.number} [${p.state}${p.draft ? "/draft" : ""}] ${p.title}\n  ${p.user?.login ?? "?"} · ${p.head.ref} → ${p.base.ref} · ${p.created_at}\n  ${p.html_url}`)
      .join("\n\n");
  } catch (err) {
    return ghError(err);
  }
}

export async function getPullRequest(
  userId: string,
  owner: string,
  repo: string,
  number: number
): Promise<string> {
  if (!owner?.trim() || !repo?.trim() || !Number.isFinite(number)) {
    return "TOOL_ERROR: owner, repo, and number are required. STOP.";
  }
  try {
    const octo = await getOctokit(userId);
    const [pr, files] = await Promise.all([
      octo.pulls.get({ owner, repo, pull_number: number }),
      octo.pulls.listFiles({ owner, repo, pull_number: number, per_page: 50 }),
    ]);
    const p = pr.data;
    const body = (p.body ?? "(no body)").slice(0, 8_000);
    const fileBlock = files.data.length
      ? files.data
          .map((f) => `  ${f.status.padEnd(8)} +${f.additions}/-${f.deletions}  ${f.filename}`)
          .join("\n")
      : "  (no files)";
    return [
      `#${p.number} [${p.state}${p.draft ? "/draft" : ""}] ${p.title}`,
      `by ${p.user?.login ?? "?"} · ${p.head.ref} → ${p.base.ref} · ${p.created_at}`,
      `merged: ${p.merged ? `yes (${p.merged_at})` : "no"} · mergeable: ${p.mergeable ?? "unknown"}`,
      `commits: ${p.commits} · changes: +${p.additions}/-${p.deletions} across ${p.changed_files} files`,
      p.html_url,
      "",
      body,
      "",
      `=== Files changed (${files.data.length}) ===`,
      fileBlock,
    ].join("\n");
  } catch (err) {
    return ghError(err);
  }
}
