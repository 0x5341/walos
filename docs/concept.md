# Web OS Concept

## 1. Vision

WASI (WebAssembly System Interface) を基盤として、ブラウザ上で動作する軽量な Web OS を構築する。

目標は Linux や x86 CPU をエミュレーションすることではない。**既存の Linux 向けソフトウェアを WASI 向けに再コンパイルし、可能な限り少ない改修で Web OS 上で動かせる**という開発・利用体験を目指す。

Wasm をネイティブな実行形式として利用し、Linux カーネル互換層や x86 命令エミュレーションのコストを避ける。ただし、WASI への再コンパイルだけであらゆる Linux ソフトウェアが動くわけではない。対応範囲を段階的に広げる。

## 2. Core Principles

1. **WASI first** — 標準化済みの機能は可能な限り WASI をそのまま提供し、不要な独自仕様への置き換えを避ける。
2. **Wasm-native OS** — Linux バイナリ互換性より、Wasm に適した実行・権限・リソースモデルを優先する。
3. **WASI applications all the way down** — Shell も一般のアプリケーションと同様に WASI 上で実行する。Shell だけに JS ホストの特権 API を直結させない。
4. **Small, explicit extensions** — WASI に足りない OS 機能をバージョン付きの Web OS ABI として追加する。初期段階からプロセス生成 (`spawn`) を含める。
5. **Portability and compatibility** — 既存の C/C++ などのソフトウェアを移植しやすくするため、WASI 対応ツールチェーンと必要に応じて POSIX 互換ライブラリを利用する。
6. **Capability-based isolation** — アプリごとに許可されたファイル、I/O、プロセス操作などの権限を管理し、ブラウザ権限を無条件に共有しない。
7. **Extensibility without premature implementation** — Native Wasm、JavaScript Runtime、Wasm Runtime、Thread は将来の拡張として想定するが、PoC では実装しない。追加のための設計上の余地だけを確保する。
8. **Measure, don't assume** — エミュレーション方式より軽量であることは目標であり、起動時間・メモリ・CPU 使用量を実測して評価する。

## 3. Target Experience

```text
既存の Linux 向けソースコード
       │
       ▼
WASI 対応のコンパイラ・SDK
       │
       ▼
   WASI executable
       │
       ▼
    Web OS (browser)
```

ユーザーは Web OS 上の **WASI 製 Shell** からプログラムを起動し、標準入出力、ファイルシステム、パイプ、終了コードなどを利用できる。

```sh
cat README.md | grep TODO | sort
```

これは目標とする使用体験の例であり、個別コマンドの移植可否は使用する libc・WASI バージョン・追加 API に依存する。

## 4. Architecture

```text
┌─────────────────────────────────────────────┐
│           UI / Terminal / Desktop           │
└─────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────┐
│          WASI Applications                  │
│    Shell / CLI tools / Future GUI apps      │
│                                             │
│       WASI APIs + Web OS ABI imports        │
└─────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────┐
│                Runtime Adapters             │
│  WASI Preview 1 / Preview 2 / future P3     │
└─────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────┐
│                Web OS Core                  │
│ Process Manager / VFS / IPC / Resource      │
│ Manager / Capability Manager / Runtime      │
│ Registry                                    │
└─────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────┐
│               Browser Host                  │
│  JS / WebAssembly APIs / Workers / Storage  │
└─────────────────────────────────────────────┘
                       │
                  Browser
```

UI は入出力の表示やユーザー操作を受け持つが、**Shell 本体は WASI アプリ**として実行される。Shell からのプロセス起動は Web OS ABI の `spawn` 経由とし、OS Core の Process Manager が処理する。

### 4.1 OS Core と Runtime の分離

- **Process**: OS が管理する論理的な実行単位。PID、権限、リソース、終了状態を持つ。
- **Runtime**: 実行形式をロード・起動する仕組み。初期段階では WASI のみを実装する。
- **Execution Context**: Runtime が管理する実行コンテキスト。将来複数スレッドを扱えるよう、Process と Wasm Instance や Worker を概念上は同一視しない。
- **Host Adapter**: ブラウザの WebAssembly、Worker、ストレージなどにアクセスする実装層。

OS の共通機構を特定の実行形式に固定しない。将来 Native Wasm や JS Runtime を追加しても、プロセス管理、VFS、IPC、Capability 管理を再利用できることを目指す。

## 5. API / ABI Strategy

### 5.1 Standard WASI

標準の機能は、可能な限り既存の WASI インターフェースを利用する。

