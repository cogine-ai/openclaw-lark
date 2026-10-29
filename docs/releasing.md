# Public npm releases

Package: `@cogineai/openclaw-lark`. The cogineai scope is the npm namespace; the GitHub owner remains cogine-ai. Public access is not restricted to organization members. `publishConfig.access=public` makes the package installable by everyone. GitHub repository ownership and npm scope permissions are separate: a publisher must have npm access to the cogineai scope.

Current stable version: `2026.10.10-cogine.2`, available through the default `latest` tag. The initial cogine.1 release was published through `next` and then designated stable after the single-Mac acceptance. Each package archive remains immutable; this patch has its own verification record.

## Validate a release

1. Use Node 24.22.1 / pnpm 10.32.1. Update package version and changelog; commit the matching lockfile if dependencies change.
2. Run frozen install, typecheck, lint, tests, build and `pnpm check:pack`. Review [dependency status](dependency-status.md), resolve known production dependency advisories and pass `pnpm audit --prod --audit-level high` before publishing.
3. Pack the artifact, inspect its file list, and perform a single-machine pilot against the exact artifact. Verify native streaming and a genuinely new incremental read-only OAuth permission; after authorization do not send “continue”. Preserve a rollback package and state backup.
4. Review the diff and merge it; create a Git tag `v<package-version>` on the reviewed commit. Tags alone do not publish: the workflow is manual.

## Publish a new version

An npm publisher with permission for the `cogineai` namespace must authenticate locally (`npm login`, with the required 2FA). Do not put credentials in the repository or send them in chat.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:pack
pnpm audit --prod --audit-level high
# Build and publish the same inspected tarball; path depends on package version.
pnpm pack
npm publish ./cogineai-openclaw-lark-2026.10.10-cogine.2.tgz --access public --tag latest
```

This publishes the inspected cogine.2 archive directly as stable. Do not republish an existing version. Use a new version and matching artifact path for a future release, choosing `--tag latest` for a stable release or `--tag next` for a preview. Publishing is an explicit release action; preparing this repository does not execute it. Verify the registry version and test installation after publishing.

## Promote an existing package to stable

Point `latest` at the exact version that passed acceptance; do not rebuild or republish the package:

```sh
npm dist-tag add @cogineai/openclaw-lark@2026.10.10-cogine.2 latest
npm view @cogineai/openclaw-lark dist-tags --json
```

Keep the GitHub release status and installation documentation consistent with this decision. The default command is `openclaw plugins install @cogineai/openclaw-lark`. An existing `next` alias may remain on the same version until a later preview is published.

## Later publication with GitHub OIDC

First ensure GitHub Actions is allowed for this repository under the GitHub organization policy. Then configure a trusted publisher in the npm package settings:

- GitHub owner: `cogine-ai`
- Repository: `openclaw-lark`
- Workflow filename: `publish.yml`
- Permit direct `npm publish`; npm may default new trusted publishers to staged publishing only.

No long-lived npm token is required by this workflow. npm CLI must be at least 11.5.1; the workflow checks this. Trigger **Publish npm** manually on main and supply the reviewed release tag. The workflow checks out that tag, verifies the tag/package version match, reruns validation, checks package contents and publishes the generated tarball with provenance and public access. It uses the `next` tag for prerelease versions and `latest` for stable versions.

The workflow determines this tag from the version string: any hyphen selects `next`. Thus `2026.10.10-cogine.1` is a semver prerelease string even though it has now been designated stable through `latest`. Do not rerun the publish workflow for this already published version. Future automatically tagged stable releases should use a version without a prerelease suffix, or explicitly promote an accepted preview using the command above.

If the npm scope/package setup or trusted publisher is missing, complete that account-side setup first. Creating a public GitHub repository alone does not create an npm package or grant npm publish permission.

Sources: [npm public scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/), [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/).
