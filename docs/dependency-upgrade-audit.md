# 依存関係の更新結果

2026-11-04 更新。以下は更新後の状態。後半に更新前の調査を保存する。

- 外部npm依存は262種類から227種類へ。既存122種類の版構成を更新し、20種類が追加、55種類が依存ツリーから除去された。
- Node 26.13.0 / npm 12.2.1、Jco 1.41.0、Playwright 1.64.1、Prettier 3.9.10、Vite 8.3.5へ更新。
- 通常のビルド・型検査はTypeScript 7.0.2。private workspace `@walos/docs-toolchain`にTypeDoc 0.28.20とTypeScript 6.0.3を隔離し、`npm run build:docs`で利用する。
- WASI SDK 34、wit-bindgen 0.63.0、wasm-tools 1.263.0へ統一。WASI P2 WITを0.2.8に更新し、生成bindingsも更新。P3は最新版0.3.2を維持。
- GitHub Actions 6種類を確認済みの最新リリースへ固定。CIランナーはPlaywrightが対応するUbuntu 26.04へ更新（26.10のhosted runner定義は未提供）。
- Jcoの生成型に引用符の揺れがあるため、生成後に固定版Prettierで整形しCIの差分を安定化。
- TypeScript 7のCompiler API変更に伴い、ランタイム境界検査をOxcへ移行。型のみのimport、通常のimport、構文エラーの回帰テストを追加。
- SDK 34のP2 exit-with-code importにホストを対応。constructorの_Exit(126)は126を保持し、旧result形式のlibc main終了は1となる仕様差もテストで確認。

## 最新版へ置換しなかった依存

| 依存 | 維持する版 | 理由 |
|---|---|---|
| TypeDoc用TypeScript | 6.0.3 | 指示どおり6系に分離。通常のtscは7.0.2 |
| TypeDoc配下minimatch | 10.2.6 | 11.0.4で実際にドキュメント生成が失敗（削除されたmatchOne API）。Jco側は11.0.4へ更新 |
| Jcoのcomponentize-js-0-19-3 alias | 0.19.3 | Jcoが旧エンジン互換用として明示的に別名固定。通常のcomponentize-jsは0.23.0 |
| componentize-js配下wizer | 10.0.0 | 親が要求するエンジンの組み合わせを維持。11.0.3への強制更新は行わない |
| Jco配下@noble/hashes | 1.8.0 | 親のcrypto実装が旧subpath（sha1, sha2等）を使用。2系への強制更新は非互換 |
| Jco内部typescript-compiler-api alias | 6.0.3 | サードパーティの旧Compiler API用依存。プロジェクトのtscとは別。7のroot exportには旧APIがない |
| @oxc-project/types | 0.156.0の配置も残る | Rolldownが要求する型定義の版。Parser/minifierは0.157.0へ更新 |
| jsco / unenv / @emnapi系 | 現在のpreview・rc・beta | npm latestより新しい系列を親が要求。ダウングレードしない |
| WASI P3 / TypeDoc / mise / sbase | 既存版 | 確認した配布元の最新版と一致 |

npm auditはTypeDocのminimatchに起因するmoderate 2件（原因1件＋親への波及）を報告する。
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)。
互換性のないminimatch 11への強制更新やTypeDocのダウングレードは行っていない。

## 更新後の全npm依存

名前で集約。aliasの実名、全プラットフォームの任意依存も含む。latestは公式レジストリへの再照会結果であり、差異のあるものは上記の理由で維持する。

