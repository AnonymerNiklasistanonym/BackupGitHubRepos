# BackupGitHubRepos

Backup GitHub hosted repositories to a local directory.

## Instructions

1. Create GitHub access token with full `repo` level to access (only clone) private repositories
2. Edit directory and account to backup of [`config.exmple.json`](config.exmple.json) and save it as `config.json`

    ```json
    {
        "githubapi": {
            "oauthtoken": "TODO_FULL_REPO_LEVEL_ACCESS_TOKEN",
            "owner": "AnonymerNiklasistanonym"
        },
        "backupdir": "backup"
    }
   ```

3. Run script

   ```sh
   npm install
   # -------- Normal ----------
   npm run build
   npm prune --production
   node .
   # -------- Dev    ----------
   npm run dev
   ```