- CLI 引数、環境変数、標準入出力、終了コード
- ファイル・ディレクトリ操作
- 時刻・乱数
- 利用可能な範囲での HTTP・ネットワーク機能
- 非同期・ストリームなど、対応する WASI バージョンの標準機能

ブラウザ上での利用可否はホストの実装とブラウザの権限制約に依存する。特に任意の TCP/UDP ソケットは標準的な Web ページにそのまま公開されているわけではない。

### 5.2 Web OS ABI (from PoC)

WASI に存在しない OS 機能は、独立した名前空間・明示的なバージョンを持つ **Web OS ABI** で提供する。

初期対象:

| Interface (tentative) | Responsibilities |
| --- | --- |
| `webos:process` | `spawn`、プロセス ID、終了待機、終了状態、停止操作（権限の範囲内） |
| `webos:ipc` | Pipe、プロセス間のストリーム接続・通信 |
| `webos:system` | OS / ABI バージョン、サポート機能の照会（必要な範囲のみ） |

命名や関数シグネチャは設計時に確定する。標準 WASI と重複する API をむやみに増やさない。

**Shell の `spawn` は PoC から必須。** Shell も独立した WASI プロセスとして Web OS ABI を呼び出す。親プロセスが子プロセスに渡す引数、環境、作業ディレクトリ、stdin/stdout/stderr、Capability の継承・委譲規則を ABI で定める。

将来、`posix_spawn()` などの libc API を Web OS ABI に結び付ける互換レイヤーを用意できるようにする。既存ソフトウェアが Web OS 独自 ABI を自動的に使えるわけではない点を明確にする。

### 5.3 WASI Versions

WASI のバージョンと実行形式の差を Runtime Adapter で吸収する。Preview 1 の Core Wasm アプリと Preview 2 の Component は異なるロード経路が必要になり得る。

- PoC は移植対象ツールチェーンとの相性を優先し、**Preview 1 と Preview 2 を候補**とする。最小実装で両方同時の完全対応を必須とはしない。
- Preview 3 / WASI 0.3 の非同期モデルは後から追加する。
- OS Core を特定バージョンの WASI の型や ABI に直接固定しない。
- Web OS ABI の提供方法も、Core Wasm imports と Component Model/WIT bindings の違いを考慮して設計する。

## 6. Process Model and IPC

PoC から複数の WASI プロセスを管理する。

必要な基本機能:

- Shell を含む WASI アプリの起動・終了
- `spawn` での子プロセス生成
- PID、プロセス状態、終了コード、終了待機
- argv / env / cwd の設定
- stdin / stdout / stderr の接続とリダイレクト
- Pipe を利用したコマンド間ストリーミング
- アプリごとのリソース所有・終了時の解放
- 停止可能性と障害分離の確保

**Process ≠ Wasm Instance ≠ Web Worker** として設計する。PoC は各プロセスが単一の実行コンテキストを持てば十分だが、将来複数コンテキストを持てる概念構造を維持する。

ブラウザのメインスレッドを長時間ブロックしない。強制終了や無限ループへの対処を考慮し、PoC のアプリ実行には専用 Worker などの隔離手段を優先して検討する。Worker の共有・プーリングは性能測定後に評価する。

## 7. Filesystem

仮想ファイルシステム (VFS) を OS Core に実装し、WASI filesystem API を通じて公開する。

- 永続データの候補: OPFS / IndexedDB
- 仮想パス、作業ディレクトリ、ファイル・ディレクトリ操作
- プロセスごとのアクセス権限とリソーステーブル
- 複数プロセスからのアクセス時の整合性
- Pipe、stdin/stdout/stderr とファイル I/O の接続

ブラウザのストレージクォータやデータ削除の可能性を前提とする。Linux の `mmap()` や任意の仮想メモリ操作の完全再現は初期目標にしない。

## 8. Existing Linux Software Compatibility

互換性の対象は **Linux 向けソースコード**であり、Linux ELF/x86 バイナリそのものではない。

移植の優先度:

1. **A: WASI で直接動く CLI** — そのまま再コンパイルし実行する。
2. **B: 一部 POSIX API が不足する CLI** — libc の互換レイヤー、限定的な修正、Web OS ABI で動かす。
3. **C: Linux カーネル固有機能に強く依存するアプリ** — 初期段階では対象外、必要性に応じて個別に移植する。

`fork()`、`mmap()`、`ioctl()`、シグナル、`/proc`、PTY、`epoll()` 等の完全再現を PoC の必須要件にはしない。とくに `fork()` の忠実な実装より `spawn` ベースのモデルを優先する。

