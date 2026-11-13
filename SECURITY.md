# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |
| Earlier | No |

## Reporting a vulnerability

Email **NoxaPlus2025@gmail.com** with a description, reproduction steps, and the affected version. Do not open a public issue for a suspected vulnerability.

Please include:

- the RepoPulse version (`repopulse --version`);
- the command you ran, with tokens and private repository names removed;
- what you expected and what happened;
- any relevant report or terminal output, redacted.

You can expect an initial response within seven days. Confirmed issues are fixed in a patch release and credited unless you ask to stay anonymous. There is no paid bug bounty.

## Scope notes

- RepoPulse only performs read-only requests to the GitHub REST API. It does not modify repositories.
- Audit reports contain public repository metadata. Treat reports for private repositories as sensitive.
- Tokens are read from `GITHUB_TOKEN`, `GH_TOKEN`, or `--token` and are sent only to `api.github.com`.
- Reports render repository-controlled strings through HTML escaping. If you find a way to execute script from repository metadata, treat it as a security issue.
- Dependency update and code-scanning checks inspect configuration files; they are not a substitute for a security audit.
