# Runtime Concept

> **ステータス: 設計案（実装前）**  
> 対象: `0x5341/walos` / `@walos/os`  
> 関連: [`process-context-api.md`](https://github.com/0x5341/walos/blob/main/docs/process-context-api.md)、[`process-context-implementation.md`](https://github.com/0x5341/walos/blob/main/docs/process-context-implementation.md)、[`process-context-migration.md`](https://github.com/0x5341/walos/blob/main/docs/process-context-migration.md)
>
> 本文の TypeScript は**概念上の契約**であり、現在の実装済み API を示すものではない。本書は Runtime の再設計と段階的移行を対象とし、WASI P3 の機能完成を意味しない。

## 1. 目的

Walos の実行系を **`ProcessContext` 中心**に再構成する。Host Process、WASI Preview 1（P1）、Preview 2（P2）、Preview 3（P3）が、インターフェースだけでなく**同一の `ProcessContext` 実装および OS Service 実装**を利用できる構造にする。

Runtime は実行形式と ABI の **Adapter** に徹し、ファイル、I/O、プロセス、時刻、乱数などの OS 処理を保持・再実装しない。実際の OS 操作はすべて `ProcessContext` のサービスへ委譲する。

設計の責務分離は次のとおり。

- **Process**: PID、親子関係、起動状態、所有権、終了結果を持つ論理単位。`Worker` や `Runtime` と同一ではない。
- **ProcessManager / Core**: Process の生成・登録、READY/EXIT、`wait`、停止、所有権と Resource の管理。
- **Process Worker**: 実行ファイルを取得・識別し、`ProcessContext` を構築して対応する Runtime を起動し、結果を Core に通知する実行環境。
- **Runtime**: Wasm のロード・実行、WASI と Walos 独自 ABI の表現変換、実行形式固有リソースの管理。
- **ProcessContext**: Process 固有の OS Services への唯一の入口。Host と Process Worker で同じ実装を使う。
- **Host Process**: 当面は Main Thread で `ProcessContext` を直接利用する特別な Process。Runtime を使用しない。

**基本原則: Process ≠ Runtime ≠ Worker。**

## 2. 設計原則

1. **ProcessContext を中心にする。** OS の意味論を WASI のバージョンやバインディング生成器に依存させない。
2. **実装も統一する。** `HostProcessContext` と `WasiProcessContext` のように、実行場所・Runtime 別の Context 実装を作らない。各 Process に同じ `ProcessContext` 実装から別々のインスタンスを生成する。
3. **Runtime インターフェースは一つだけ。** `RuntimeFactory` / `RuntimeInstance` を導入しない。選択処理は Process Worker の責務とする。
4. **Runtime は Adapter。** P1 の errno、P2 の Resource/variant、P3 の非同期 ABI などを OS Services の共通操作・`ServiceError` に変換する。OS の実体を Runtime 内に複製しない。
5. **Host は Runtime を通さない。** Host が直接 Context を利用しても、Worker 側と同じ OS Services の規則・所有権を適用する。
6. **Core は制御、データは可能な限り直接。** Pipe のバイト列や Worker ローカルの OPFS I/O を不必要に Core RPC へ集約しない。
7. **既存の公開 API と意味論を保つ。** `ProcessContext`、`Walos.create()`、stdio の move、`wait()` の one-shot、`AsyncDisposable`、PWD の遅延参照を維持する。必要な公開 API 変更は別途合意する。
8. **実行環境の差を最下層に閉じ込める。** Main Thread と Worker の API 可用性差は小さな Platform Backend に隠す。Context・Service の処理ロジックを二重化しない。
9. **段階的に移行する。** P1/P2 と Host の互換性を確認した後で P3 を統合する。既存の P3 実験実装は、本設計への適合を検証するまで完成扱いしない。

## 3. アーキテクチャ

```text
Browser / Walos
│
├── Host Process（現状: Main Thread、Runtime なし）
│   └── ProcessContextImpl ───────────────┐
│                                        │
├── ProcessManager / Core                │
│   ├── PID / Process lifecycle          │
│   ├── Resource ownership               │
│   ├── READY / EXIT / wait / stop        │
│   └── Process Worker の管理             │
│          │                             │
│          ▼                             │
│      Process Worker                    │
│        1. executable を読み込む          │
│        2. executable を判別する          │
│        3. ProcessContextImpl を生成 ────┤
│        4. Runtime を選択・初期化          │
│        5. READY を通知                  │
│        6. Runtime.run()                 │
│        7. EXIT を通知・後始末            │
│          │                             │
│          ├── WASI P1 Runtime           │
│          ├── WASI P2 Runtime           │
│          └── WASI P3 Runtime           │
│                │                       │
│                └── ABI Adapter ────────┤
│                                        ▼
│                              共通 ProcessContext 実装
│                              ├── process / spawn / wait
│                              ├── fs / descriptor
│                              ├── io / stream / pollable
│                              ├── env / args
│                              ├── clock / random
│                              └── Resource / error semantics
│                                        │
│                              共通 Service 実装
│                                        │
│                              Platform Backend / Core channel
│                              ├── OPFS / browser primitives
│                              └── MessagePort / RPC
```

図中の `ProcessContextImpl` は**単一のクラス／実装**を意味する。Host と Worker が同じ JS オブジェクトを共有するという意味ではない。Process ごとのコンテキストはそれぞれの Thread/Worker 内に存在する。

### 3.1 同一実装と環境依存 Backend の境界

`ProcessContextImpl` と `FilesystemService` / `IoService` / `ProcessService` などのロジックは Host/Worker 共通とする。Worker 専用の `FileSystemSyncAccessHandle` と Main Thread の非同期 OPFS API、Core への RPC 接続など、実行環境に依存する**最小限のブラウザプリミティブ**だけを Backend で切り替える。

これは「Host 用と Worker 用の ProcessContext を別実装する」ことではない。Backend は低レベルのファイル操作・制御チャネルの接続だけを実現し、ファイルの公開意味論、権限・所有権、エラー変換、リソース寿命、stdio 規則などを独自に再実装してはならない。

性能や API 制約により Backend の差が必要な場合は、差分・等価性テスト・パフォーマンスへの影響を明示する。単一 Backend を全実行環境で採用できる場合はそちらを優先してよい。

## 4. ProcessContext

公開契約は原則として既存の `packages/os/src/types.ts` の `ProcessContext` を維持する。

```ts
interface ProcessContext {
  readonly pid: number;
  readonly ppid: number | null;

  readonly process: ProcessService;
  readonly fs: FilesystemService;
  readonly io: IoService;

  readonly env: Environment;
  readonly args: readonly string[];

  readonly clock: ClockService;
  readonly random: RandomService;
}
```

- **一つの Process に一つの論理 Context** を対応させる。Host と各 Worker で同一実装の異なるインスタンスを使う。
- Context の生成・破棄は **OS / Process の実行環境が管理**する。Runtime は Context を借用し、Context 自体を生成・破棄しない。
- `pid` / `ppid` / `argv` / `env` は Process の起動スナップショットであり、Runtime ごとの可変状態ではない。
- `PWD` は環境変数スナップショットから必要時に参照する。子 Process に暗黙継承・自動補完・spawn 時検証を追加しない。Context に `cwd` / `chdir()` を導入しない。
- `FileDescriptor`、`InputStream`、`OutputStream`、`Pollable`、`ChildProcess` の所有権・破棄・エラー意味論を Runtime ごとに変えない。
- OS Service の標準エラーは `ServiceError` とし、WASI 固有の errno / error variant への変換は Runtime が担当する。
- 内部の `Spec`、OPFS Handle、`StreamRef`、RPC、MessagePort の情報を公開 Context API に漏らさない。
- Context の共通化は、Worker 間で共有できるインスタンスや強固なセキュリティ境界を意味しない。

Context の生成は、Process の ID、親子関係、stdio、preopen、環境・引数、Core 接続、Platform Backend を含む**内部起動情報**を使用する。これらは生成側の都合であり、公開 `ProcessContext` API には露出しない。

## 5. 単一 Runtime インターフェース

設計上の最小契約を次のように置く。`RuntimeFactory` と `RuntimeInstance` は設けない。

```ts
interface Runtime extends AsyncDisposable {
  /** 実行ファイルと OS Context を結び付け、起動準備を完了する。 */
  initialize(
    executable: Uint8Array,
    context: ProcessContext,
  ): Promise<void>;

  /** コマンドを実行し、正常な Process 終了コードを返す。 */
  run(): Promise<number>;

  /** 協調的な停止を要求する。応答不能時の強制終了は Core が担う。 */
  requestStop(): void;
}
```

### 5.1 Runtime の責務

- 対応する Wasm 実行形式のロード、コンパイル・インスタンス化、エントリポイント実行。
- `ProcessContext` のメソッド・Resource を、対象 WASI 版の ABI と接続する。
- ABI ごとの同期／非同期制御、Resource Handle のマッピングと drop、エラー表現の変換。
- `_start`、`wasi:cli/run` など、サポート対象 World/エントリポイントの起動。
- ABI / Wasm インスタンス固有リソースの終了処理。

### 5.2 Runtime が担当しないもの

- PID 発行、Process 登録、Core 上の `wait()` / `drop()` 管理。
- ファイル、Pipe、Clock、Random、spawn の独立した実装。
- ProcessContext の所有・破棄。
- Context の stdio・環境変数・Resource 所有権規則の変更。
- 停止に応答しない Worker の強制終了。

`run()` が正常に数値を返した場合、Process Worker が `Exit = { kind: 'exited', code }` に変換する。Wasm Trap、ロード失敗、通信不能などは Worker/Core の既存規則に従って分類する。`terminated` を Runtime の通常終了コードと混同しない。Runtime が OS サービス操作中に遭遇した `ServiceError` は、可能な限り対象 ABI の標準エラーへ変換する。

`initialize()` が失敗した場合は READY を送らない。READY 送信後の失敗は EXIT として報告する。`run()` は原則として一度だけ実行する。`[Symbol.asyncDispose]()` は初期化途中・実行失敗後でも安全かつ冪等であることを目指す。

なお、この最小契約は **CLI コマンドを第一対象**とする。Reactor や HTTP Handler、複数エクスポートを継続的に呼び出す Component 等の実行モデルは将来の拡張事項であり、`run()` をそれらへ無理に当てはめない。

## 6. Process Worker による Runtime 選択と実行

Process Worker が実行ファイルを判別する。Runtime 自身に実行可能形式を問い合わせる Registry / Factory は設けない。内部の `selectRuntime` は Worker 側の実装詳細であり、公開 interface ではない。

```ts
// 概念上の処理順。実際の Worker 制御メッセージ、例外処理、
// Core 側の強制終了・タイムアウトはここでは省略する。
const executable = await readExecutable(spec);
const format = inspectExecutable(executable);  // P1 / P2 / P3 / unsupported
const context = await createProcessContext(bootstrap);
const runtime: Runtime = selectRuntime(format);

try {
  await runtime.initialize(executable, context);
  notifyReady();

  const code = await runtime.run();
  notifyExit({ kind: 'exited', code });
} catch (error) {
  notifyFailureAccordingToLifecycle(error);
} finally {
  // Runtime が Context を借用しているため Runtime 側を先に解放する。
  await runtime[Symbol.asyncDispose]();
  await disposeProcessContext(context);
}
```

実際の実装では、**Context 生成・Runtime 選択以前の失敗も含む cleanup**、READY 前後で異なる通知、Stop と起動の競合、エラー時の一度だけの EXIT/boot-error 送信を保証する。コード例の `finally` だけでは不十分なため、実装時には Worker 全体を適切なスコープで囲む。

実行形式判定の方針:

| 対象 | 判定材料 | Runtime |
| --- | --- | --- |
| WASI P1 | Core Wasm Module 形式および必要な WASI import/export | P1 Adapter |
| WASI P2 | Component Model 形式と P2 の World / import / export | P2 Adapter |
| WASI P3 | Component Model 形式と P3 の World / import / export | P3 Adapter |
| 未対応・曖昧 | 不明な World、混在 import、サポート外バージョン等 | 起動エラーとして明示的に拒否 |

**P2 と P3 は Component のヘッダーだけでは識別できない。** 解析した import/export と必要な interface version に基づいて判断する。単なる `0x0d` の Component 識別子を「P2」の意味で使わない。実行対象が CLI World 以外の場合はサポート可否を明示する。

Runtime の選択は Process Worker に閉じ、Host の `ProcessContext` 利用には介在させない。

## 7. ABI Adapter と OS Services の境界

| OS 操作 | P1 Runtime | P2 Runtime | P3 Runtime | 実処理 |
| --- | --- | --- | --- | --- |
| argv / env | WASI P1 メモリ ABI | Component API | P3 Component API | `context.args` / `context.env` |
| stdin / stdout / stderr | fd API / JSPI 必要箇所 | P2 `wasi:io` Resource | P3 の native async stream | `context.io` |
| ファイル操作 | fd / errno 変換 | Descriptor / variant | P3 FS ABI への変換 | `context.fs` |
| spawn / wait | Walos P1 拡張 | Walos WIT | P3 向け拡張 ABI（要設計） | `context.process` |
| 時刻・乱数 | P1 ABI | P2 interfaces | P3 interfaces | `context.clock` / `context.random` |

`InputStream` / `OutputStream` / `Pollable` / `FileDescriptor` は OS の共通モデルとして保持する。P3 の `stream<T>` / `future<T>` などは **Runtime 側での ABI 変換**により接続し、P3 専用 `ProcessContext` を作らない。バックプレッシャー、EOF、Broken Pipe、キャンセル、Resource drop の意味論は、各版の ABI で正しく表現できることを E2E で検証する。

P1 の同期 import が非同期 Context 操作を呼ぶ場合の JSPI 接続、P2 の Component Resource 管理、P3 の native async/Canonical ABI は Runtime 内に閉じ込める。

## 8. Host Process と将来の JS Process

### 8.1 現在の Host Process

- `Walos.create()` は唯一の Host Process を登録し、`getHostProcess()` で同じ Context を返す。
- Host は **Main Thread 内の論理 Process** であり、専用の Process Worker / Runtime は持たない。
- Host が使用する Context は WASI Process と**同じ `ProcessContextImpl`・同じ Service 実装**で生成する。
- Host の `ppid` は `null`。Host も通常の Resource 所有権・終了規則に従い、Context の寿命は `Walos` が管理する。

### 8.2 将来の配置変更

将来、Host の OS 機能を内部の **JS Process** として Worker 側に移し、UI / Consumer のいる Host Thread とは **MessagePort** で通信する構成を目指す。

```text
現状:
  Main Thread:  UI / Consumer + Host Process(Context 直接利用)
  Core Worker:  ProcessManager
  Process Worker: Runtime -> ProcessContext

将来:
  Main Thread:       UI / Consumer -> MessagePort Client
  OS 内部 JS Process: 共有 ProcessContext 実装を直接利用
  Core Worker:       ProcessManager
  Process Worker:    Runtime -> 共有 ProcessContext 実装
```

将来の配置変更は Context の公開意味論や Runtime interface の変更を前提としない。MessagePort 上で公開する要求・応答プロトコル、Resource Handle の寿命、構造化クローンできないオブジェクトの代理表現、キャンセル・エラー伝播は**別途設計する**。

特別な Host Process と、任意の JS プログラムを実行する汎用 JS Runtime は別の論点である。前者に Runtime を強制しない。本書は後者の実装方式を決めない。

## 9. Lifecycle と Resource 所有権

1. Core が Process と起動時 Resource の所有権を確定し、Worker を起動する。
2. Worker が共通 Context を作り、Runtime が Context を**借用**して初期化する。
3. Runtime 初期化の成功後に READY を通知し、`run()` を開始する。
4. Runtime の完了・Trap・停止を Worker/Core の規則で観測する。`wait()` は Core 側の一度限りの権利として保持する。
5. Runtime 固有リソースを破棄した後、Process の Context と所有 Resource を解放する。部分初期化でも cleanup する。
6. Core は必要に応じて Worker を強制停止し、結果と Resource 状態を矛盾なく確定させる。

既存の契約を維持する重要事項:

- `spawn()` の実行 FileDescriptor は **borrow**。明示的な stdin/stdout/stderr は**呼出時に move**。
- `ChildProcess.wait()` は **one-shot**。`requestStop()` と `ChildProcess` handle の asyncDispose は独立。
- Pipe の MessagePort とデータ転送、EOF、バックプレッシャーを維持する。Core に Pipe バイト列を中継させない。
- Descriptor とそこから生成した Stream は独立した寿命を持つ。
- 起動失敗、READY/EXIT の競合、Stop と `run()` の競合、Context の破棄、Worker 消失を扱い、通知と回収を二重実行しない。
- `Walos.dispose()` は管理 Process / Resource の終了・回収を担う。個々の Resource drop で Process を停止しない。

## 10. 現状からの移行計画

`main` の既存コードでは、`Wasi` / `Wasi2` がサービスの一部を直接保持し、Host は `HostResources` を介して公開 Context を構成している。Process Worker は P1/P2 を分岐して起動する。これらを共通化するのが移行対象であり、**本書にある `Runtime` / `ProcessContextImpl` は現時点の実装済み API ではない**。

### Phase 1 — 共通 Context / Service の設計

- `ProcessContextImpl`、内部起動情報、Core 制御チャネル、必要最小限の Platform Backend の責務を定義する。
- Host と Worker の FS、stdio、Pipe、Resource Registry、spawn、Clock/Random、`ServiceError` の意味論を照合し、重複を洗い出す。
- 同一実装で Host と Worker を生成できることを検証する。公開 API の変更は原則避ける。

### Phase 2 — Host と既存 P1/P2 の移行

- Host の `HostResources` に分散した Context 構築・Service ロジックを共通実装へ統合する。
- P1/P2 が自身で OS Service を構築する構造をやめ、受け取った Context を ABI へ適合させる。
- 単一 `Runtime` interface と Process Worker 内の選択処理を導入する。
- 実ファイル・Pipe・spawn・Shell・Lifecycle の既存テストと性能記録で回帰を確認する。

### Phase 3 — WASI P3 Runtime の統合

- Component import/export と World version に基づく P3 の判定を追加する。
- native async stream / future と共通 Context IO/FS の接続、必要な Walos WIT 拡張を定義する。
- 実際の P3 コンポーネントを使った E2E で、stdio・FS・spawn・終了・Resource 解放を検証する。
- P1/P2/P3 の混在起動と相互 Pipe 接続を検証する。未サポート import は明示的に拒否する。

### Phase 4 — 内部 JS Process 化（将来）

- Host 側 Context 直接利用を MessagePort Client 経由へ移す。
- OS 内部の JS Process で同じ `ProcessContextImpl` を使用する。
- 公開 API の互換性と、Resource の移譲・解放・エラー伝播を検証する。

## 11. 受け入れ条件

- **単一実装:** Host / P1 / P2（P3 対応後は P3）で同じ `ProcessContextImpl` と Service ロジックを使用し、Runtime 別の OS Service 分岐を持たない。
- **単一 Runtime 契約:** `RuntimeFactory` / `RuntimeInstance` が存在せず、Process Worker が実行形式判別と Runtime の選択を管理する。
- **ABI とサービスの分離:** Runtime の依存先は共通 Context と実行形式用ライブラリに限り、OPFS/MessagePort/ProcessManager の詳細を直接操作しない（ABI 変換に必要な限定的例外は設計レビュー対象）。
- **互換性:** 公開 `ProcessContext` API、P1/P2 標準 ABI、Walos の既存 Process/Resource 所有権規則を維持する。
- **動作検証:** Host/P1/P2 で同じ操作に同じ結果・エラー・解放動作を確認する。P3 対応時は実コンポーネントの E2E を必須とする。
- **性能検証:** Pipe の直接転送、Worker ローカルの FS 処理を維持し、変更前後の起動・I/O ベンチマークを比較する。
- **Host 例外:** 現時点の Host は Runtime を使わずに Context を利用でき、将来の JS Process 化にも移行可能な境界がある。

## 12. 未確定事項と非目標

### 未確定事項（実装前に検証・設計する）

- `ProcessContextImpl` の内部コンストラクタ・Backend 抽象の最小構成。
- 初期化失敗と停止要求を同時に受けた際の Runtime/Context の厳密な破棄順序。
- P1/P2/P3 判定に必要な Component メタデータと、複数 World / 混在 version の扱い。
- P3 の async stream / future と共通 Pollable・Input/OutputStream 間のキャンセル、バックプレッシャー対応。
- CLI 以外の実行モデルを追加する際の Runtime interface の拡張方針。
- 将来の Host MessagePort Client の wire protocol と Resource proxy。

### 本設計の非目標

- この文書だけで WASI P3 の全インターフェース対応を宣言すること。
- `ProcessContext` を Worker 間で同一オブジェクトとして共有すること。
- Core へのファイル/Pipe データ経路集約や Runtime ごとの OS Service 実装。
- JavaScript Process、HTTP/Socket、スレッド、完全な Capability 隔離の即時実装。
- 既存の公開 API や標準 WASI ABI の無条件な破壊的変更。

---

**決定事項の要約:** OS Services とその実装は `ProcessContext` に統一し、Runtime は単一 interface の ABI Adapter とする。実行形式の判定と Runtime の起動は Process Worker が行う。Host は現状 Runtime を通さず同じ Context を利用し、将来は OS 内部 JS Process + MessagePort へ配置変更できるようにする。