CLI ツールの移植例として `cat`、`grep`、`sort` などを検証候補とするが、実際の移植難度は依存ライブラリやビルド設定に左右される。

## 9. Security and Browser Constraints

- Capability に基づき、アプリごとの VFS・プロセス操作・IPC・ネットワークアクセス権を制御する。
- 子プロセスの権限は、原則として親が委譲できる権限の範囲を超えない。
- Web OS の全アプリに、ブラウザへ付与された権限を無条件に与えない。
- ブラウザでは任意の TCP/UDP 接続、CPU 使用率の厳格な制限、強制プリエンプションなどに制約がある。
- 高い隔離が必要なアプリは Worker 境界などを活用する。ただし Worker はブラウザ OS の独立プロセスと同等のセキュリティ境界ではない。

## 10. Roadmap

### Phase 1 — WASI-first PoC

- ブラウザで WASI executable をロード・実行
- **WASI 製 Shell** を起動
- `webos:process` の `spawn`、wait、exit status
- VFS と必要な WASI API
- IPC / Pipe / I/O リダイレクト
- 複数プロセス、リソース・Capability 管理
- 実際の Linux 由来 CLI プログラムの再コンパイル・実行
- ハングしたアプリの隔離・停止

### Phase 2 — Compatibility and WASI Maturity

- wasi-libc / POSIX 互換レイヤーの拡充
- 対応 WASI バージョンの拡張（WASI 0.3 を含む）
- より多くの CLI アプリ、ネットワーク、GUI の基盤
- 性能測定とボトルネックの解消

### Phase 3 — Additional Runtimes and Host APIs

- Native Wasm Runtime
- JavaScript Runtime
- Wasm Runtime を直接利用する API
- ブラウザ固有の追加 API（必要な Capability 制御を含む）

### Phase 4 — Threads

- Thread API と Worker / Shared Memory の連携
- Wasm atomics、同期プリミティブ、TLS 等
- ツールチェーン・ABI と互換ライブラリの対応
- Component Model の共有メモリ・スレッド関連仕様の成熟を考慮

Phase は実装順序の目安であり、将来のブラウザ・WASI 仕様に応じて調整する。

## 11. PoC Success Criteria

- WASI アプリとして実装された Shell が、Web OS ABI の `spawn` を使って他の WASI アプリを起動できる。
- 引数、環境変数、作業ディレクトリ、終了コードが正しく渡される。
- ファイルを読み書きでき、データを持続できる。
- 複数コマンドを Pipe で接続できる。
- 少なくとも複数の Linux 由来 CLI ツールを WASI 向けに再コンパイルして利用できる。
- 異常なアプリを停止し、他のアプリや Shell の動作を保てる。
- 権限を付与していないファイル・OS 機能にはアクセスできない。
- 起動時間、メモリ使用量、簡単な I/O・CPU ワークロードの指標を測定できる。

## 12. Non-goals (Initial PoC)

- Linux カーネルそのもののエミュレーション
- x86 バイナリ実行・ELF バイナリ互換
- すべての POSIX API の完全互換
- Thread / pthread 対応
- Native Wasm、JS Runtime、Wasm Runtime API の提供
- `fork()`、`mmap()` 等の Linux セマンティクス完全再現
- あらゆるブラウザ制約の回避

## 13. Open Design Decisions

今後具体化する事項:

- PoC の最初のターゲットを WASI Preview 1 / 2 のどちらに置くか、またどの順序で両対応するか
- Core Wasm imports と Component/WIT の両方で Web OS ABI をどう配布するか
- `spawn` への実行ファイル指定方法、ファイルディスクリプタ・Pipe・Capability の継承規則
- プロセス終了・キャンセル・強制停止の意味と実装上の保証
- Pipe のバッファリング、バックプレッシャー、デッドロック対策
- OPFS / IndexedDB の使い分けと永続性
- Browser Host と各 Worker 間の RPC / データ転送方式
- libc 互換性をどの範囲まで提供するか
- GUI と端末の入出力の境界
- 比較対象となる Linux+x86 エミュレーション方式とベンチマーク条件

---

**Summary:** WASI を基本 ABI として尊重し、不足するプロセス生成・IPC 等を Web OS ABI で初期から補完する。Shell 自体も WASI アプリであり、標準化された API と独自 ABI を通じて OS を利用する。まず既存 Linux ソースの WASI 向け再コンパイル・実行体験を成立させ、Native Wasm / JS / Wasm Runtime / Thread は後から拡張する。
