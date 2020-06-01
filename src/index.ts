import { exec } from "child_process";
import { promises as fs } from "fs";
import { Octokit } from "@octokit/rest";
import path from "path";

interface ConfigDataGitHubApi {
    oauthtoken: string
    owner: string
}

interface ConfigData {
    githubapi: ConfigDataGitHubApi
    backupdir: string
}

interface GitHubRepoInfo {
    owner: { login: string }
    name: string
    // eslint-disable-next-line camelcase
    full_name: string
}

const isDirectory = async (dirPath: string): Promise<boolean> => {
    try {
        const stat = await fs.lstat(dirPath);
        return stat.isDirectory();
    } catch (e) {
        return false;
    }
};

const runCliCommand = async (
    command: string, cwd: string
): Promise<void> => new Promise((resolve, reject) => {
    // eslint-disable-next-line no-console
    console.debug(`(${cwd}) ${command}`);
    exec(command, { cwd }, (err, stdout, stderr) => {
        if (err) {
            return reject(err);
        }
        // eslint-disable-next-line no-console
        console.debug(`stdout: ${stdout}`);
        // eslint-disable-next-line no-console
        console.debug(`stderr: ${stderr}`);
        resolve();
    });
});

const gitCloneRepo = async (token: string, repoDir: string, repoFullName: string): Promise<void> => {
    await fs.mkdir(repoDir, { recursive: true });
    await runCliCommand(`git clone "https://${token}@github.com/${repoFullName}.git" "${repoDir}"`,
        path.dirname(repoDir));
};

const gitUpdateRepo = async (token: string, repoDir: string, repoFullName: string): Promise<void> => {
    try {
        await runCliCommand("git pull", repoDir);
    } catch (updateError) {
        await fs.rmdir(repoDir, { recursive: true });
        await gitCloneRepo(token, repoDir, repoFullName);
    }
};

(async (): Promise<void> => {
    try {
        // Read config data
        const configFileContent = await fs.readFile(path.join(__dirname, "..", "config.json"));
        const configData = JSON.parse(configFileContent.toString()) as ConfigData;
        const backupdir = path.isAbsolute(configData.backupdir)
            ? configData.backupdir : path.join(__dirname, "..", configData.backupdir);
        const token = configData.githubapi.oauthtoken;
        const owner = configData.githubapi.owner;

        // Create backup directory
        await fs.mkdir(backupdir, { recursive: true });

        // Get git repositories
        const octokit = new Octokit({
            auth: token,
            userAgent: "BackupGitHubRepos"
        });
        // eslint-disable-next-line camelcase
        const octokitRequestInfo = { owner, page: 1, per_page: 100 };
        const repositories: GitHubRepoInfo[] = [];
        let emptyOrNotFullResults = false;
        do {
            const request = await octokit.repos.listForAuthenticatedUser(octokitRequestInfo);
            const repoData = request.data as unknown as GitHubRepoInfo[];
            repositories.push(... repoData);
            octokitRequestInfo.page++;
            emptyOrNotFullResults = repoData.length === 0 || repoData.length < octokitRequestInfo.per_page;
        } while (!emptyOrNotFullResults);

        // Clone git repositories or update already cloned ones
        for (const repo of repositories) {
            const repoDir = path.join(backupdir, repo.owner.login, repo.name);
            if (await isDirectory(path.join(repoDir, ".git"))) {
                try {
                    await gitUpdateRepo(token, repoDir, repo.full_name);
                } catch (updateError) {
                    throw updateError;
                }
            } else {
                try {
                    await gitCloneRepo(token, repoDir, repo.full_name);
                } catch (cloneError) {
                    throw cloneError;
                }
            }
        }
    } catch (error) {
        throw error;
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
