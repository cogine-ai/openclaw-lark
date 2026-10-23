# Public npm releases

Package: `@cogine-ai/openclaw-lark`. The scope is a package-name namespace, not an access restriction. `publishConfig.access=public` makes the package installable by everyone. GitHub repository ownership and npm scope permissions are separate: a publisher must have npm access to the cogine-ai scope.

Current source version: `2026.10.8-cogine.1`, first publication pending. The preview tag is `next`; do not advertise the npm install command as available before registry publication.

## Validate a release

1. Use Node 24.22.1 / pnpm 10.32.1. Update package version and changelog; commit the matching lockfile if dependencies change.
2. Run frozen install, typecheck, lint, tests, build and `pnpm check:pack`.
3. Pack the artifact, inspect its file list, and perform a single-machine pilot against the exact artifact. Verify native streaming and a genuinely new incremental read-only OAuth permission; after authorization do not send “continue”. Preserve a rollback package and state backup.
4. Review the diff and merge it; create a Git tag `v<package-version>` on the reviewed commit. Tags alone do not publish: the workflow is manual.

## First publication

An npm publisher with permission for the `cogine-ai` namespace must authenticate locally (`npm login`, with the required 2FA). Do not put credentials in the repository or send them in chat.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:pack
# Build and publish the same inspected tarball; path depends on package version.
pnpm pack
npm publish ./cogine-ai-openclaw-lark-2026.10.8-cogine.1.tgz --access public --tag next
```

Publishing is an explicit release action; preparing this repository does not execute it. Verify the registry version and test installation after publishing.

## Later publication with GitHub OIDC

Configure a trusted publisher in the npm package settings:

- GitHub owner: `cogine-ai`
- Repository: `openclaw-lark`
- Workflow filename: `publish.yml`
- Permit direct `npm publish`; npm may default new trusted publishers to staged publishing only.

No long-lived npm token is required by this workflow. npm CLI must be at least 11.5.1; the workflow checks this. Trigger **Publish npm** manually on main and supply the reviewed release tag. The workflow checks out that tag, verifies the tag/package version match, reruns validation, checks package contents and publishes the generated tarball with provenance and public access. It uses the `next` tag for prerelease versions and `latest` for stable versions.

If the npm scope/package setup or trusted publisher is missing, complete that account-side setup first. Creating a public GitHub repository alone does not create an npm package or grant npm publish permission.

Sources: [npm public scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/), [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/).
