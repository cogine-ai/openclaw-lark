# 2026.10.10-cogine.4 acceptance

Target: macOS, Node 24.22.1, OpenClaw 2026.10.6. Plugin identity, 39 tool contracts, bot configuration and existing Keychain authorization remain unchanged.

## Source and package checks

- 509 tests passed across 60 files, including actual Core dispatcher ownership and SSRF guard regressions, OAuth continuation, attachment names and inbound command authorization.
- Typecheck, lint (zero errors; existing warnings), build and package checks passed. Production dependency audit reported no advisories.
- The final archive enables Core's existing `allowRfc2544BenchmarkRange` option to retain fake-IP proxy support for `198.18.0.0/15`. Loopback, RFC 1918, CGNAT, mapped-private IPv6 and configured denied hostnames remain blocked.

## Single-Mac package pilot

- Final archive SHA-256: `b132f0d9c8f344756c18c6eaa5ff098e4e0e7404d3b3c039a2a16e0f55adc6a2`. All 25 package files match the installed archive; Gateway registers all 39 tools.
- The installed parser escapes the malicious link-destination fixture. The installed downloader rejects loopback, mapped-private IPv6, CGNAT and configured denied hosts with Core's SSRF guard.
- A real public image download through a fake-IP proxy and public redirect was sent to Feishu and read back as an image.
- Real Vorbis `.ogg` and Opus `.ogg` uploads were read back from Feishu as `file` and `audio`, respectively.
- Redirect-to-private rejection was exercised against the installed downloader and real Core guard with controlled HTTP responses. Public redirect fixtures returned HTTP 403 and were not counted as proof of this rejection.
- Bot configuration, credential files and existing Keychain grant were preserved during both package installs.
- Agent streaming, read-only office tools and post-reply Gateway drain acceptance remain pending an independently configured API provider. No stable npm publication has occurred yet.


## Upstream references

- Dispatcher lifetime: [Cogine PR #3](https://github.com/cogine-ai/openclaw-lark/pull/3), already merged and now included in this release branch.
- Media downloads: reuse the existing `openclaw/plugin-sdk/ssrf-runtime` implementation in Core 2026.10.6; forward only the configured hostname deny list as in [OpenClaw PR #198428](https://github.com/openclaw/openclaw/pull/198428).
- Link destination escaping: [OpenClaw PR #199339](https://github.com/openclaw/openclaw/pull/199339).
- Ogg Opus identification: [OpenClaw PR #199579](https://github.com/openclaw/openclaw/pull/199579). This plugin uses ordinary-file fallback, without adding voice transcoding.
