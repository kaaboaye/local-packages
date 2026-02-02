import { z } from "zod";

const GitHubReleaseSchema = z.object({
  tag_name: z.string(),
});

export const fetchGitHubLatestTag = async (repo: string): Promise<string> => {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/releases/latest`
  );
  const data = GitHubReleaseSchema.parse(await response.json());
  return data.tag_name;
};