| 名前 / 公式レジストリ | lock内の版 | latest |
|---|---|---|
| [@andreiltd/componentize-qjs-binding-darwin-arm64](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-darwin-arm64/latest) | 0.5.0 | 0.5.0 |
| [@andreiltd/componentize-qjs-binding-darwin-x64](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-darwin-x64/latest) | 0.5.0 | 0.5.0 |
| [@andreiltd/componentize-qjs-binding-linux-arm64-gnu](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-linux-arm64-gnu/latest) | 0.5.0 | 0.5.0 |
| [@andreiltd/componentize-qjs-binding-linux-arm64-musl](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-linux-arm64-musl/latest) | 0.5.0 | 0.5.0 |
| [@andreiltd/componentize-qjs-binding-linux-x64-gnu](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-linux-x64-gnu/latest) | 0.5.0 | 0.5.0 |
| [@andreiltd/componentize-qjs-binding-linux-x64-musl](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-linux-x64-musl/latest) | 0.5.0 | 0.5.0 |
| [@andreiltd/componentize-qjs-binding-win32-arm64-msvc](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-win32-arm64-msvc/latest) | 0.5.0 | 0.5.0 |
| [@andreiltd/componentize-qjs-binding-win32-x64-msvc](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-win32-x64-msvc/latest) | 0.5.0 | 0.5.0 |
| [@bytecodealliance/componentize-js](https://registry.npmjs.org/@bytecodealliance/componentize-js/latest) | 0.19.3, 0.23.0 | 0.23.0 |
| [@bytecodealliance/jco](https://registry.npmjs.org/@bytecodealliance/jco/latest) | 1.41.0 | 1.41.0 |
| [@bytecodealliance/jco-node-fs](https://registry.npmjs.org/@bytecodealliance/jco-node-fs/latest) | 0.3.2 | 0.3.2 |
| [@bytecodealliance/jco-node-fs-darwin-arm64](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-darwin-arm64/latest) | 0.3.2 | 0.3.2 |
| [@bytecodealliance/jco-node-fs-darwin-x64](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-darwin-x64/latest) | 0.3.2 | 0.3.2 |
| [@bytecodealliance/jco-node-fs-linux-arm64-gnu](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-linux-arm64-gnu/latest) | 0.3.2 | 0.3.2 |
| [@bytecodealliance/jco-node-fs-linux-arm64-musl](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-linux-arm64-musl/latest) | 0.3.2 | 0.3.2 |
| [@bytecodealliance/jco-node-fs-linux-x64-gnu](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-linux-x64-gnu/latest) | 0.3.2 | 0.3.2 |
| [@bytecodealliance/jco-node-fs-linux-x64-musl](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-linux-x64-musl/latest) | 0.3.2 | 0.3.2 |
| [@bytecodealliance/jco-node-fs-win32-arm64-msvc](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-win32-arm64-msvc/latest) | 0.3.2 | 0.3.2 |
| [@bytecodealliance/jco-node-fs-win32-x64-msvc](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-win32-x64-msvc/latest) | 0.3.2 | 0.3.2 |
| [@bytecodealliance/jco-std](https://registry.npmjs.org/@bytecodealliance/jco-std/latest) | 0.10.0 | 0.10.0 |
| [@bytecodealliance/jco-transpile](https://registry.npmjs.org/@bytecodealliance/jco-transpile/latest) | 0.23.0 | 0.23.0 |
| [@bytecodealliance/preview2-shim](https://registry.npmjs.org/@bytecodealliance/preview2-shim/latest) | 0.31.0 | 0.31.0 |
| [@bytecodealliance/preview3-shim](https://registry.npmjs.org/@bytecodealliance/preview3-shim/latest) | 0.13.0 | 0.13.0 |
| [@bytecodealliance/weval](https://registry.npmjs.org/@bytecodealliance/weval/latest) | 0.5.1 | 0.5.1 |
| [@bytecodealliance/wizer](https://registry.npmjs.org/@bytecodealliance/wizer/latest) | 10.0.0 | 11.0.3 |
| [@bytecodealliance/wizer-darwin-arm64](https://registry.npmjs.org/@bytecodealliance/wizer-darwin-arm64/latest) | 10.0.0 | 11.0.3 |
| [@bytecodealliance/wizer-darwin-x64](https://registry.npmjs.org/@bytecodealliance/wizer-darwin-x64/latest) | 10.0.0 | 11.0.3 |
| [@bytecodealliance/wizer-linux-arm64](https://registry.npmjs.org/@bytecodealliance/wizer-linux-arm64/latest) | 10.0.0 | 11.0.3 |
| [@bytecodealliance/wizer-linux-s390x](https://registry.npmjs.org/@bytecodealliance/wizer-linux-s390x/latest) | 10.0.0 | 11.0.3 |
| [@bytecodealliance/wizer-linux-x64](https://registry.npmjs.org/@bytecodealliance/wizer-linux-x64/latest) | 10.0.0 | 11.0.3 |
| [@bytecodealliance/wizer-win32-x64](https://registry.npmjs.org/@bytecodealliance/wizer-win32-x64/latest) | 10.0.0 | 11.0.3 |
| [@emnapi/core](https://registry.npmjs.org/@emnapi/core/latest) | 2.0.0-beta.3 | 1.11.3 |
| [@emnapi/runtime](https://registry.npmjs.org/@emnapi/runtime/latest) | 2.0.0-beta.3 | 1.11.3 |
| [@emnapi/wasi-threads](https://registry.npmjs.org/@emnapi/wasi-threads/latest) | 2.2.0 | 2.2.0 |
| [@exodus/bytes](https://registry.npmjs.org/@exodus/bytes/latest) | 1.16.0 | 1.16.0 |
| [@gerrit0/mini-shiki](https://registry.npmjs.org/@gerrit0/mini-shiki/latest) | 3.23.0 | 3.23.0 |
| [@isaacs/fs-minipass](https://registry.npmjs.org/@isaacs/fs-minipass/latest) | 4.0.1 | 4.0.1 |
| [@isaacs/nonrecursive-glob-match](https://registry.npmjs.org/@isaacs/nonrecursive-glob-match/latest) | 1.0.3 | 1.0.3 |
| [@napi-rs/lzma](https://registry.npmjs.org/@napi-rs/lzma/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-android-arm-eabi](https://registry.npmjs.org/@napi-rs/lzma-android-arm-eabi/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-android-arm64](https://registry.npmjs.org/@napi-rs/lzma-android-arm64/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-darwin-arm64](https://registry.npmjs.org/@napi-rs/lzma-darwin-arm64/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-darwin-x64](https://registry.npmjs.org/@napi-rs/lzma-darwin-x64/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-freebsd-x64](https://registry.npmjs.org/@napi-rs/lzma-freebsd-x64/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-linux-arm-gnueabihf](https://registry.npmjs.org/@napi-rs/lzma-linux-arm-gnueabihf/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-linux-arm64-gnu](https://registry.npmjs.org/@napi-rs/lzma-linux-arm64-gnu/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-linux-arm64-musl](https://registry.npmjs.org/@napi-rs/lzma-linux-arm64-musl/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-linux-ppc64-gnu](https://registry.npmjs.org/@napi-rs/lzma-linux-ppc64-gnu/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-linux-riscv64-gnu](https://registry.npmjs.org/@napi-rs/lzma-linux-riscv64-gnu/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-linux-s390x-gnu](https://registry.npmjs.org/@napi-rs/lzma-linux-s390x-gnu/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-linux-x64-gnu](https://registry.npmjs.org/@napi-rs/lzma-linux-x64-gnu/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-linux-x64-musl](https://registry.npmjs.org/@napi-rs/lzma-linux-x64-musl/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-wasm32-wasi](https://registry.npmjs.org/@napi-rs/lzma-wasm32-wasi/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-win32-arm64-msvc](https://registry.npmjs.org/@napi-rs/lzma-win32-arm64-msvc/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-win32-ia32-msvc](https://registry.npmjs.org/@napi-rs/lzma-win32-ia32-msvc/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/lzma-win32-x64-msvc](https://registry.npmjs.org/@napi-rs/lzma-win32-x64-msvc/latest) | 1.5.3 | 1.5.3 |
| [@napi-rs/wasm-runtime](https://registry.npmjs.org/@napi-rs/wasm-runtime/latest) | 1.2.7 | 1.2.7 |
| [@noble/hashes](https://registry.npmjs.org/@noble/hashes/latest) | 1.8.0 | 2.4.0 |
| [@oxc-minify/binding-android-arm-eabi](https://registry.npmjs.org/@oxc-minify/binding-android-arm-eabi/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-android-arm64](https://registry.npmjs.org/@oxc-minify/binding-android-arm64/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-darwin-arm64](https://registry.npmjs.org/@oxc-minify/binding-darwin-arm64/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-darwin-x64](https://registry.npmjs.org/@oxc-minify/binding-darwin-x64/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-freebsd-x64](https://registry.npmjs.org/@oxc-minify/binding-freebsd-x64/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-linux-arm-gnueabihf](https://registry.npmjs.org/@oxc-minify/binding-linux-arm-gnueabihf/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-linux-arm-musleabihf](https://registry.npmjs.org/@oxc-minify/binding-linux-arm-musleabihf/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-linux-arm64-gnu](https://registry.npmjs.org/@oxc-minify/binding-linux-arm64-gnu/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-linux-arm64-musl](https://registry.npmjs.org/@oxc-minify/binding-linux-arm64-musl/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-linux-ppc64-gnu](https://registry.npmjs.org/@oxc-minify/binding-linux-ppc64-gnu/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-linux-riscv64-gnu](https://registry.npmjs.org/@oxc-minify/binding-linux-riscv64-gnu/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-linux-riscv64-musl](https://registry.npmjs.org/@oxc-minify/binding-linux-riscv64-musl/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-linux-s390x-gnu](https://registry.npmjs.org/@oxc-minify/binding-linux-s390x-gnu/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-linux-x64-gnu](https://registry.npmjs.org/@oxc-minify/binding-linux-x64-gnu/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-linux-x64-musl](https://registry.npmjs.org/@oxc-minify/binding-linux-x64-musl/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-openharmony-arm64](https://registry.npmjs.org/@oxc-minify/binding-openharmony-arm64/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-win32-arm64-msvc](https://registry.npmjs.org/@oxc-minify/binding-win32-arm64-msvc/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-win32-ia32-msvc](https://registry.npmjs.org/@oxc-minify/binding-win32-ia32-msvc/latest) | 0.157.0 | 0.157.0 |
| [@oxc-minify/binding-win32-x64-msvc](https://registry.npmjs.org/@oxc-minify/binding-win32-x64-msvc/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-android-arm-eabi](https://registry.npmjs.org/@oxc-parser/binding-android-arm-eabi/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-android-arm64](https://registry.npmjs.org/@oxc-parser/binding-android-arm64/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-darwin-arm64](https://registry.npmjs.org/@oxc-parser/binding-darwin-arm64/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-darwin-x64](https://registry.npmjs.org/@oxc-parser/binding-darwin-x64/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-freebsd-x64](https://registry.npmjs.org/@oxc-parser/binding-freebsd-x64/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-linux-arm-gnueabihf](https://registry.npmjs.org/@oxc-parser/binding-linux-arm-gnueabihf/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-linux-arm-musleabihf](https://registry.npmjs.org/@oxc-parser/binding-linux-arm-musleabihf/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-linux-arm64-gnu](https://registry.npmjs.org/@oxc-parser/binding-linux-arm64-gnu/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-linux-arm64-musl](https://registry.npmjs.org/@oxc-parser/binding-linux-arm64-musl/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-linux-ppc64-gnu](https://registry.npmjs.org/@oxc-parser/binding-linux-ppc64-gnu/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-linux-riscv64-gnu](https://registry.npmjs.org/@oxc-parser/binding-linux-riscv64-gnu/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-linux-riscv64-musl](https://registry.npmjs.org/@oxc-parser/binding-linux-riscv64-musl/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-linux-s390x-gnu](https://registry.npmjs.org/@oxc-parser/binding-linux-s390x-gnu/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-linux-x64-gnu](https://registry.npmjs.org/@oxc-parser/binding-linux-x64-gnu/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-linux-x64-musl](https://registry.npmjs.org/@oxc-parser/binding-linux-x64-musl/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-openharmony-arm64](https://registry.npmjs.org/@oxc-parser/binding-openharmony-arm64/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-win32-arm64-msvc](https://registry.npmjs.org/@oxc-parser/binding-win32-arm64-msvc/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-win32-ia32-msvc](https://registry.npmjs.org/@oxc-parser/binding-win32-ia32-msvc/latest) | 0.157.0 | 0.157.0 |
| [@oxc-parser/binding-win32-x64-msvc](https://registry.npmjs.org/@oxc-parser/binding-win32-x64-msvc/latest) | 0.157.0 | 0.157.0 |
| [@oxc-project/types](https://registry.npmjs.org/@oxc-project/types/latest) | 0.156.0, 0.157.0 | 0.157.0 |
| [@pavelsavara/jsco](https://registry.npmjs.org/@pavelsavara/jsco/latest) | 0.2.0-preview.2 | 0.2.0-preview.0 |
| [@playwright/test](https://registry.npmjs.org/@playwright/test/latest) | 1.64.1 | 1.64.1 |
| [@rolldown/binding-android-arm-eabi](https://registry.npmjs.org/@rolldown/binding-android-arm-eabi/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-android-arm64](https://registry.npmjs.org/@rolldown/binding-android-arm64/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-darwin-arm64](https://registry.npmjs.org/@rolldown/binding-darwin-arm64/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-darwin-x64](https://registry.npmjs.org/@rolldown/binding-darwin-x64/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-freebsd-x64](https://registry.npmjs.org/@rolldown/binding-freebsd-x64/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-linux-arm-gnueabihf](https://registry.npmjs.org/@rolldown/binding-linux-arm-gnueabihf/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-linux-arm64-gnu](https://registry.npmjs.org/@rolldown/binding-linux-arm64-gnu/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-linux-arm64-musl](https://registry.npmjs.org/@rolldown/binding-linux-arm64-musl/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-linux-ppc64-gnu](https://registry.npmjs.org/@rolldown/binding-linux-ppc64-gnu/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-linux-s390x-gnu](https://registry.npmjs.org/@rolldown/binding-linux-s390x-gnu/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-linux-x64-gnu](https://registry.npmjs.org/@rolldown/binding-linux-x64-gnu/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-linux-x64-musl](https://registry.npmjs.org/@rolldown/binding-linux-x64-musl/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-openharmony-arm64](https://registry.npmjs.org/@rolldown/binding-openharmony-arm64/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-win32-arm64-msvc](https://registry.npmjs.org/@rolldown/binding-win32-arm64-msvc/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/binding-win32-x64-msvc](https://registry.npmjs.org/@rolldown/binding-win32-x64-msvc/latest) | 1.2.16 | 1.2.16 |
| [@rolldown/pluginutils](https://registry.npmjs.org/@rolldown/pluginutils/latest) | 1.0.1 | 1.0.1 |
| [@shikijs/engine-oniguruma](https://registry.npmjs.org/@shikijs/engine-oniguruma/latest) | 4.6.0 | 4.6.0 |
| [@shikijs/langs](https://registry.npmjs.org/@shikijs/langs/latest) | 4.6.0 | 4.6.0 |
| [@shikijs/themes](https://registry.npmjs.org/@shikijs/themes/latest) | 4.6.0 | 4.6.0 |
| [@shikijs/types](https://registry.npmjs.org/@shikijs/types/latest) | 4.6.0 | 4.6.0 |
| [@shikijs/vscode-textmate](https://registry.npmjs.org/@shikijs/vscode-textmate/latest) | 10.1.0 | 10.1.0 |
| [@tybys/wasm-util](https://registry.npmjs.org/@tybys/wasm-util/latest) | 0.10.4 | 0.10.4 |
| [@types/hast](https://registry.npmjs.org/@types/hast/latest) | 3.0.5 | 3.0.5 |
| [@types/unist](https://registry.npmjs.org/@types/unist/latest) | 3.0.3 | 3.0.3 |
| [@typescript/typescript-aix-ppc64](https://registry.npmjs.org/@typescript/typescript-aix-ppc64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-darwin-arm64](https://registry.npmjs.org/@typescript/typescript-darwin-arm64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-darwin-x64](https://registry.npmjs.org/@typescript/typescript-darwin-x64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-freebsd-arm64](https://registry.npmjs.org/@typescript/typescript-freebsd-arm64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-freebsd-x64](https://registry.npmjs.org/@typescript/typescript-freebsd-x64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-linux-arm](https://registry.npmjs.org/@typescript/typescript-linux-arm/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-linux-arm64](https://registry.npmjs.org/@typescript/typescript-linux-arm64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-linux-loong64](https://registry.npmjs.org/@typescript/typescript-linux-loong64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-linux-mips64el](https://registry.npmjs.org/@typescript/typescript-linux-mips64el/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-linux-ppc64](https://registry.npmjs.org/@typescript/typescript-linux-ppc64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-linux-riscv64](https://registry.npmjs.org/@typescript/typescript-linux-riscv64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-linux-s390x](https://registry.npmjs.org/@typescript/typescript-linux-s390x/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-linux-x64](https://registry.npmjs.org/@typescript/typescript-linux-x64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-netbsd-arm64](https://registry.npmjs.org/@typescript/typescript-netbsd-arm64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-netbsd-x64](https://registry.npmjs.org/@typescript/typescript-netbsd-x64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-openbsd-arm64](https://registry.npmjs.org/@typescript/typescript-openbsd-arm64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-openbsd-x64](https://registry.npmjs.org/@typescript/typescript-openbsd-x64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-sunos-x64](https://registry.npmjs.org/@typescript/typescript-sunos-x64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-win32-arm64](https://registry.npmjs.org/@typescript/typescript-win32-arm64/latest) | 7.0.2 | 7.0.2 |
| [@typescript/typescript-win32-x64](https://registry.npmjs.org/@typescript/typescript-win32-x64/latest) | 7.0.2 | 7.0.2 |
| [abort-controller](https://registry.npmjs.org/abort-controller/latest) | 3.0.0 | 3.0.0 |
| [acorn](https://registry.npmjs.org/acorn/latest) | 8.19.0 | 8.19.0 |
| [acorn-walk](https://registry.npmjs.org/acorn-walk/latest) | 8.3.5 | 8.3.5 |
| [argparse](https://registry.npmjs.org/argparse/latest) | 3.0.4 | 3.0.4 |
| [balanced-match](https://registry.npmjs.org/balanced-match/latest) | 5.0.0 | 5.0.0 |
| [base64-js](https://registry.npmjs.org/base64-js/latest) | 1.5.1 | 1.5.1 |
| [binaryen](https://registry.npmjs.org/binaryen/latest) | 132.0.0 | 132.0.0 |
| [brace-expansion](https://registry.npmjs.org/brace-expansion/latest) | 5.0.12 | 5.0.12 |
| [buffer](https://registry.npmjs.org/buffer/latest) | 6.0.3 | 6.0.3 |
| [chownr](https://registry.npmjs.org/chownr/latest) | 3.0.0 | 3.0.0 |
| [commander](https://registry.npmjs.org/commander/latest) | 15.0.0 | 15.0.0 |
| [componentize-qjs](https://registry.npmjs.org/componentize-qjs/latest) | 0.5.0 | 0.5.0 |
| [detect-libc](https://registry.npmjs.org/detect-libc/latest) | 2.1.2 | 2.1.2 |
| [entities](https://registry.npmjs.org/entities/latest) | 9.0.0 | 9.0.0 |
| [es-module-lexer](https://registry.npmjs.org/es-module-lexer/latest) | 3.0.4 | 3.0.4 |
| [event-target-shim](https://registry.npmjs.org/event-target-shim/latest) | 6.0.2 | 6.0.2 |
| [events](https://registry.npmjs.org/events/latest) | 3.3.0 | 3.3.0 |
| [fdir](https://registry.npmjs.org/fdir/latest) | 6.5.0 | 6.5.0 |
| [fflate](https://registry.npmjs.org/fflate/latest) | 0.8.3 | 0.8.3 |
| [fsevents](https://registry.npmjs.org/fsevents/latest) | 2.3.3 | 2.3.3 |
| [ieee754](https://registry.npmjs.org/ieee754/latest) | 1.2.1 | 1.2.1 |
| [jsesc](https://registry.npmjs.org/jsesc/latest) | 3.1.0 | 3.1.0 |
| [lightningcss](https://registry.npmjs.org/lightningcss/latest) | 1.33.0 | 1.33.0 |
| [lightningcss-android-arm64](https://registry.npmjs.org/lightningcss-android-arm64/latest) | 1.33.0 | 1.33.0 |
| [lightningcss-darwin-arm64](https://registry.npmjs.org/lightningcss-darwin-arm64/latest) | 1.33.0 | 1.33.0 |
| [lightningcss-darwin-x64](https://registry.npmjs.org/lightningcss-darwin-x64/latest) | 1.33.0 | 1.33.0 |
| [lightningcss-freebsd-x64](https://registry.npmjs.org/lightningcss-freebsd-x64/latest) | 1.33.0 | 1.33.0 |
| [lightningcss-linux-arm-gnueabihf](https://registry.npmjs.org/lightningcss-linux-arm-gnueabihf/latest) | 1.33.0 | 1.33.0 |
| [lightningcss-linux-arm64-gnu](https://registry.npmjs.org/lightningcss-linux-arm64-gnu/latest) | 1.33.0 | 1.33.0 |
| [lightningcss-linux-arm64-musl](https://registry.npmjs.org/lightningcss-linux-arm64-musl/latest) | 1.33.0 | 1.33.0 |
| [lightningcss-linux-x64-gnu](https://registry.npmjs.org/lightningcss-linux-x64-gnu/latest) | 1.33.0 | 1.33.0 |
| [lightningcss-linux-x64-musl](https://registry.npmjs.org/lightningcss-linux-x64-musl/latest) | 1.33.0 | 1.33.0 |
| [lightningcss-win32-arm64-msvc](https://registry.npmjs.org/lightningcss-win32-arm64-msvc/latest) | 1.33.0 | 1.33.0 |
| [lightningcss-win32-x64-msvc](https://registry.npmjs.org/lightningcss-win32-x64-msvc/latest) | 1.33.0 | 1.33.0 |
| [linkify-it](https://registry.npmjs.org/linkify-it/latest) | 6.1.0 | 6.1.0 |
| [lunr](https://registry.npmjs.org/lunr/latest) | 2.3.9 | 2.3.9 |
| [markdown-it](https://registry.npmjs.org/markdown-it/latest) | 15.0.3 | 15.0.3 |
| [mdurl](https://registry.npmjs.org/mdurl/latest) | 2.1.0 | 2.1.0 |
| [minimatch](https://registry.npmjs.org/minimatch/latest) | 10.2.6, 11.0.4 | 11.0.4 |
| [minipass](https://registry.npmjs.org/minipass/latest) | 7.1.3 | 7.1.3 |
| [minizlib](https://registry.npmjs.org/minizlib/latest) | 3.1.0 | 3.1.0 |
| [mkdirp](https://registry.npmjs.org/mkdirp/latest) | 3.0.1 | 3.0.1 |
| [nanoid](https://registry.npmjs.org/nanoid/latest) | 6.0.2 | 6.0.2 |
| [oxc-minify](https://registry.npmjs.org/oxc-minify/latest) | 0.157.0 | 0.157.0 |
| [oxc-parser](https://registry.npmjs.org/oxc-parser/latest) | 0.157.0 | 0.157.0 |
| [pathe](https://registry.npmjs.org/pathe/latest) | 2.0.3 | 2.0.3 |
| [picocolors](https://registry.npmjs.org/picocolors/latest) | 1.1.1 | 1.1.1 |
| [picomatch](https://registry.npmjs.org/picomatch/latest) | 4.0.7 | 4.0.7 |
| [playwright](https://registry.npmjs.org/playwright/latest) | 1.64.1 | 1.64.1 |
| [playwright-core](https://registry.npmjs.org/playwright-core/latest) | 1.64.1 | 1.64.1 |
| [postcss](https://registry.npmjs.org/postcss/latest) | 8.5.32 | 8.5.32 |
| [prettier](https://registry.npmjs.org/prettier/latest) | 3.9.10 | 3.9.10 |
| [process](https://registry.npmjs.org/process/latest) | 0.11.10 | 0.11.10 |
| [punycode](https://registry.npmjs.org/punycode/latest) | 2.3.1 | 2.3.1 |
| [punycode.js](https://registry.npmjs.org/punycode.js/latest) | 2.3.1 | 2.3.1 |
| [readable-stream](https://registry.npmjs.org/readable-stream/latest) | 4.8.0 | 4.8.0 |
| [regenerate](https://registry.npmjs.org/regenerate/latest) | 1.5.0 | 1.5.0 |
| [regenerate-unicode-properties](https://registry.npmjs.org/regenerate-unicode-properties/latest) | 10.3.0 | 10.3.0 |
| [regexpu-core](https://registry.npmjs.org/regexpu-core/latest) | 6.5.3 | 6.5.3 |
| [regjsgen](https://registry.npmjs.org/regjsgen/latest) | 0.8.0 | 0.8.0 |
| [regjsparser](https://registry.npmjs.org/regjsparser/latest) | 0.14.1 | 0.14.1 |
| [rolldown](https://registry.npmjs.org/rolldown/latest) | 1.2.16 | 1.2.16 |
| [safe-buffer](https://registry.npmjs.org/safe-buffer/latest) | 5.2.1 | 5.2.1 |
| [source-map-js](https://registry.npmjs.org/source-map-js/latest) | 1.2.2 | 1.2.2 |
| [string_decoder](https://registry.npmjs.org/string_decoder/latest) | 1.3.0 | 1.3.0 |
| [tar](https://registry.npmjs.org/tar/latest) | 7.5.22 | 7.5.22 |
| [tinyglobby](https://registry.npmjs.org/tinyglobby/latest) | 0.2.17 | 0.2.17 |
| [tr46](https://registry.npmjs.org/tr46/latest) | 7.0.0 | 7.0.0 |
| [tslib](https://registry.npmjs.org/tslib/latest) | 2.9.1 | 2.9.1 |
| [typedoc](https://registry.npmjs.org/typedoc/latest) | 0.28.20 | 0.28.20 |
| [typescript](https://registry.npmjs.org/typescript/latest) | 6.0.3, 7.0.2 | 7.0.2 |
| [uc.micro](https://registry.npmjs.org/uc.micro/latest) | 3.0.0 | 3.0.0 |
| [unenv](https://registry.npmjs.org/unenv/latest) | 2.0.0-rc.24 | 1.10.0 |
| [unicode-canonical-property-names-ecmascript](https://registry.npmjs.org/unicode-canonical-property-names-ecmascript/latest) | 3.0.0 | 3.0.0 |
| [unicode-match-property-ecmascript](https://registry.npmjs.org/unicode-match-property-ecmascript/latest) | 2.0.0 | 2.0.0 |
| [unicode-match-property-value-ecmascript](https://registry.npmjs.org/unicode-match-property-value-ecmascript/latest) | 2.2.1 | 2.2.1 |
| [unicode-property-aliases-ecmascript](https://registry.npmjs.org/unicode-property-aliases-ecmascript/latest) | 3.0.0 | 3.0.0 |
| [urlpattern-polyfill](https://registry.npmjs.org/urlpattern-polyfill/latest) | 10.1.0 | 10.1.0 |
| [vite](https://registry.npmjs.org/vite/latest) | 8.3.5 | 8.3.5 |
| [web-streams-polyfill](https://registry.npmjs.org/web-streams-polyfill/latest) | 4.5.0 | 4.5.0 |
| [webidl-conversions](https://registry.npmjs.org/webidl-conversions/latest) | 8.0.1 | 8.0.1 |
| [whatwg-url](https://registry.npmjs.org/whatwg-url/latest) | 17.3.0 | 17.3.0 |
| [yallist](https://registry.npmjs.org/yallist/latest) | 5.0.0 | 5.0.0 |
| [yaml](https://registry.npmjs.org/yaml/latest) | 2.9.1 | 2.9.1 |

## 検証結果

- npm 12.2.1で`npm ci`成功。`npm ls typescript typedoc minimatch`で依存ツリーの整合と7系/6系の分離を確認。
- 全ビルド、型検査、公開API型検査、ランタイム境界検査、WASI生成物の整合検査が成功。境界検査の回帰テスト3件成功。
- P2 WITを2回連続生成し、Prettierで正規化後に差分なし。P3 WIT生成も成功。
- 最新mainのタイムゾーン対応を取り込んだ状態で全ビルドを再検証。Chromium回帰テスト247件成功・6件スキップ、本番ビルドのブラウザーテスト6件成功。Pages・API docs検証も再実行して成功。
- TypeDoc生成成功（内部型への参照に関する警告5件）。Pagesのサブパス・API docs・再読込の検証成功。
- ベンチマーク統計テストと`benchmark -- --trials 1`成功。OSパッケージのpack dry-run成功。
- `git diff --check`成功。GitHub Actions自体のクラウド実行は未実施。
- Chromiumの実行には、この作業環境で不足する共有ライブラリを`/tmp`から補った。CIはPlaywrightの`install --with-deps`を利用する。

---

# 更新前の依存関係調査

確認日時（UTC）: 2026-11-03T15:25:43.080450+00:00

公式npm Registryのdist-tags/latest、GitHub Releases API、Node.js配布一覧を照合。最新版の存在確認であり、更新後の動作保証ではない。マニフェスト・lockfile・ソースは変更していない。

外部npmパッケージは名前で集約して **262種類**。判定: 更新あり 186種類、latestと一致 74種類、latestより新しい版を使用 2種類。複数版がある場合は1つでもlatest未満なら「更新あり」。

## 直接npm依存

| パッケージ | 現在の直接指定 | latest | 判定 |
|---|---|---|---|
| @walos/os | * | ローカルworkspace 0.3.0 | 外部更新対象外 |
| @bytecodealliance/jco | 1.39.0 | 1.41.0 | 更新あり |
| @playwright/test | 1.56.1 | 1.64.1 | 更新あり |
| prettier | 3.6.2 | 3.9.10 | 更新あり |
| typedoc | 0.28.20 | 0.28.20 | latestと一致 |
| typescript | 5.9.3 | 7.0.2 | 更新あり |
| vite | 7.1.12 | 8.3.5 | 更新あり |
| @pavelsavara/jsco | 0.2.0-preview.2 | 0.2.0-preview.0 | latestより新しい版を使用 |

`@pavelsavara/jsco` はlatest=0.2.0-preview.0、next=0.2.0-preview.2。現在はnextと一致し、latestへの変更はダウングレードになる。`unenv`も現在2.0.0-rc.24に対してlatestは1.10.0であり、ダウングレード対象。latestは安定版を意味するとは限らない。TypeScriptは直接指定5.9.3に加え、間接依存に6.0.3と7.0.2が存在する。

## npm以外の依存

| 依存 | 現在 | 最新・比較対象 | 判定 / 根拠 |
|---|---|---|
| bytecodealliance/wasm-tools | 1.262.0 | [v1.263.0](https://github.com/bytecodealliance/wasm-tools/releases/tag/v1.263.0) | 更新あり |
| bytecodealliance/wit-bindgen | 0.46.0 (P2), 0.63.0 (P3) | [v0.63.0](https://github.com/bytecodealliance/wit-bindgen/releases/tag/v0.63.0) | 旧版に更新あり / P3用は最新版 |
| WebAssembly/wasi-sdk | 27.0 (P1/P2), 34.0 (P3) | [wasi-sdk-34](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-34) | 旧版に更新あり / P3用は最新版 |
| WebAssembly/WASI | 0.3.2 (P3) | [v0.3.2](https://github.com/WebAssembly/WASI/releases/tag/v0.3.2) | 最新版と一致 |
| WebAssembly/wasi-cli | 0.2.0 (P2) | [v0.2.8](https://github.com/WebAssembly/wasi-cli/releases/tag/v0.2.8) | 更新あり |
| WebAssembly/wasi-clocks | 0.2.0 (P2) | [v0.2.8](https://github.com/WebAssembly/wasi-clocks/releases/tag/v0.2.8) | 更新あり |
| WebAssembly/wasi-filesystem | 0.2.0 (P2) | [v0.2.8](https://github.com/WebAssembly/wasi-filesystem/releases/tag/v0.2.8) | 更新あり |
| WebAssembly/wasi-io | 0.2.0 (P2) | [v0.2.8](https://github.com/WebAssembly/wasi-io/releases/tag/v0.2.8) | 更新あり |
| WebAssembly/wasi-random | deps.lockのみ (P2) | [v0.2.8](https://github.com/WebAssembly/wasi-random/releases/tag/v0.2.8) | lock記載のみ。P2実ファイルなし、使用中の版は特定不可 |
| WebAssembly/wasi-sockets | deps.lockのみ (P2) | [v0.2.8](https://github.com/WebAssembly/wasi-sockets/releases/tag/v0.2.8) | lock記載のみ。P2実ファイルなし、使用中の版は特定不可 |
| WebAssembly/wasi-http | 0.3.2 (P3、WASI統合版) | [v0.2.8](https://github.com/WebAssembly/wasi-http/releases/tag/v0.2.8) | P3はWASI統合版0.3.2で最新。別系列0.2.8への置換対象外 |
| actions/checkout | v4 | [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) | 更新あり |
| actions/setup-node | v4 | [v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) | 更新あり |
| actions/upload-artifact | v4 | [v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) | 更新あり |
| actions/upload-pages-artifact | v3 | [v5.0.0](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0) | 更新あり |
| actions/configure-pages | v5 | [v6.0.0](https://github.com/actions/configure-pages/releases/tag/v6.0.0) | 更新あり |
| actions/deploy-pages | v4 | [v5.0.1](https://github.com/actions/deploy-pages/releases/tag/v5.0.1) | 更新あり |
| jdx/mise | リポジトリ未固定 / 実行環境2026.10.25 | [v2026.10.25](https://github.com/jdx/mise/releases/tag/v2026.10.25) | 最新版と一致 |
| Node.js | mise/CI: 22、engines: >=22.14、実行環境22.23.4 | [26.13.0 LTS](https://nodejs.org/dist/index.json) | 更新あり。27 alphaは候補から除外 |
| sbase | b30fb56804bfed69b45ef0e944d2e029e4d26258 | [同一commit](https://github.com/michaelforney/sbase/commits/) | 記載されたGitHub取得元では更新なし。util.hはローカル加工 |
| Ubuntu / GitHub hosted runner | ubuntu-24.04 | [Ubuntu 26.10 / LTS 26.04.1](https://releases.ubuntu.com/) | OSに新版あり。CIランナー提供状況とPlaywright対応は別途条件 |
| npm | リポジトリ未固定 / 実行環境10.9.9 | [12.2.1](https://registry.npmjs.org/npm/latest) | 更新あり。Node条件: ^22.22.2 または ^24.15.0 または >=26.0.0 |
| Chromium / headless shell | 141.0.7390.37 (revision 1194) | [156.0.8078.4 (revision 1248)](https://registry.npmjs.org/playwright-core/1.64.1) | Playwright 1.64.1が指定する更新先。ブラウザー単体の最新版判定ではない |
| Playwright ffmpeg | revision 1011 | revision 1013 | Playwright更新に追従。winlddはrevision 1007で同一 |

GitHub公式runner-imagesにはUbuntu2604のイメージ定義が存在する（[公式一覧](https://github.com/actions/runner-images/tree/main/images/ubuntu)）。Ubuntu 26.10の定義は見つからず。Firefox/WebKitは現在のテスト設定で利用していないためブラウザー更新対象に含めない。

## 全npm依存（任意依存・間接依存を含む）

npm aliasは実際のパッケージ名に集約。例: componentize-js-0-19-3 → componentize-js、typescript-compiler-api → typescript。OS別バイナリは非利用プラットフォーム分も記載。

| パッケージ / 公式情報 | lock内の全バージョン | latest | 判定 |
|---|---|---|
| [@andreiltd/componentize-qjs-binding-darwin-arm64](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-darwin-arm64) | 0.4.5 | 0.5.0 | 更新あり |
| [@andreiltd/componentize-qjs-binding-darwin-x64](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-darwin-x64) | 0.4.5 | 0.5.0 | 更新あり |
| [@andreiltd/componentize-qjs-binding-linux-arm64-gnu](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-linux-arm64-gnu) | 0.4.5 | 0.5.0 | 更新あり |
| [@andreiltd/componentize-qjs-binding-linux-arm64-musl](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-linux-arm64-musl) | 0.4.5 | 0.5.0 | 更新あり |
| [@andreiltd/componentize-qjs-binding-linux-x64-gnu](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-linux-x64-gnu) | 0.4.5 | 0.5.0 | 更新あり |
| [@andreiltd/componentize-qjs-binding-linux-x64-musl](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-linux-x64-musl) | 0.4.5 | 0.5.0 | 更新あり |
| [@andreiltd/componentize-qjs-binding-win32-arm64-msvc](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-win32-arm64-msvc) | 0.4.5 | 0.5.0 | 更新あり |
| [@andreiltd/componentize-qjs-binding-win32-x64-msvc](https://registry.npmjs.org/@andreiltd/componentize-qjs-binding-win32-x64-msvc) | 0.4.5 | 0.5.0 | 更新あり |
| [@bytecodealliance/componentize-js](https://registry.npmjs.org/@bytecodealliance/componentize-js) | 0.19.3, 0.23.0 | 0.23.0 | 更新あり |
| [@bytecodealliance/jco](https://registry.npmjs.org/@bytecodealliance/jco) | 1.39.0 | 1.41.0 | 更新あり |
| [@bytecodealliance/jco-node-fs](https://registry.npmjs.org/@bytecodealliance/jco-node-fs) | 0.3.2 | 0.3.2 | latestと一致 |
| [@bytecodealliance/jco-node-fs-darwin-arm64](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-darwin-arm64) | 0.3.2 | 0.3.2 | latestと一致 |
| [@bytecodealliance/jco-node-fs-darwin-x64](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-darwin-x64) | 0.3.2 | 0.3.2 | latestと一致 |
| [@bytecodealliance/jco-node-fs-linux-arm64-gnu](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-linux-arm64-gnu) | 0.3.2 | 0.3.2 | latestと一致 |
| [@bytecodealliance/jco-node-fs-linux-arm64-musl](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-linux-arm64-musl) | 0.3.2 | 0.3.2 | latestと一致 |
| [@bytecodealliance/jco-node-fs-linux-x64-gnu](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-linux-x64-gnu) | 0.3.2 | 0.3.2 | latestと一致 |
| [@bytecodealliance/jco-node-fs-linux-x64-musl](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-linux-x64-musl) | 0.3.2 | 0.3.2 | latestと一致 |
| [@bytecodealliance/jco-node-fs-win32-arm64-msvc](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-win32-arm64-msvc) | 0.3.2 | 0.3.2 | latestと一致 |
| [@bytecodealliance/jco-node-fs-win32-x64-msvc](https://registry.npmjs.org/@bytecodealliance/jco-node-fs-win32-x64-msvc) | 0.3.2 | 0.3.2 | latestと一致 |
| [@bytecodealliance/jco-std](https://registry.npmjs.org/@bytecodealliance/jco-std) | 0.9.0 | 0.10.0 | 更新あり |
| [@bytecodealliance/jco-transpile](https://registry.npmjs.org/@bytecodealliance/jco-transpile) | 0.20.0 | 0.23.0 | 更新あり |
| [@bytecodealliance/preview2-shim](https://registry.npmjs.org/@bytecodealliance/preview2-shim) | 0.29.0, 0.30.0 | 0.31.0 | 更新あり |
| [@bytecodealliance/preview3-shim](https://registry.npmjs.org/@bytecodealliance/preview3-shim) | 0.10.0 | 0.13.0 | 更新あり |
| [@bytecodealliance/weval](https://registry.npmjs.org/@bytecodealliance/weval) | 0.5.1 | 0.5.1 | latestと一致 |
| [@bytecodealliance/wizer](https://registry.npmjs.org/@bytecodealliance/wizer) | 10.0.0 | 11.0.3 | 更新あり |
| [@bytecodealliance/wizer-darwin-arm64](https://registry.npmjs.org/@bytecodealliance/wizer-darwin-arm64) | 10.0.0 | 11.0.3 | 更新あり |
| [@bytecodealliance/wizer-darwin-x64](https://registry.npmjs.org/@bytecodealliance/wizer-darwin-x64) | 10.0.0 | 11.0.3 | 更新あり |
| [@bytecodealliance/wizer-linux-arm64](https://registry.npmjs.org/@bytecodealliance/wizer-linux-arm64) | 10.0.0 | 11.0.3 | 更新あり |
| [@bytecodealliance/wizer-linux-s390x](https://registry.npmjs.org/@bytecodealliance/wizer-linux-s390x) | 10.0.0 | 11.0.3 | 更新あり |
| [@bytecodealliance/wizer-linux-x64](https://registry.npmjs.org/@bytecodealliance/wizer-linux-x64) | 10.0.0 | 11.0.3 | 更新あり |
| [@bytecodealliance/wizer-win32-x64](https://registry.npmjs.org/@bytecodealliance/wizer-win32-x64) | 10.0.0 | 11.0.3 | 更新あり |
| [@emnapi/core](https://registry.npmjs.org/@emnapi/core) | 1.11.2 | 1.11.3 | 更新あり |
| [@emnapi/runtime](https://registry.npmjs.org/@emnapi/runtime) | 1.11.2 | 1.11.3 | 更新あり |
| [@emnapi/wasi-threads](https://registry.npmjs.org/@emnapi/wasi-threads) | 1.2.2 | 2.2.0 | 更新あり |
| [@esbuild/aix-ppc64](https://registry.npmjs.org/@esbuild/aix-ppc64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/android-arm](https://registry.npmjs.org/@esbuild/android-arm) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/android-arm64](https://registry.npmjs.org/@esbuild/android-arm64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/android-x64](https://registry.npmjs.org/@esbuild/android-x64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/darwin-arm64](https://registry.npmjs.org/@esbuild/darwin-arm64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/darwin-x64](https://registry.npmjs.org/@esbuild/darwin-x64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/freebsd-arm64](https://registry.npmjs.org/@esbuild/freebsd-arm64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/freebsd-x64](https://registry.npmjs.org/@esbuild/freebsd-x64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/linux-arm](https://registry.npmjs.org/@esbuild/linux-arm) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/linux-arm64](https://registry.npmjs.org/@esbuild/linux-arm64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/linux-ia32](https://registry.npmjs.org/@esbuild/linux-ia32) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/linux-loong64](https://registry.npmjs.org/@esbuild/linux-loong64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/linux-mips64el](https://registry.npmjs.org/@esbuild/linux-mips64el) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/linux-ppc64](https://registry.npmjs.org/@esbuild/linux-ppc64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/linux-riscv64](https://registry.npmjs.org/@esbuild/linux-riscv64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/linux-s390x](https://registry.npmjs.org/@esbuild/linux-s390x) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/linux-x64](https://registry.npmjs.org/@esbuild/linux-x64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/netbsd-arm64](https://registry.npmjs.org/@esbuild/netbsd-arm64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/netbsd-x64](https://registry.npmjs.org/@esbuild/netbsd-x64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/openbsd-arm64](https://registry.npmjs.org/@esbuild/openbsd-arm64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/openbsd-x64](https://registry.npmjs.org/@esbuild/openbsd-x64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/openharmony-arm64](https://registry.npmjs.org/@esbuild/openharmony-arm64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/sunos-x64](https://registry.npmjs.org/@esbuild/sunos-x64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/win32-arm64](https://registry.npmjs.org/@esbuild/win32-arm64) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/win32-ia32](https://registry.npmjs.org/@esbuild/win32-ia32) | 0.25.12 | 0.28.2 | 更新あり |
| [@esbuild/win32-x64](https://registry.npmjs.org/@esbuild/win32-x64) | 0.25.12 | 0.28.2 | 更新あり |
| [@gerrit0/mini-shiki](https://registry.npmjs.org/@gerrit0/mini-shiki) | 3.23.0 | 3.23.0 | latestと一致 |
| [@isaacs/fs-minipass](https://registry.npmjs.org/@isaacs/fs-minipass) | 4.0.1 | 4.0.1 | latestと一致 |
| [@napi-rs/lzma](https://registry.npmjs.org/@napi-rs/lzma) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-android-arm-eabi](https://registry.npmjs.org/@napi-rs/lzma-android-arm-eabi) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-android-arm64](https://registry.npmjs.org/@napi-rs/lzma-android-arm64) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-darwin-arm64](https://registry.npmjs.org/@napi-rs/lzma-darwin-arm64) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-darwin-x64](https://registry.npmjs.org/@napi-rs/lzma-darwin-x64) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-freebsd-x64](https://registry.npmjs.org/@napi-rs/lzma-freebsd-x64) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-linux-arm-gnueabihf](https://registry.npmjs.org/@napi-rs/lzma-linux-arm-gnueabihf) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-linux-arm64-gnu](https://registry.npmjs.org/@napi-rs/lzma-linux-arm64-gnu) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-linux-arm64-musl](https://registry.npmjs.org/@napi-rs/lzma-linux-arm64-musl) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-linux-ppc64-gnu](https://registry.npmjs.org/@napi-rs/lzma-linux-ppc64-gnu) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-linux-riscv64-gnu](https://registry.npmjs.org/@napi-rs/lzma-linux-riscv64-gnu) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-linux-s390x-gnu](https://registry.npmjs.org/@napi-rs/lzma-linux-s390x-gnu) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-linux-x64-gnu](https://registry.npmjs.org/@napi-rs/lzma-linux-x64-gnu) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-linux-x64-musl](https://registry.npmjs.org/@napi-rs/lzma-linux-x64-musl) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-wasm32-wasi](https://registry.npmjs.org/@napi-rs/lzma-wasm32-wasi) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-win32-arm64-msvc](https://registry.npmjs.org/@napi-rs/lzma-win32-arm64-msvc) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-win32-ia32-msvc](https://registry.npmjs.org/@napi-rs/lzma-win32-ia32-msvc) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/lzma-win32-x64-msvc](https://registry.npmjs.org/@napi-rs/lzma-win32-x64-msvc) | 1.5.1 | 1.5.3 | 更新あり |
| [@napi-rs/wasm-runtime](https://registry.npmjs.org/@napi-rs/wasm-runtime) | 0.2.12, 1.2.6 | 1.2.7 | 更新あり |
| [@noble/hashes](https://registry.npmjs.org/@noble/hashes) | 1.8.0 | 2.4.0 | 更新あり |
| [@oxc-minify/binding-android-arm-eabi](https://registry.npmjs.org/@oxc-minify/binding-android-arm-eabi) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-android-arm64](https://registry.npmjs.org/@oxc-minify/binding-android-arm64) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-darwin-arm64](https://registry.npmjs.org/@oxc-minify/binding-darwin-arm64) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-darwin-x64](https://registry.npmjs.org/@oxc-minify/binding-darwin-x64) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-freebsd-x64](https://registry.npmjs.org/@oxc-minify/binding-freebsd-x64) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-linux-arm-gnueabihf](https://registry.npmjs.org/@oxc-minify/binding-linux-arm-gnueabihf) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-linux-arm-musleabihf](https://registry.npmjs.org/@oxc-minify/binding-linux-arm-musleabihf) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-linux-arm64-gnu](https://registry.npmjs.org/@oxc-minify/binding-linux-arm64-gnu) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-linux-arm64-musl](https://registry.npmjs.org/@oxc-minify/binding-linux-arm64-musl) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-linux-ppc64-gnu](https://registry.npmjs.org/@oxc-minify/binding-linux-ppc64-gnu) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-linux-riscv64-gnu](https://registry.npmjs.org/@oxc-minify/binding-linux-riscv64-gnu) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-linux-riscv64-musl](https://registry.npmjs.org/@oxc-minify/binding-linux-riscv64-musl) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-linux-s390x-gnu](https://registry.npmjs.org/@oxc-minify/binding-linux-s390x-gnu) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-linux-x64-gnu](https://registry.npmjs.org/@oxc-minify/binding-linux-x64-gnu) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-linux-x64-musl](https://registry.npmjs.org/@oxc-minify/binding-linux-x64-musl) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-openharmony-arm64](https://registry.npmjs.org/@oxc-minify/binding-openharmony-arm64) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-win32-arm64-msvc](https://registry.npmjs.org/@oxc-minify/binding-win32-arm64-msvc) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-win32-ia32-msvc](https://registry.npmjs.org/@oxc-minify/binding-win32-ia32-msvc) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-minify/binding-win32-x64-msvc](https://registry.npmjs.org/@oxc-minify/binding-win32-x64-msvc) | 0.151.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-android-arm64](https://registry.npmjs.org/@oxc-parser/binding-android-arm64) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-darwin-arm64](https://registry.npmjs.org/@oxc-parser/binding-darwin-arm64) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-darwin-x64](https://registry.npmjs.org/@oxc-parser/binding-darwin-x64) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-freebsd-x64](https://registry.npmjs.org/@oxc-parser/binding-freebsd-x64) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-linux-arm-gnueabihf](https://registry.npmjs.org/@oxc-parser/binding-linux-arm-gnueabihf) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-linux-arm-musleabihf](https://registry.npmjs.org/@oxc-parser/binding-linux-arm-musleabihf) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-linux-arm64-gnu](https://registry.npmjs.org/@oxc-parser/binding-linux-arm64-gnu) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-linux-arm64-musl](https://registry.npmjs.org/@oxc-parser/binding-linux-arm64-musl) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-linux-riscv64-gnu](https://registry.npmjs.org/@oxc-parser/binding-linux-riscv64-gnu) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-linux-s390x-gnu](https://registry.npmjs.org/@oxc-parser/binding-linux-s390x-gnu) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-linux-x64-gnu](https://registry.npmjs.org/@oxc-parser/binding-linux-x64-gnu) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-linux-x64-musl](https://registry.npmjs.org/@oxc-parser/binding-linux-x64-musl) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-wasm32-wasi](https://registry.npmjs.org/@oxc-parser/binding-wasm32-wasi) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-win32-arm64-msvc](https://registry.npmjs.org/@oxc-parser/binding-win32-arm64-msvc) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-parser/binding-win32-x64-msvc](https://registry.npmjs.org/@oxc-parser/binding-win32-x64-msvc) | 0.76.0 | 0.157.0 | 更新あり |
| [@oxc-project/types](https://registry.npmjs.org/@oxc-project/types) | 0.155.0, 0.76.0 | 0.157.0 | 更新あり |
| [@pavelsavara/jsco](https://registry.npmjs.org/@pavelsavara/jsco) | 0.2.0-preview.2 | 0.2.0-preview.0 | latestより新しい版を使用 |
| [@playwright/test](https://registry.npmjs.org/@playwright/test) | 1.56.1 | 1.64.1 | 更新あり |
| [@rolldown/binding-android-arm-eabi](https://registry.npmjs.org/@rolldown/binding-android-arm-eabi) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-android-arm64](https://registry.npmjs.org/@rolldown/binding-android-arm64) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-darwin-arm64](https://registry.npmjs.org/@rolldown/binding-darwin-arm64) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-darwin-x64](https://registry.npmjs.org/@rolldown/binding-darwin-x64) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-freebsd-x64](https://registry.npmjs.org/@rolldown/binding-freebsd-x64) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-linux-arm-gnueabihf](https://registry.npmjs.org/@rolldown/binding-linux-arm-gnueabihf) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-linux-arm64-gnu](https://registry.npmjs.org/@rolldown/binding-linux-arm64-gnu) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-linux-arm64-musl](https://registry.npmjs.org/@rolldown/binding-linux-arm64-musl) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-linux-ppc64-gnu](https://registry.npmjs.org/@rolldown/binding-linux-ppc64-gnu) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-linux-s390x-gnu](https://registry.npmjs.org/@rolldown/binding-linux-s390x-gnu) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-linux-x64-gnu](https://registry.npmjs.org/@rolldown/binding-linux-x64-gnu) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-linux-x64-musl](https://registry.npmjs.org/@rolldown/binding-linux-x64-musl) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-openharmony-arm64](https://registry.npmjs.org/@rolldown/binding-openharmony-arm64) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-win32-arm64-msvc](https://registry.npmjs.org/@rolldown/binding-win32-arm64-msvc) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/binding-win32-x64-msvc](https://registry.npmjs.org/@rolldown/binding-win32-x64-msvc) | 1.2.15 | 1.2.16 | 更新あり |
| [@rolldown/pluginutils](https://registry.npmjs.org/@rolldown/pluginutils) | 1.0.1 | 1.0.1 | latestと一致 |
| [@rollup/rollup-android-arm-eabi](https://registry.npmjs.org/@rollup/rollup-android-arm-eabi) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-android-arm64](https://registry.npmjs.org/@rollup/rollup-android-arm64) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-darwin-arm64](https://registry.npmjs.org/@rollup/rollup-darwin-arm64) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-darwin-x64](https://registry.npmjs.org/@rollup/rollup-darwin-x64) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-freebsd-arm64](https://registry.npmjs.org/@rollup/rollup-freebsd-arm64) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-freebsd-x64](https://registry.npmjs.org/@rollup/rollup-freebsd-x64) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-arm-gnueabihf](https://registry.npmjs.org/@rollup/rollup-linux-arm-gnueabihf) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-arm-musleabihf](https://registry.npmjs.org/@rollup/rollup-linux-arm-musleabihf) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-arm64-gnu](https://registry.npmjs.org/@rollup/rollup-linux-arm64-gnu) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-arm64-musl](https://registry.npmjs.org/@rollup/rollup-linux-arm64-musl) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-loong64-gnu](https://registry.npmjs.org/@rollup/rollup-linux-loong64-gnu) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-loong64-musl](https://registry.npmjs.org/@rollup/rollup-linux-loong64-musl) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-ppc64-gnu](https://registry.npmjs.org/@rollup/rollup-linux-ppc64-gnu) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-ppc64-musl](https://registry.npmjs.org/@rollup/rollup-linux-ppc64-musl) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-riscv64-gnu](https://registry.npmjs.org/@rollup/rollup-linux-riscv64-gnu) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-riscv64-musl](https://registry.npmjs.org/@rollup/rollup-linux-riscv64-musl) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-s390x-gnu](https://registry.npmjs.org/@rollup/rollup-linux-s390x-gnu) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-x64-gnu](https://registry.npmjs.org/@rollup/rollup-linux-x64-gnu) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-linux-x64-musl](https://registry.npmjs.org/@rollup/rollup-linux-x64-musl) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-openbsd-x64](https://registry.npmjs.org/@rollup/rollup-openbsd-x64) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-openharmony-arm64](https://registry.npmjs.org/@rollup/rollup-openharmony-arm64) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-win32-arm64-msvc](https://registry.npmjs.org/@rollup/rollup-win32-arm64-msvc) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-win32-ia32-msvc](https://registry.npmjs.org/@rollup/rollup-win32-ia32-msvc) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-win32-x64-gnu](https://registry.npmjs.org/@rollup/rollup-win32-x64-gnu) | 4.65.0 | 4.67.4 | 更新あり |
| [@rollup/rollup-win32-x64-msvc](https://registry.npmjs.org/@rollup/rollup-win32-x64-msvc) | 4.65.0 | 4.67.4 | 更新あり |
| [@shikijs/engine-oniguruma](https://registry.npmjs.org/@shikijs/engine-oniguruma) | 3.23.0 | 4.6.0 | 更新あり |
| [@shikijs/langs](https://registry.npmjs.org/@shikijs/langs) | 3.23.0 | 4.6.0 | 更新あり |
| [@shikijs/themes](https://registry.npmjs.org/@shikijs/themes) | 3.23.0 | 4.6.0 | 更新あり |
| [@shikijs/types](https://registry.npmjs.org/@shikijs/types) | 3.23.0 | 4.6.0 | 更新あり |
| [@shikijs/vscode-textmate](https://registry.npmjs.org/@shikijs/vscode-textmate) | 10.1.0 | 10.1.0 | latestと一致 |
| [@tybys/wasm-util](https://registry.npmjs.org/@tybys/wasm-util) | 0.10.4 | 0.10.4 | latestと一致 |
| [@types/estree](https://registry.npmjs.org/@types/estree) | 1.0.9 | 1.0.10 | 更新あり |
| [@types/hast](https://registry.npmjs.org/@types/hast) | 3.0.5 | 3.0.5 | latestと一致 |
| [@types/unist](https://registry.npmjs.org/@types/unist) | 3.0.3 | 3.0.3 | latestと一致 |
| [@typescript/typescript-aix-ppc64](https://registry.npmjs.org/@typescript/typescript-aix-ppc64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-darwin-arm64](https://registry.npmjs.org/@typescript/typescript-darwin-arm64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-darwin-x64](https://registry.npmjs.org/@typescript/typescript-darwin-x64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-freebsd-arm64](https://registry.npmjs.org/@typescript/typescript-freebsd-arm64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-freebsd-x64](https://registry.npmjs.org/@typescript/typescript-freebsd-x64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-linux-arm](https://registry.npmjs.org/@typescript/typescript-linux-arm) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-linux-arm64](https://registry.npmjs.org/@typescript/typescript-linux-arm64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-linux-loong64](https://registry.npmjs.org/@typescript/typescript-linux-loong64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-linux-mips64el](https://registry.npmjs.org/@typescript/typescript-linux-mips64el) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-linux-ppc64](https://registry.npmjs.org/@typescript/typescript-linux-ppc64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-linux-riscv64](https://registry.npmjs.org/@typescript/typescript-linux-riscv64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-linux-s390x](https://registry.npmjs.org/@typescript/typescript-linux-s390x) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-linux-x64](https://registry.npmjs.org/@typescript/typescript-linux-x64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-netbsd-arm64](https://registry.npmjs.org/@typescript/typescript-netbsd-arm64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-netbsd-x64](https://registry.npmjs.org/@typescript/typescript-netbsd-x64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-openbsd-arm64](https://registry.npmjs.org/@typescript/typescript-openbsd-arm64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-openbsd-x64](https://registry.npmjs.org/@typescript/typescript-openbsd-x64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-sunos-x64](https://registry.npmjs.org/@typescript/typescript-sunos-x64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-win32-arm64](https://registry.npmjs.org/@typescript/typescript-win32-arm64) | 7.0.2 | 7.0.2 | latestと一致 |
| [@typescript/typescript-win32-x64](https://registry.npmjs.org/@typescript/typescript-win32-x64) | 7.0.2 | 7.0.2 | latestと一致 |
| [abort-controller](https://registry.npmjs.org/abort-controller) | 3.0.0 | 3.0.0 | latestと一致 |
| [acorn](https://registry.npmjs.org/acorn) | 8.17.0, 8.19.0 | 8.19.0 | 更新あり |
| [acorn-walk](https://registry.npmjs.org/acorn-walk) | 8.3.5 | 8.3.5 | latestと一致 |
| [argparse](https://registry.npmjs.org/argparse) | 2.0.1 | 3.0.4 | 更新あり |
| [balanced-match](https://registry.npmjs.org/balanced-match) | 4.0.4 | 5.0.0 | 更新あり |
| [base64-js](https://registry.npmjs.org/base64-js) | 1.5.1 | 1.5.1 | latestと一致 |
| [binaryen](https://registry.npmjs.org/binaryen) | 132.0.0 | 132.0.0 | latestと一致 |
| [brace-expansion](https://registry.npmjs.org/brace-expansion) | 5.0.12 | 5.0.12 | latestと一致 |
| [buffer](https://registry.npmjs.org/buffer) | 6.0.3 | 6.0.3 | latestと一致 |
| [chownr](https://registry.npmjs.org/chownr) | 3.0.0 | 3.0.0 | latestと一致 |
| [commander](https://registry.npmjs.org/commander) | 14.0.3 | 15.0.0 | 更新あり |
| [componentize-qjs](https://registry.npmjs.org/componentize-qjs) | 0.4.5 | 0.5.0 | 更新あり |
| [entities](https://registry.npmjs.org/entities) | 4.5.0 | 9.0.0 | 更新あり |
| [es-module-lexer](https://registry.npmjs.org/es-module-lexer) | 1.7.0 | 3.0.4 | 更新あり |
| [esbuild](https://registry.npmjs.org/esbuild) | 0.25.12 | 0.28.2 | 更新あり |
| [event-target-shim](https://registry.npmjs.org/event-target-shim) | 5.0.1 | 6.0.2 | 更新あり |
| [events](https://registry.npmjs.org/events) | 3.3.0 | 3.3.0 | latestと一致 |
| [fdir](https://registry.npmjs.org/fdir) | 6.5.0 | 6.5.0 | latestと一致 |
| [fflate](https://registry.npmjs.org/fflate) | 0.8.3 | 0.8.3 | latestと一致 |
| [fsevents](https://registry.npmjs.org/fsevents) | 2.3.2, 2.3.3 | 2.3.3 | 更新あり |
| [ieee754](https://registry.npmjs.org/ieee754) | 1.2.1 | 1.2.1 | latestと一致 |
| [jsesc](https://registry.npmjs.org/jsesc) | 3.1.0 | 3.1.0 | latestと一致 |
| [linkify-it](https://registry.npmjs.org/linkify-it) | 5.0.2 | 6.1.0 | 更新あり |
| [lunr](https://registry.npmjs.org/lunr) | 2.3.9 | 2.3.9 | latestと一致 |
| [markdown-it](https://registry.npmjs.org/markdown-it) | 14.3.3 | 15.0.3 | 更新あり |
| [mdurl](https://registry.npmjs.org/mdurl) | 2.1.0 | 2.1.0 | latestと一致 |
| [minimatch](https://registry.npmjs.org/minimatch) | 10.2.6 | 11.0.4 | 更新あり |
| [minipass](https://registry.npmjs.org/minipass) | 7.1.3 | 7.1.3 | latestと一致 |
| [minizlib](https://registry.npmjs.org/minizlib) | 3.1.0 | 3.1.0 | latestと一致 |
| [mkdirp](https://registry.npmjs.org/mkdirp) | 3.0.1 | 3.0.1 | latestと一致 |
| [nanoid](https://registry.npmjs.org/nanoid) | 3.3.20 | 6.0.2 | 更新あり |
| [oxc-minify](https://registry.npmjs.org/oxc-minify) | 0.151.0 | 0.157.0 | 更新あり |
| [oxc-parser](https://registry.npmjs.org/oxc-parser) | 0.76.0 | 0.157.0 | 更新あり |
| [pathe](https://registry.npmjs.org/pathe) | 2.0.3 | 2.0.3 | latestと一致 |
| [picocolors](https://registry.npmjs.org/picocolors) | 1.1.1 | 1.1.1 | latestと一致 |
| [picomatch](https://registry.npmjs.org/picomatch) | 4.0.7 | 4.0.7 | latestと一致 |
| [playwright](https://registry.npmjs.org/playwright) | 1.56.1 | 1.64.1 | 更新あり |
| [playwright-core](https://registry.npmjs.org/playwright-core) | 1.56.1 | 1.64.1 | 更新あり |
| [postcss](https://registry.npmjs.org/postcss) | 8.5.31 | 8.5.32 | 更新あり |
| [prettier](https://registry.npmjs.org/prettier) | 3.6.2 | 3.9.10 | 更新あり |
| [process](https://registry.npmjs.org/process) | 0.11.10 | 0.11.10 | latestと一致 |
| [punycode](https://registry.npmjs.org/punycode) | 2.3.1 | 2.3.1 | latestと一致 |
| [punycode.js](https://registry.npmjs.org/punycode.js) | 2.3.1 | 2.3.1 | latestと一致 |
| [readable-stream](https://registry.npmjs.org/readable-stream) | 4.7.0 | 4.8.0 | 更新あり |
| [regenerate](https://registry.npmjs.org/regenerate) | 1.5.0 | 1.5.0 | latestと一致 |
| [regenerate-unicode-properties](https://registry.npmjs.org/regenerate-unicode-properties) | 10.3.0 | 10.3.0 | latestと一致 |
| [regexpu-core](https://registry.npmjs.org/regexpu-core) | 6.4.0 | 6.5.3 | 更新あり |
| [regjsgen](https://registry.npmjs.org/regjsgen) | 0.8.0 | 0.8.0 | latestと一致 |
| [regjsparser](https://registry.npmjs.org/regjsparser) | 0.13.4 | 0.14.1 | 更新あり |
| [rolldown](https://registry.npmjs.org/rolldown) | 1.2.15 | 1.2.16 | 更新あり |
| [rollup](https://registry.npmjs.org/rollup) | 4.65.0 | 4.67.4 | 更新あり |
| [safe-buffer](https://registry.npmjs.org/safe-buffer) | 5.2.1 | 5.2.1 | latestと一致 |
| [source-map-js](https://registry.npmjs.org/source-map-js) | 1.2.2 | 1.2.2 | latestと一致 |
| [string_decoder](https://registry.npmjs.org/string_decoder) | 1.3.0 | 1.3.0 | latestと一致 |
| [tar](https://registry.npmjs.org/tar) | 7.5.22 | 7.5.22 | latestと一致 |
| [tinyglobby](https://registry.npmjs.org/tinyglobby) | 0.2.17 | 0.2.17 | latestと一致 |
| [tr46](https://registry.npmjs.org/tr46) | 5.1.1 | 7.0.0 | 更新あり |
| [tslib](https://registry.npmjs.org/tslib) | 2.8.1 | 2.9.1 | 更新あり |
| [typedoc](https://registry.npmjs.org/typedoc) | 0.28.20 | 0.28.20 | latestと一致 |
| [typescript](https://registry.npmjs.org/typescript) | 5.9.3, 6.0.3, 7.0.2 | 7.0.2 | 更新あり |
| [uc.micro](https://registry.npmjs.org/uc.micro) | 2.1.0 | 3.0.0 | 更新あり |
| [unenv](https://registry.npmjs.org/unenv) | 2.0.0-rc.24 | 1.10.0 | latestより新しい版を使用 |
| [unicode-canonical-property-names-ecmascript](https://registry.npmjs.org/unicode-canonical-property-names-ecmascript) | 2.0.1 | 3.0.0 | 更新あり |
| [unicode-match-property-ecmascript](https://registry.npmjs.org/unicode-match-property-ecmascript) | 2.0.0 | 2.0.0 | latestと一致 |
| [unicode-match-property-value-ecmascript](https://registry.npmjs.org/unicode-match-property-value-ecmascript) | 2.2.1 | 2.2.1 | latestと一致 |
| [unicode-property-aliases-ecmascript](https://registry.npmjs.org/unicode-property-aliases-ecmascript) | 2.2.0 | 3.0.0 | 更新あり |
| [urlpattern-polyfill](https://registry.npmjs.org/urlpattern-polyfill) | 10.1.0 | 10.1.0 | latestと一致 |
| [vite](https://registry.npmjs.org/vite) | 7.1.12 | 8.3.5 | 更新あり |
| [web-streams-polyfill](https://registry.npmjs.org/web-streams-polyfill) | 4.2.0 | 4.5.0 | 更新あり |
| [webidl-conversions](https://registry.npmjs.org/webidl-conversions) | 7.0.0 | 8.0.1 | 更新あり |
| [whatwg-url](https://registry.npmjs.org/whatwg-url) | 14.2.0 | 17.3.0 | 更新あり |
| [yallist](https://registry.npmjs.org/yallist) | 5.0.0 | 5.0.0 | latestと一致 |
| [yaml](https://registry.npmjs.org/yaml) | 2.9.1 | 2.9.1 | latestと一致 |

## 更新時の注意・確認項目

- 間接依存は親パッケージの要求範囲で決まる。262種類を一律overrideせず、直接依存更新とlock再解決の後に残件を確認する。
- TypeScript 7、Vite 8、Actionsのメジャー更新は互換性確認が必要。TypeDoc 0.28.20のpeerDependenciesはTypeScript 5.0.x〜6.0.xのみ。TypeScript 7.0.2との同時利用は宣言上非対応であり、TypeDoc側の対応版待ち、TypeScript 6の分離利用、またはドキュメント生成方式の変更が必要。
- P2のWIT 0.2.0から0.2.8への更新と、P3の0.3.2は別系列。WITのpackage version、生成bindings、ホストのABI実装、fixturesを整合させる。
- SDK/bindgen/wasm-tools更新では取得URLとSHA256だけでなく、scripts・benchmarksの既定パスも更新する。
- ChromiumはPlaywright管理の版を使用し、Playwright更新時に再インストールする。WebAssembly、OPFS等のブラウザーAPIは独立したnpm更新対象ではない。
- bash/curl/tar/sha256sum/diff等のホストコマンド、SDKに同梱されるclang/LLVM/wasi-libc、GitHub Pagesサービスは独立バージョンの固定なし。ホスト/SDK/Action経由で管理されるため独立の更新判定は不可。
- docs内の過去ベンチマーク結果や旧エンジンのバージョンは履歴であり、現在の依存には含めない。
- 更新後の検証: npm ci、OS build/pack、WIT P2/P3生成と差分確認、npm run build、test、test:production、test:pages -- --with-docs（build:docs後）、test:benchmark、benchmark -- --trials 1。
