import "server-only";
/**
 * Acorda o robô do GitHub Actions na hora (workflow_dispatch), sem esperar a rodada agendada, que o GitHub atrasa.
 * Opcional e gratuito: precisa de GITHUB_DISPATCH_TOKEN (token com permissão Actions: escrita) e GITHUB_DISPATCH_REPO (dono/repo).
 */
/** Aceita "dono/repo", o link do GitHub ou ".git"; sem a variável, usa o repositório que a própria Vercel publica. */
export function dispatchRepo(value = process.env.GITHUB_DISPATCH_REPO, owner = process.env.VERCEL_GIT_REPO_OWNER, slug = process.env.VERCEL_GIT_REPO_SLUG) {
  const repo = (value ?? "").trim().replace(/^["']|["']$/g, "").replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "").replace(/\/+$/, "").replace(/\.git$/i, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(repo)) return repo;
  return owner && slug ? owner + "/" + slug : null;
}
export async function kickWorker() {
  const token = process.env.GITHUB_DISPATCH_TOKEN?.trim().replace(/^["']|["']$/g, ""), repo = dispatchRepo();
  if (!token || !repo) { console.warn("Acionar robô: falta " + (!token ? "GITHUB_DISPATCH_TOKEN" : "GITHUB_DISPATCH_REPO no formato dono/repo") + " nesta implantação."); return false; }
  try {
    const response = await fetch("https://api.github.com/repos/" + repo + "/actions/workflows/worker.yml/dispatches", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
    });
    if (response.status !== 204) console.warn("Acionar robô no GitHub falhou:", response.status, (await response.text().catch(() => "")).slice(0, 200));
    return response.status === 204;
  } catch (error) { console.warn("Acionar robô no GitHub falhou:", error instanceof Error ? error.message : error); return false; }
}
