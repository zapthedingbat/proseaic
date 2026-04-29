# Changelog

## [1.2.0](https://github.com/zapthedingbat/proseaic/compare/v1.1.0...v1.2.0) (2026-04-29)


### Features

* add Sentry error monitoring with opt-in settings toggle ([#40](https://github.com/zapthedingbat/proseaic/issues/40)) ([f3e5847](https://github.com/zapthedingbat/proseaic/commit/f3e58473c73734aa1f47c92c45c23bd25e3ac2de))


### Bug Fixes

* pass --repo flag to gh workflow run ([#42](https://github.com/zapthedingbat/proseaic/issues/42)) ([bc8335b](https://github.com/zapthedingbat/proseaic/commit/bc8335b2f5362ad77a319601a32cc24a1ad90a5e))
* persist task_complete tool results to history ([#37](https://github.com/zapthedingbat/proseaic/issues/37)) ([724c490](https://github.com/zapthedingbat/proseaic/commit/724c490d051b018c45284a2f0a9e6d2d63c19cc5))
* trigger CI on release-please PR branches ([#41](https://github.com/zapthedingbat/proseaic/issues/41)) ([625bbb6](https://github.com/zapthedingbat/proseaic/commit/625bbb6ac9aa9052201873ce5a2de0b49a7c1847))
* use explicit WriteParams for FileSystemWritableFileStream.write ([#39](https://github.com/zapthedingbat/proseaic/issues/39)) ([918747c](https://github.com/zapthedingbat/proseaic/commit/918747c9a94f9c1d81b6d79df63fb016fb1d9ace))

## [1.1.0](https://github.com/zapthedingbat/proseaic/compare/v1.0.3...v1.1.0) (2026-04-29)


### Features

* add content hashing, SRI, and cache headers for browser assets ([#35](https://github.com/zapthedingbat/proseaic/issues/35)) ([eff043f](https://github.com/zapthedingbat/proseaic/commit/eff043fa353f722b0cda727dd9b4c268fbb9e14b))

## [1.0.3](https://github.com/zapthedingbat/proseaic/compare/v1.0.2...v1.0.3) (2026-04-29)


### Bug Fixes

* correct asset paths for GitHub Pages deployment ([#33](https://github.com/zapthedingbat/proseaic/issues/33)) ([ecb5a64](https://github.com/zapthedingbat/proseaic/commit/ecb5a64191ccc214064cfddafc2e6ccea2bf7b22))

## [1.0.2](https://github.com/zapthedingbat/proseaic/compare/v1.0.1...v1.0.2) (2026-04-29)


### Bug Fixes

* change FileSystemDocumentStore namespace to match store regex ([#31](https://github.com/zapthedingbat/proseaic/issues/31)) ([d52cc1c](https://github.com/zapthedingbat/proseaic/commit/d52cc1c983a43e12f641fd02d5182046cddb5586))

## [1.0.1](https://github.com/zapthedingbat/proseaic/compare/v1.0.0...v1.0.1) (2026-04-29)


### Bug Fixes

* move Pages deploy into release-please workflow ([#29](https://github.com/zapthedingbat/proseaic/issues/29)) ([c2479d5](https://github.com/zapthedingbat/proseaic/commit/c2479d54a99054bd63e2dcac4cdc2078f44ac20c))

## 1.0.0 (2026-04-29)


### Features

* add docs/ site for GitHub Pages and update-docs skill ([#17](https://github.com/zapthedingbat/proseaic/issues/17)) ([ba52997](https://github.com/zapthedingbat/proseaic/commit/ba52997d5b7704b2d255f087e6a1242b5238fe08))
* add setting to disable AI autocomplete ([#18](https://github.com/zapthedingbat/proseaic/issues/18)) ([f59ca0d](https://github.com/zapthedingbat/proseaic/commit/f59ca0de19d51f15c52d14f6319720fb2984594b))
* demo mode for GitHub Pages and tag-based releases ([#22](https://github.com/zapthedingbat/proseaic/issues/22)) ([2bbd151](https://github.com/zapthedingbat/proseaic/commit/2bbd15196feb21018322c9d14cdcd5b028dbf8bd))
* Implement core UI components for Markdown AI Editor ([f4ac073](https://github.com/zapthedingbat/proseaic/commit/f4ac073c873aaa7b3f3ddfb1bc133f5bbab4077c))
* Implement inline completion service and related components ([#6](https://github.com/zapthedingbat/proseaic/issues/6)) ([9cdb778](https://github.com/zapthedingbat/proseaic/commit/9cdb7782c0cece88bee360cf4cbccc4a80fcc1e7))
* open source prep, all platforms with BYOK key-gating ([#15](https://github.com/zapthedingbat/proseaic/issues/15)) ([0dbe8cf](https://github.com/zapthedingbat/proseaic/commit/0dbe8cf444ec4095ce2978882b66d6efeb053ad1))
* replace textarea editor with CodeMirror 6 ([#19](https://github.com/zapthedingbat/proseaic/issues/19)) ([bf49934](https://github.com/zapthedingbat/proseaic/commit/bf49934370fac74f8d5e6d89960df9cba5005f23))


### Bug Fixes

* emit change event after structured-document mutations in CodeMirrorEditor ([#21](https://github.com/zapthedingbat/proseaic/issues/21)) ([67d6519](https://github.com/zapthedingbat/proseaic/commit/67d65195afe3e7465bded89fa53f819ddd0956eb))
* FileSystemDocumentStore invalid filename error ([#24](https://github.com/zapthedingbat/proseaic/issues/24)) ([b57b1bc](https://github.com/zapthedingbat/proseaic/commit/b57b1bcfa292a314392d96db13ec817e3ff0d3ae))
