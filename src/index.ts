import type { Config } from "./config.schema";
import { exec } from "child_process";
import { promises as fs } from "fs";
import { Octokit } from "@octokit/rest";
import path from "path";


interface GitHubRepoInfo {
    owner: { login: string }
    name: string
    // eslint-disable-next-line camelcase
    full_name: string
    // eslint-disable-next-line camelcase
    has_wiki: boolean
}

interface CodeOutput {
    command: string
    cwd?: string
    stdout: string
    stderr: string
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
): Promise<CodeOutput> => new Promise<CodeOutput>((resolve, reject) => {
    exec(command, { cwd }, (err, stdout, stderr) => {
        if (err) {
            return reject(err);
        }
        resolve({ command, cwd, stderr, stdout });
    });
});

const gitCloneRepo = async (token: string, repoDir: string, repoFullName: string): Promise<CodeOutput[]> => {
    const codeOutputs: CodeOutput[] = [];
    await fs.mkdir(repoDir, { recursive: true });
    codeOutputs.push({ command: `mkdir -p ${repoDir}`, stderr: "", stdout: "" });
    codeOutputs.push(await runCliCommand(`git clone "https://${token}@github.com/${repoFullName}.git" "${repoDir}"`,
        path.dirname(repoDir)));
    codeOutputs.push(await runCliCommand("git fetch --all", repoDir));
    codeOutputs.push(await runCliCommand("git pull --all", repoDir));
    return codeOutputs;
};

const gitUpdateRepo = async (token: string, repoDir: string, repoFullName: string): Promise<CodeOutput[]> => {
    try {
        const codeOutputs: CodeOutput[] = [];
        codeOutputs.push(await runCliCommand("git fetch --all", repoDir));
        codeOutputs.push(await runCliCommand("git pull --all", repoDir));
        return codeOutputs;
    } catch (updateError) {
        await fs.rmdir(repoDir, { recursive: true });
        return await gitCloneRepo(token, repoDir, repoFullName);
    }
};

const gitBackupRepo = async (repoDir: string, token: string, repoFullName: string): Promise<CodeOutput[]> => {
    if (await isDirectory(path.join(repoDir, ".git"))) {
        try {
            return await gitUpdateRepo(token, repoDir, repoFullName);
        } catch (updateError) {
            throw updateError;
        }
    } else {
        try {
            return await gitCloneRepo(token, repoDir, repoFullName);
        } catch (cloneError) {
            await fs.rmdir(repoDir, { recursive: true });
            throw cloneError;
        }
    }
};

const printCodeOutput = (codeOutput: CodeOutput) => {
    let stringBuilder = ">> ";
    if (codeOutput.cwd) {
        stringBuilder += `(${codeOutput.cwd})\n   `;
    }
    stringBuilder += `${codeOutput.command}`;
    // eslint-disable-next-line no-console
    console.info(stringBuilder);
    if (codeOutput.stdout && codeOutput.stdout.length > 0) {
        // eslint-disable-next-line no-console
        console.info(`   [stdout] ${codeOutput.stdout.trimEnd()}`);
    }
    if (codeOutput.stderr && codeOutput.stderr.length > 0) {
        // eslint-disable-next-line no-console
        console.info(`   [stderr] ${codeOutput.stderr.trimEnd()}`);
    }
};

(async (): Promise<void> => {
    try {
        // Read config data
        const configFileContent = await fs.readFile(path.join(__dirname, "..", "config.json"));
        const configData = JSON.parse(configFileContent.toString()) as Config;
        const token = configData.githubApi.oauthToken;
        const owner = configData.githubApi.accountName;
        const backupDirTemp = process.env.BACKUP_GIT_REPOS_BACKUP_DIR
            ? process.env.BACKUP_GIT_REPOS_BACKUP_DIR : configData.backupDir;
        const backupDir = path.isAbsolute(backupDirTemp)
            ? backupDirTemp : path.join(__dirname, "..", backupDirTemp);

        // Create backup directory
        await fs.mkdir(backupDir, { recursive: true });

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
        // eslint-disable-next-line no-console
        console.info(`${repositories.length} repositories from the account '${owner}' were found:`);

        // Clone git repositories or update already cloned ones
        await Promise.all(repositories.map(async (repo, index) => {
            const repoDir = path.join(backupDir, repo.owner.login, repo.name);
            // eslint-disable-next-line no-console
            console.info(`(${index + 1}/${repositories.length}) Backup repo '${repo.full_name}'...`);
            const codeOutput = await gitBackupRepo(repoDir, token, repo.full_name);
            codeOutput.forEach(printCodeOutput);
            // Try to clone the wiki (when enabled)
            if (repo.has_wiki) {
                try {
                    // eslint-disable-next-line no-console
                    console.info(`Try to backup wiki repo '${repo.full_name}.wiki'...`);
                    const repoWikiDir = path.join(backupDir, repo.owner.login, `${repo.name}_wiki`);
                    const codeOutputWiki = await gitBackupRepo(repoWikiDir, token, `${repo.full_name}.wiki`);
                    codeOutputWiki.forEach(printCodeOutput);
                } catch (error) {
                    // eslint-disable-next-line no-console
                    console.info(`>> No wiki found ('${repo.full_name}.wiki')`);
                }
            }
        }));
    } catch (error) {
        throw error;
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
