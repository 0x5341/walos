# ProcessContext 公開API・Resource/Process意味論（Issue #26）

> **状態: v0.2.0公開契約。実装・移行の詳細はprocess-context-migration.mdを参照。** 2026-10-26の設計インタビューを反映する。
> 現在の `main` の公開APIやWITを説明する文書ではない。型・ABI・Worker・Demoの実装は後続Issueで段階的に移行する。
>
> Parent: [#25](https://github.com/0x5341/walos/issues/25) / Contract: [#26](https://github.com/0x5341/walos/issues/26)

実装状況と検証手順は [process-context-implementation.md](process-context-implementation.md) を参照。
公開 TypeScript 型は `packages/os/src/types.ts`、型使用例は `tests/public-api.types.ts`。
以下の設計例の「未実装」は #26 確定時の記録であり、現在の実装との差分は実装状況文書で管理する。

## 1. 目的と原則

Walosを、同梱Shellの自動起動・文字列Terminalを前提としたAPIから、**Host ProcessおよびWASI Preview 1/2が共通のOS Servicesを利用するOS API**へ移行する。

- **Process ≠ Runtime ≠ Worker**。HostはWorkerを持たない論理Process。WASI Workerは実行方式の一つであり、PIDやResourceの概念とは独立する。
- **WASI標準ABIは維持**する。Walos独自のP1拡張および `walos:runtime` WITは破壊的に移行する。
- Host公開の**raw APIは、P1/P2 Runtime Adapterが利用する共通OS Services契約**を直接利用する。WIT自動生成型をTypeScriptの公開型としてそのまま固定しない。rawの意味論はWASI P2を基準とし、将来P3対応でraw APIの破壊的変更を許容する。
- 利便機能（Options Object、パス指定spawn、readFile/writeFile、AsyncIterable、writeAllなど）が必要なら**別の任意Wrapper**に置く。rawに暗黙の操作を混在させない。
- OPFS File/Directory Handle、`MessagePort`、内部 `Spec`、RPC形式は公開APIに漏らさない。
- **Process/Resourceの所有権**、READY・EXIT・wait、stdioのmove、EOF/バックプレッシャーを共通の意味論とする。
- **Capabilityモデルの仕様化・実装は今回の範囲外**。Workerや同一OriginのJSを、信頼できないコードの強固な隔離境界と主張しない。
- 将来のJS Processは同じProcessContext契約を再利用するが、JS Module実行器自体は[Phase 2 #34](https://github.com/0x5341/walos/issues/34)で扱う。

## 2. Walos生成、唯一のHost、終了

```ts
import { Walos } from '@walos/os';

// v0.2.0 API
await using os = await Walos.create({
  env: { PWD: '/', PATH: '/bin' },
  argv: [],
});

const host = os.getHostProcess();
console.log(host.pid);   // Walos内で一意なPID
console.log(host.ppid);  // null
console.log(host.env.get('PWD')); // '/'
```

- `Walos.create(options)` は**非同期Factory**。Core初期化と唯一のHost Process登録が完了してから返る。部分的に生成されたオブジェクトは返さない。
- `boot()`、`attach()`、明示的な二つ目のHost作成APIは**存在しない**。`getHostProcess()` は同期呼出しで、何度呼んでも**同じ**ProcessContextを返す。
- HostはWorkerなしの論理Processで `pid`、`ppid=null` を持つ。Host単独のdisposeはない。寿命はWalosに属する。
- `os.processes` は読み取り専用スナップショット。Hostを含む。作成直後は**Host 1件／WASI Process Worker 0件**であり、自動起動のShell・コマンド・TTYはない。
- `Walos.create()` 自体にJSPIを要求しない。WASM起動時に必要な機能を確認する。
- 作成時に `/bin`、`/home`、`/tmp` などのユーザー領域をインストール・削除・初期化しない。同梱Command/SDK、`binUrl` に依存しない。必要な内部管理領域は別として、既存OPFSのユーザーファイルを保持する。
- 作成失敗時はWorker・Port等の部分的な管理Resourceをロールバックしてrejectする。
- `await os.dispose()` と `await os[Symbol.asyncDispose]()` は同じ**冪等な非同期終了**。管理対象のProcessを停止し、Resourceを回収する。終了後は `getHostProcess()` と取得済みHostからの操作を拒否する。
- 同一ページ内での複数 `Walos.create()` を明示的に拒否するガードは設けない。ただし**同一Originの複数インスタンス間の整合性・隔離・同時利用は保証しない**。
- Walosの管理Eventは `state`、`processes`、`exit`、`error` 等。Shell固有の `output`、`foreground` や文字列Terminal入力APIは削除する。

## 3. ProcessContext と環境設定

構成要素は `pid`、`ppid`、`process`、`fs`、`io`、`env`、`args`、`clock`、`random`。**`ctx.cwd`、`ctx.chdir()`、`ctx.terminal` はない**。

`ctx.env` は `get(key)`、`entries()` 等の**読み取り専用**インターフェースであり、`set` / `delete` は提供しない。`ctx.args` も読み取り専用。Process生成時にenv/argvをコピーし、Consumerが元のオブジェクトを書き換えてもProcessのスナップショットには反映しない。

### 3.1 PWDが作業ディレクトリの設定元

- 初期作業ディレクトリの公開設定は**環境変数 `PWD` に統一**する。公開APIに独立のcwdフィールド/引数を置かない。
- **唯一のHostの生成時だけ**、PWDが省略されていれば `PWD=/` を与える。`Walos.create({ cwd: ... })` のような別の初期cwd設定はない。
- **子のspawnではPWDを自動継承、補完、上書き、存在検査しない**。環境変数リストは呼び出し側が完全に渡す。他の環境変数にもPWD特別扱いによる継承を適用しない。
- **重要: 子のPWD欠落・不正は、spawn時やProcess初期化前に一律エラーにしない。** PWDが必要なWasm内部コードが実際に実行され、PWDや初期cwdを利用しようとした**その時点**で、通常のWasm側のエラー経路で観測させる。PWDを使わないコードはPWDがなくても実行可能である。Host/Coreが事前検査してspawnを拒絶しない。
- WASI SDK/libcのコンストラクタが初期cwdを参照する場合は、そのコンストラクタも**Wasm内部の利用コード**に含まれる。失敗時期を恣意的に「main開始後」と断定しない。具体的なAdapter実装・標準WASIインポートへの接続は[#37](https://github.com/0x5341/walos/issues/37)で検証する。
- P1初期cwd互換ブリッジ、P2標準 `wasi:cli/environment.initial-cwd`、preopenは必要な呼出し時に整合させる。標準WASIのDirectory Descriptor相対操作をPWD基準へ置換しない。

```ts
// raw spawnにはPWDを自動補完する機構はない。
const env = [
  { key: 'PWD', value: '/home' },
  { key: 'PATH', value: '/bin' },
];
// envからPWDを省略してもspawn時点では自動拒否されない。
```

### 3.2 Wasm内のlibcのcwdとは独立

WalosのProcessContext自体に変更可能なcwd/envはないが、**C/WASIアプリ内のwasi-libc `chdir()`、`getcwd()`、`setenv()` は利用可能**。そのlibc内部の状態はProcessContextの読み取り専用起動スナップショットを書き換えない。

C製Shellは `cd` に伴って `chdir()` し、必要に応じて `getcwd()` から `setenv("PWD", ...)` へ反映してよい。Shell自身が子をspawnする場合は**子に渡すenvを明示的に組み立てる**。WalosがlibcのcwdとPWDを自動同期することはない。

## 4. Raw Process API

以下は**設計上の型スケッチ**。まだ実装済みのTypeScript宣言ではない。詳細なDescriptor取得メソッドやError具象クラス名は型定義時に確定する。

```ts
interface EnvironmentEntry {
  readonly key: string;
  readonly value: string;
}

interface ProcessService {
  spawn(
    executable: FileDescriptor,          // borrow。moveしない
    argv: readonly string[],             // 完全配列。argv[0]を自動挿入しない
    env: readonly EnvironmentEntry[],    // 子の全環境。PWDを自動補完しない
    stdin?: InputStream,                  // 指定時move
    stdout?: OutputStream,               // 指定時move
    stderr?: OutputStream,               // 指定時move
  ): Promise<ChildProcess>;
}

type Exit =
  | { kind: 'exited'; code: number }
  | { kind: 'trap'; message: string }
  | { kind: 'terminated'; message: string };

interface ChildProcess extends AsyncDisposable {
  pid(): number;
  wait(): Promise<Exit>;                 // one-shot
  requestStop(): Promise<void>;
}
```

- raw spawnは**位置引数**で、実行対象は**借用FileDescriptor**。文字列パス、Options Object、`child.stdout` 等の利便性はWrapperへ。
- `argv` はアプリ名を含む**完全配列**を呼出し側が提供。`argv[0]` の自動補完・存在要求は行わず、空配列も有効。
- 環境変数はEntry配列として渡し、Process側はコピーした値を利用する。重複keyは既存の `Object.fromEntries` と同じく後のエントリが優先する。
- raw / Wrapperの**どちらにもspawnキャンセル用 `AbortSignal` を追加しない**。既存の内部キャンセル、タイムアウト、STARTING中の競合処理は維持する。
- spawnが成功して `ChildProcess` を返すのは**子のREADY確認後**。起動失敗時の部分的なWorkerとEndpointは解放する。
- `requestStop()` は標準WASIではなく**Walos独自拡張**。協調停止要求と必要な強制終了があり得る。`ChildProcess` のdrop/asyncDisposeは停止要求とは別。
- Trap/terminatedもwaitの終了結果として扱う。操作自体の不正Resource・通信失敗・一度消費したwait等は型付き操作エラーとして区別する。

## 5. Resourceの所有権・終了結果

| Resource / 操作 | 所有権・寿命 |
| --- | --- |
| FileDescriptorをspawnへ渡す | **borrow**。親側のDescriptorは消費しない。 |
| 明示的なstdin/stdout/stderrをspawnへ渡す | spawnの**呼出時**にmove。READY前でも呼出側は使用不能。後からspawn失敗しても返却しない。 |
| FileDescriptorから取得したStream | 元Descriptorとは**独立した寿命**。Descriptor解放後も取得済みStreamは存続可能。 |
| Processの標準stdio getterで得たResource | Processが保持する実接続と寿命を分離。一つのgetter Resource解放で他の利用者の接続を閉じない。 |
| `ChildProcess.wait()` | **呼出時点**でwait権を消費。最初のPromiseが未解決でも2回目は `already-consumed`。 |
| waitで終了結果を取得した後 | Core側はexit結果を回収できる。**ローカルのChildProcess Resourceは別途破棄**。 |
| `ChildProcess.requestStop()` | 子プロセスへの停止要求。ハンドル解放とは別。 |
| `ChildProcess[Symbol.asyncDispose]()` | ハンドルを解放。**子プロセス終了を待たず、停止もしない**。 |
| `Walos[Symbol.asyncDispose]()` | OS管理のProcess/Resourceを終了・解放し、後続Host操作を拒否する。 |

公開Resourceの破棄は `Symbol.asyncDispose` に**統一**する。`close()` や `Symbol.dispose` は公開しない。asyncDisposeは冪等で、管理対象の解放処理の確認後に解決する。解放RPCが失敗した場合はrejectしても、JS側のResourceを復活させない。WASI P2内部Resourceの同期dropはAdapter内部で扱う。

wait結果の保持: 子がwaitより先にEXITしても、有効なwait権を持つハンドルが残っている間はCoreが終了結果を保持する。現状のrootプロセス即reap問題を修正する。子Resourceをdropしても子は原則存続する。親の通常終了でREADY済みの子を強制終了しない。READY/EXIT競合・Worker異常終了時にも二重解放しない。

OS終了時の進行中waitには正常なSupervisor終了で可能な限り `terminated` を届け、通知不能なCore消失等は操作エラーとして扱う。

## 6. Filesystem

- rawは**WASI P2のDescriptor相対モデル**を意味論の基準にする。root/preopenと初期作業ディレクトリに対応するDirectory Descriptorを提供する。
- `openAt(dir, "relative/path", ...)` 等は**指定されたDirectory Descriptorが基準**。PWDではない。WASI標準の相対パス制約、`..`、root escape、file/dir区別、OPFSロック・Quotaエラーを維持する。
- PWDが必要な初期Directory Descriptorの解決は**実際に必要になった時点**で行う（§3参照）。WASM内でPWDを使う呼出しと無関係なCore先行検査を追加しない。
- rawがファイルシステムの絶対パス文字列を暗黙オープンしたり、読み書きの便宜で実行ファイルを勝手に探したりしない。Path指定spawn/パスreadFile等はWrapper側。
- Process Worker内のOPFS File I/Oは従来どおりWorkerローカルで実施。Hostも原則ローカルOPFS APIを使用し、**データのためだけにCoreへRPC転送しない**。

## 7. stdin/stdout/stderr、Pipe、Terminal

- Hostの既定stdioは `stdin=Null(EOF)`、`stdout/stderr=Null(discard)`。Walos生成時にTTYやShellは存在しない。
- raw spawnでstdioを省略した場合は、親の**TTY/Nullのみ**暗黙継承する。Pipe/File等の任意のEndpointを勝手に複製しない。明示Streamは呼出時に所有権移譲。
- raw `io.createPipe()` は**InputStream / OutputStream**を返す。raw ChildProcess自体にはstdin/stdout/stderr getterを設けない。呼出側がPipeを生成してspawnに接続する。
- rawのStreamにはP2型の `read`、`blockingRead`、`subscribe`、`checkWrite`、`write` 等の意味論を維持する。Bytesは `Uint8Array`。Pollableと背圧を尊重し、高水準 `AsyncIterable` / writeAllはWrapperへ。
- Pipeは**1 Reader / 1 Writer**。有界キュー（現行64KiB）、チャンク転送（現行16KiB）、累積ACK、バックプレッシャー、正常Writer解放→既存バッファを読み切ってEOF、Reader先行解放→WriterへBroken Pipe、Worker消失時の待機解放を維持する。
- **Byte DATAは直接MessagePortでEndpoint間を移動**。CoreはPID/所有権などの制御だけを担当し、全バイトを中継しない。
- Walos固有の `ctx.terminal` / TerminalSession / P2 `walos:runtime/terminal`、P1 `foreground` 拡張、暗黙foreground Controller、`os.interrupt()` を削除する。**標準WASI**の `wasi:cli/terminal-stdin` 等は維持し、Pipe/NullをTTYと誤認させない。
- UIは必要に応じてShellのstdinへBytesを流し、stdout/stderrをdecodeして表示する。echo、prompt順序、入力先・停止対象の選択はConsumer/Shellの責務。
- 旧Shellがforeground子プロセスへ自動的に対話入力を転送する機能は、今回のPhase 1で互換性保証しない（明示的な制限として記録）。

## 8. Clock、Random、エラー

| Service | raw契約 |
| --- | --- |
| Wall clock | `{ seconds: bigint, nanoseconds: number }`。既存P2相当の精度・resolutionを尊重。 |
| Monotonic clock | ナノ秒単位 `bigint`。実ブラウザ精度以上を保証しない。 |
| Timer / Pollable | P2のsubscribe-instant/duration等に対応。ローカル待機を原則としCore RPCを増やさない。 |
| Secure random | `crypto.getRandomValues()` 等のWeb Crypto。バイト列/u64取得と割当制限を扱う。 |
| Insecure random / seed | secureとAPIを区別する。Web Cryptoは必須とせず、非暗号学的PRNG可。暗号用途には使用しない。 |

共通Serviceの操作エラーは安定した `code`、`message`、任意 `cause` を持つ型付き例外／rejectとする。P1 Adapterでerrno、P2 AdapterでWIT result/variant等へ変換する。DOMExceptionや内部RPC失敗型は公開契約に固定しない。Wasmのtrap/終了は `Exit` に含め、API操作失敗と混同しない。

## 9. バージョニングと移行

- `@walos/os` は**v0.2.0で破壊的な公開API移行**を行う。型はルート `@walos/os` から参照可能にする。
- Walos独自のP2 WIT packageは `walos:runtime@0.1.0` → **`@0.2.0`**。P2 `terminal` interfaceの削除、`process.spawn` のcwd Descriptor引数削除。P1 `webos_v1.foreground` とP1拡張spawnのcwd FD引数も削除。既存拡張をimportするWASMは移行/再ビルドが必要。
- **標準WASI P1/P2インターフェースは変更しない。** Walos独自の `request-stop` / `create-pipe` / `wait` は維持する。
- `new Walos()/boot()/attach()/binUrl/writeInput()/interrupt()/foreground/output`、`ctx.cwd/chdir/terminal`、公開Resourceの `close()/Symbol.dispose` への依存は新契約へ移行する。
- 実装Issueは[#27](https://github.com/0x5341/walos/issues/27)（生成・Host）、[#28](https://github.com/0x5341/walos/issues/28)（Process寿命）、[#29](https://github.com/0x5341/walos/issues/29)（FS）、[#30](https://github.com/0x5341/walos/issues/30)（Byte IO）、[#31](https://github.com/0x5341/walos/issues/31)（Env/Clock/Random）、[#36](https://github.com/0x5341/walos/issues/36)（WIT ABI）、[#37](https://github.com/0x5341/walos/issues/37)（PWD遅延評価）、[#38](https://github.com/0x5341/walos/issues/38)（共通Service/性能）、[#33](https://github.com/0x5341/walos/issues/33)（Demo/Docs/CI）。
- 関連する[#35](https://github.com/0x5341/walos/issues/35)はP2のjsco単一化・古いEngine切替とComponent変換Cacheの撤去計画。**OS Services契約の共有とRuntime切替抽象化は別物**で、Phase 1に新たな汎用ExecutionRuntimeを作らない。
- 現状のREADME/implementationは旧実装の説明なので、この文書と異なる箇所は後続移行PRで更新する。

## 10. 性能と検証・受け入れ基準

共通化によって既存の**WorkerローカルOPFS I/O・直接Pipe DATA**をCore経由にしない。不要なBufferコピーやread/write単位の追加RPCを避ける。

既存ベンチマークと同条件でWASI P1/P2起動、OPFS/Pipeスループット/レイテンシを計測し、コミット・ブラウザ・測定環境・サンプル・ばらつき・差分を記録する。**性能回帰自体はIssue完了の必須ブロッカーにしない**。観測した悪化は将来の最適化へ追跡する（#38）。

**後続の実装PRで検証すること**:

- [ ] `Walos.create` はJSPI不要・同梱資産不要で成立し、Hostだけを登録する。OPFSユーザーデータを変更しない。
- [ ] HostのPID/PPID・readonly Env/Args・PWDデフォルト、dispose後の操作拒否。
- [ ] **PWDなしの子Wasmが、PWDを使用しない限り実行可能**。PWDを使用するWasm内コードで初めてエラーになる（spawn/事前初期化では拒否しない）。P1/P2初期cwd・preopen/Descriptor相対操作も検証。
- [ ] Host→P1/P2、P1↔P2のDescriptor起点spawn、明示stdio/Pipe、Env/argv、READY後ハンドル返却。
- [ ] stdout/stderrのByte分離、1MiB以上のPipe、EOF/Broken Pipe/backpressure/Port移譲、異常Workerの待機解放。
- [ ] 早期EXITとwaitの競合、one-shot wait、rootの終了結果保持、dropとrequestStopの分離、wait後asyncDispose。
- [ ] WASI標準ABIの回帰なし。Walos WIT v0.2.0・P1独自拡張の破壊的移行が正しく適用され、旧Terminal/foreground APIが残らない。
- [ ] TypeScriptの公開型だけをimportする使用例のtypecheck、README/Docs/デモ/CIの新API移行。
- [ ] 性能測定の結果と測定条件・差分の記録（性能値を合否ゲートにしない）。

> **スコープ**: この設計文書はIssue #26の契約面を固定する。ファイル追加だけでは実API・WIT・プロセス基盤はまだ変更されず、上記の実装確認項目は未完了のままである。
