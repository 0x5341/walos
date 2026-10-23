# Web OS Concept — Grilled Implementation Baseline

> **状態：Grilling完了／実装開始承認済み**  
> **確定日：2026-10-22**  
> **文書の位置付け：Codexによる実装の基準仕様（Concept + Architecture + PoC Acceptance Criteria）**  
> **根拠：** `concept.md`、`webos_design_decisions.md`、`webos_concept_snapshot_round24.md`、Grilling Round 1〜27（Q1〜Q288）。  
> **優先順位：** 後続ラウンドの明示的な修正 > 前の設計判断 > 元のConcept。以下の「確定事項」を優先する。  
> **注意：** 技術的な実現可能性を未検証のまま保証する文書ではない。特にWIT Resourceの型、JSPI、ブラウザでのComponent変換、OPFSの振る舞いは実装時に検証する。

## 0. Codexに対する実装指示

本書をWeb OS PoCの**合意済み設計ベースライン**として使い、これ以上のGrilling（設計質問ラウンド）は行わず、**動作するVertical Sliceの実装**を開始すること。

- まず既存リポジトリ／ツールチェーンの状態を調べ、既存ファイルや実装があれば尊重する。原資料の`concept.md`を勝手に上書きしない。
- 可能な限りTypeScriptとブラウザ標準APIを使い、Chromium上で動くWASI-first Web OSを構築する。
- 合意済みのアーキテクチャ・公開ABIの意味・PoC範囲を変更しない。軽微な実装詳細（TS型、内部RPCフィールド、ACK閾値、テスト方法、バッファ値、エラー対応表、フォルダ構成）は合理的に決めてよい。
- 重要な制約が判明した場合、実験・証拠・影響・代替案を記録する。**アーキテクチャ変更や公開ABIの意味の変更が必要な場合に限り**、ユーザーに相談する。
- 各Vertical Sliceでブラウザ上の実動作と自動テストを示す。未実装項目を完了扱いしない。
- 公開WITの具体的な構文例はこの文書では概念的。**実際に用いるWIT/WASIのバージョンに対して有効な形式を検証し、型チェック・バインディング生成を通すこと**。既存の標準WASIとの整合性を優先し、都合のよい独自WASIへの改変で解決しない。
- 実装前の無限の設計ループを避ける。リスクが高い技術（JSPI、Worker通信、Component変換、OPFSハンドル、WIT Resource）を早い段階で小さく実験する。

### 0.1 決定と未検証事項の区別

- **仕様として確定：** この文書で「する」「しない」「PoC対象」と記載した振る舞い。
- **実装裁量：** タイムアウト値、バッファサイズ、各種識別子の内部エンコード、ACK閾値、具体的なライブラリ選定、開発・ビルド環境。
- **技術検証が必要：** WIT Resourceを`spawn`の引数として扱う具体的な方法、Core Wasm importsとComponent Model間の接続、JSPIの成立性、OPFSのロック・転送可能性、ブラウザCSP下のJco生成物ロード。

## 1. Visionと原則

WASI（WebAssembly System Interface）を土台に、**ブラウザ上で動く軽量なWasm-native Web OS**を構築する。Linuxカーネル・x86命令・ELFバイナリをエミュレーションするのではなく、**Linux向けの既存ソースコードをWASIへ再コンパイルして、できる限り小さな改修で動かす**。

ユーザーは**通常のWASIアプリケーションとして実装されたShell**を用い、別のWASIアプリを起動し、引数・環境変数・仮想ファイルシステム・Pipe・stdin/stdout/stderr・終了コードを扱う。

目標となる操作例：

```sh
cat README.md | grep TODO | sort
```

主要原則：

1. **WASI first：** 標準WASIと同じ機能を不要な独自APIで再発明しない。
2. **Wasm native：** Linuxのバイナリ互換ではなくWasmに適したProcess/Resourceモデルを使う。
3. **Shellも一般WASIアプリ：** Shellだけに特別なJavaScriptホスト権限を直接与えない。
4. **Small explicit extensions：** WASIにない`spawn`などの機能のみを、バージョン付きWeb OS ABIに置く。
5. **Portability：** C/C++、wasi-libc、必要に応じたPOSIX互換ライブラリの利用を想定する。
6. **Future capability security：** Capabilityベースの隔離は将来の目標。ただし**PoCでは強制隔離を実装しない**。
7. **Extensible, not prematurely implemented：** JS Runtime / Native Wasm / Threads / GUIなどの将来拡張の余地を残す。
8. **Measure, don't assume：** 性能優位を決めつけず、起動・メモリ・CPU・I/Oを測定する。

## 2. PoCの対象と対象外

| 対象 | 方針 |
|---|---|
| 第一ブラウザ | 最新のデスクトップChromium系 |
| 必須バックエンド | なし。基本処理・ファイル保存・変換はブラウザ内で完結 |
| UI | Terminal中心（Desktop GUIではない） |
| WASI Preview 1 / WASI 0.1 | PoCの最初の実装対象 |
| WASI Preview 2 / WASI 0.2 | 同じPoC内で対応する。Preview 1のあとで追加 |
| WASI 0.3 | 内部の非同期／Stream設計の参考。公開対応は将来 |
| Process | 1論理Process = 1 Dedicated Process Worker（PoC） |
| Shell / CLI | WASI製Shell、複数コマンド、Pipe、リダイレクト |
| 永続化 | OPFSを基本とする。`/tmp`はOS起動時に初期化 |
| Linux由来ソフト | **少なくとも1つ**、既存Linux向けソースからWASIへ移植して動作させる |
| Capability強制隔離 | PoC対象外。信頼済みWASIアプリだけを使う |
| ネットワーク・フルPTY・GUI・Threads | PoC対象外 |
| 完全オフライン起動 | PoCでは必須でない |

CLIは`cat`・`grep`・`sort`を代表例とする。少なくとも1つは既存Linux向けソース由来とし、ほかはPoCのための限定的な新規実装を許す。Linuxの`fork()`、`mmap()`、`ioctl()`、`epoll()`、高度なシグナルやJob Control、すべてのPOSIX操作の忠実な再現は目標としない。

## 3. Workerアーキテクチャ

```text
Browser Main Thread
  └── Terminal UI (表示・キーボード入力)
        ⇅ TTYデータ（簡易方式。通常PipeのACKや上限は用いない）

OS Core Worker (TypeScript)
  ├── Process Manager / Supervisor / PID / Process Handle
  ├── spawn / wait / request-stop / Worker terminate
  ├── Process Worker生成・監視・READY / EXIT / Cancel
  ├── Pipe・TTYの論理管理、Stream接続と所有関係
  ├── Stream移譲時のMessagePort仲介・制御
  └── 初期WASI Shellの起動
        ├── Process Worker: Shell
        │     ├── WASI Preview 1/2 Runtime Adapter
        │     ├── Web OS ABI Adapter
        │     ├── Local Descriptor / Stream / Resource Tables
        │     ├── OPFSを直接操作するFilesystem Adapter
        │     └── 必要時のComponent変換・キャッシュアクセス
        ├── Process Worker: CLI A
        └── Process Worker: CLI B

Pipe DATA: Process Worker ⇄ Process Worker (MessagePort, OS Coreを中継しない)
File I/O: 各Process Worker → OPFS (OS Coreを中継しない)
```

- **Process / Wasm Instance / Workerは概念的に別のもの**。PoCでは1:1:1として実装する。
- OS Core Workerが**直接**Process Workerを生成・終了・監視し、`Worker`参照を管理する。
- **Execution WorkerとExecution Worker Poolは設けない。** Process Worker自身がWASIアプリのロード・必要な変換・実行を担当する。
- 独立したTranspile WorkerはPoCでは設けない（性能測定で必要なら将来検討）。
- OS Coreは全OPFS I/Oを中継しない。`mkdir`、`rename`、`unlink`もProcess Workerから直接行う。
- OS CoreはProcessの状態、Pipe/TTYの論理接続、ProcessをまたぐStream所有関係を管理する。
- 公開WIT Resourceの番号／実体は**各Process WorkerのResource Table内で完結**し、その値を他Workerへそのまま渡さない。

## 4. WASIおよび公開Web OS ABI

### 4.1 バージョン戦略

- Preview 1（WASI 0.1）とPreview 2（WASI 0.2）の両方をPoCでサポートする。**Preview 1 → Preview 2の順番**で実装する。
- OS Coreの内部TSインターフェースはWITの特定バージョンに直接依存しない。内部では非同期／Streamの概念を採用する。
- WASI 0.3向けには将来、非同期中心の公開ABIを別バージョンとして用意する。
- Preview 1の互換性は、0.3と概念が重なる機能について可能な限り維持する。ただし完全POSIX互換は保証しない。
- Preview 1廃止の判断はプロジェクト日程ではなく、主要コンパイラ、libc、Component Modelの採用状況に基づく。

### 4.2 公開ABIの基本

**WITをWeb OS独自公開ABIの正本**とする。Bindingsは原則生成する。

| インターフェース（概念名） | 責務 |
|---|---|
| `webos:process` | `spawn`、Process Resource、`pid()`、`wait()`、`request-stop()` |
| `webos:ipc` | `create-pipe()`。戻り値は共通Input/Output Streamの組 |
| `webos:system` | 必要になった場合のみOS・ABIバージョンや対応機能の問い合わせ |

- `spawn`の実行対象は**パス文字列ではなく、読み取り可能なWASI Filesystem Descriptor**（概念上`borrow<descriptor>`）。
- `cwd`も文字列ではなく**Directory Descriptor**（概念上`borrow<descriptor>`）。
- `argv`、`env`、cwd、stdin/stdout/stderrを起動時点でスナップショット化する。
- `env`は`key`と`value`を持つrecordのリスト。重複キーの詳細は実装裁量。
- `spawn`成功時の戻り値は**Process Resource**。PIDはそのResourceのメソッドで取得する。
- 公開Process操作は原則、PID取得、`wait()`、`request-stop()`。細かな`status()`の継続観測はPoCでは不要。
- `spawn-error`は種別を持つWIT `variant`。`wait`が返す終了結果も**正常終了コード／Trap／強制終了**等を区別するvariant。
- `wait`の終了結果は一度だけ消費できる。Handleの`drop`はProcessを停止させない。
- Process HandleはPoCでは単独所有とし、複製・他Processへの移譲なし。
- WASI 0.2用公開`wait`は通常関数とし、非同期OS Core RPCへの接続はRuntime Adapterの責務。WASI 0.3版では`async`化を検討。
- POSIX互換の`posix_spawn()`などは、互換ライブラリがパスをDescriptorへ解決したうえでWeb OS ABIを呼ぶ。

#### Preview 1向けABI（Round 27 Q285）

WITの正本を維持しつつ、**Preview 1 Core Wasm向けに同等の意味を持つHost Imports**を提供する。Shellもその互換ライブラリからProcess・IPCを操作できるようにする。公開WITを変更せず、Core Wasm側の呼び出し形式とResource管理を適切に変換する。**別系統のProcess Managerを作らない。**

> **実装時に要確認：** WITの標準`wasi:filesystem`のDescriptor、`wasi:io/streams`のResourceを、独自`spawn`へ所有権付き引数としてどのように渡すか。コンポーネント間／World間のResourceの共有可能性や型の同一性は、利用するWITツールチェーンで検証して確定する。以下の例は仕様上の**意味**であり、そのままビルドできるWITを約束しない。

### 4.3 共通stdio / Streamの意味

File・Pipe・TTY・Nullを**共通Input Stream / Output Stream**として扱う。`spawn`公開APIには、File/Pipe/TTY別の`variant`を置かない。

- `stdin`：Input Stream、`stdout`・`stderr`：Output Stream。
- 明示的に渡したStreamは`spawn`呼び出し時点で**親から所有権を消費**する。READYを待っている間も親は使えない。
- READYに至らず`spawn`が失敗したら、Streamは**親へ返却しないで解放**する。
- **`inherit`は`spawn`の組み込み機能**とする。各stdioフィールドが未指定（概念上`none`）なら、OS Coreが親の対応するstdioをもとに子用の論理接続を生成する。
- PoCの暗黙的継承は**TTYとNullのみ**。PipeやFileの一般的継承、任意Streamの`dup()`や`2>&1`はPoC対象外。
- 親側のTTY/Null Streamを消費せず、子用に新たな接続を用意する。TTY stdout/stderrは複数接続を許す。
- Null Inputは常にEOF、Null Outputはデータを破棄する。
- 共通Streamは基本的なread/write/close、準備状態／待機可能性を表す。**seekとファイルメタデータはFilesystem Descriptor側**で扱う。
- WITの具体的な`option<...>`と`own`の構文・Resource IDの橋渡しは実装時に検証して決める。概念上`none=inherit`、`some(stream)=明示的に所有権移譲`とする。

### 4.4 Runtime Adapter / RPC

- Preview 1の整数FD Table（`0,1,2`など）とPreview 2のResource/`wasi:io/streams`を共通内部I/Oへ変換する。
- 共通内部I/Oはノンブロッキング操作と待機可能性を持つ。Preview 2では標準の`pollable` / `check-write()`等に接続し、Preview 1の同期的操作はAdapterで待機を橋渡しする。
- **JSPIを第一候補**として、同期WASI呼び出しと非同期Worker RPCをつなぐ。早期に最小実験で確認する。成立しなければSAB/Atomicsなどを検証する。SABでは必要なCross-Origin Isolation等のブラウザ設定も確認する。
- Worker RPCは公開ABIと分離した**TypeScriptの判別可能Union**。Request ID、型付きエラー、遅延応答の無視、必要なタイムアウトを実装する。
- JSPIも代替案も成立しなければ、制約・証拠・仕様影響・代替案をユーザーに報告する。WASI標準の意味を黙って変えない。

## 5. Process生成・状態・終了

### 5.1 `spawn`シーケンス

1. Shell/親WASIアプリがPATH検索等により実行対象を解決して、読み取り可能な実行ファイルDescriptorを用意する。
2. 親Process WorkerがDescriptorを検証し、対応する`FileSystemFileHandle`を解決する。将来のCapabilityチェックは主にこの境界を候補とする。
3. 親からOS Coreへ、実行ファイルハンドル、`argv`、`env`、cwd Descriptorの情報、stdio接続情報を送る。生のWasmバイト列をOS Coreに中継させない。
4. OS CoreがProcess Workerを直接生成し、必要なDescriptor/Stream転送情報を送る。
5. 子Process Workerがファイルをロードし、必要なComponent変換、Runtime Adapter、stdio、初期リソースを準備する。
6. **READY**受信を`spawn`成功の確定点とし、呼び出し元へProcess Resourceを返す。READY前の失敗は`spawn-error`。
7. READYの直後にEXITが来ても、同じPIDのProcess状態として扱う。実行ファイル内容は**子がロードした時点**のものであり、`spawn`要求時点の凍結スナップショットではない。

- PIDはOSインスタンス内で単調増加・再利用なし。Generation IDは設けない。
- 状態は内部的に`CREATED → STARTING → RUNNING → EXITED`、および失敗原因を管理する。
- OS CoreのREADY待機は非同期で、Core全体をブロックしない。起動タイムアウトは設定可能とする。
- `wait`で終了結果を一度だけ回収できる。Process HandleのdropでProcessは止まらない。Supervisorが孤児Processや終了記録を扱う。
- 停止は協調的`request-stop`と強制的Worker `terminate()`を区別。Worker異常、Trap、キャンセル後の遅延応答を適切に処理する。

### 5.2 stdio移譲の起動トランザクション（Q255〜Q258）

- stdin/stdout/stderrの移譲・継承先生成を**ひとまとまりの起動トランザクション**として扱う。
- READY前にどれかが失敗したら、部分的に接続済みのものを含めすべて適切に解放する。親へのStream返却はしない。
- 内部転送データは`kind`を持つTS判別可能Union（File/ Pipe/ TTY/ Null等）。これらの種類は**公開WITへ露出させない**。
- OS CoreはWorkerをまたぐStreamに一意の内部Stream IDを与え、所有先・移譲状態を追跡する。WorkerローカルなStreamはCoreに必ずしも登録しない。
- Stream移譲の状態は少なくとも「準備中」「受信側接続完了」「解放済み」を区別する。受信側Process Workerの接続完了通知で確定する。
- MessagePortが移譲後に失われた場合、送信元で再利用を試みず、接続全体をクリーンアップする。
- リソース解放は冪等（実解放は一度だけ）。親の異常終了、子の異常終了、キャンセル、タイムアウト、Port失敗が競合しても二重解放しない。
- `spawn`のREADY確定と親の異常終了によるキャンセル確定が競合した場合、**OS Core内で処理・確定したイベント順**で結果を決める。

### 5.3 親の正常終了／異常終了（Q257修正、Q270・Q282・Q283）

これは**最後のラウンドでの明示的修正**であり、古い「親Worker終了時には未完了`spawn`を常に中止」という記載より優先する。

| 親Process側の事象 | 子がREADY前 | 子がREADY後 |
|---|---|---|
| **正常終了**（終了コード0以外も含む） | **起動を継続**。親が応答を受け取れなくてもOS Coreが引き継ぐ | 独立して存続 |
| **異常終了**（Trap、明示通知のないWorker消失など） | **未完了の`spawn`をキャンセル**して関連リソース解放 | 独立して存続 |
| **明示的な`spawn`キャンセル** | 当該起動をキャンセルし、遅延READYは無視 | 起動成功済みProcessへは影響しない |

- **正常終了の判定**：Runtime AdapterからOS Coreへ明示的な正常終了通知が届いた場合。終了コードが非ゼロでも正式な終了通知なら正常終了に分類する。通知なしWorker消失／Trapは異常終了。
- 親がREADY前に正常終了した場合、起動処理と移譲済みリソースはOS Coreが管理し続ける。子がREADYとなれば**Supervisor管理の孤児Process**となる。
- READY前の親の異常終了によるキャンセルとREADY成功の競合は、OS Coreのイベント確定順で処理する。**親の正常終了はキャンセルイベントではない**。
- READY済みの子Processは、親の終了理由にかかわらず存続する。親のProcess Handle dropも子を止めない。
- 明示的な`spawn`キャンセルと、親の正常終了による応答先消失を混同しない。

## 6. FilesystemとFile Stream

### 6.1 VFS

- Unix風の仮想ルート`/`、`/bin`、`/home`、`/tmp`等を用意する。仮想ルートのPreopenとProcess別cwdを管理する。
- OPFSを主な永続保存先とする。`/tmp`は起動時にリセット。ブラウザストレージのQuotaや消失可能性を前提とする。
- 各Process Workerがread/write、`mkdir`、`rename`、`unlink`を直接OPFSで処理する。OS Coreにファイル操作を集中させない。
- OPFSの競合・ロックの結果を尊重し、独自のグローバルロックや自動リトライキューはPoCでは設けない。ロック競合は**即時エラー**として扱う。
- 完全なPOSIX rename/unlink原子性、任意FD共有、open-file-description共有は保証しない。
- close時には必要なflushを行い、毎writeごとのflushはしない。Workerのクラッシュ／強制終了時の未flush内容は保証しない。

### 6.2 Shellリダイレクト／File Streamの移譲

- `<`、`>`、`>>`の対象は、**親Shellまたは互換ライブラリが準備**し、File Streamとして子へ渡す。
- `>`のファイル作成・切り詰めはShellのリダイレクト準備時点で実行し、後の`spawn`失敗でも巻き戻さない。`>>`は切り詰めない。
- 子Process Workerが実際の継続的なOPFS read/writeを行う。親は排他的な`FileSystemSyncAccessHandle`を保持し続けない。
- 親は`FileSystemFileHandle`、モード、現在位置などの転送情報を渡す。子はパスを再解決せず、ハンドルからアクセスを開始する。もしそのハンドルでの操作が失敗すればエラーを返す。
- File Streamの現在位置は**Runtime Adapterの論理状態**で管理し、OPFSには明示的なオフセットを渡す。移譲時に現在位置も引き継ぐ。
- 読み書きの現在位置は**成功した実バイト数のみ**進める。読み取りでは実際の内容・サイズを参照し、古いサイズのスナップショットとして扱わない。
- `>>`の追記は書き込みごとに現在の末尾を確認し、実際に成功した書き込み量に基づいて位置を更新する。同時追記の原子性は保証しない。
- 子側でのFile Streamオープン失敗などREADY前の初期化エラーは`spawn-error`。READY後は対応するWASI filesystem/streamエラー。
- `DOMException`等のOPFS由来エラーはRuntime Adapterで内部エラーへ正規化し、Preview 1/2のそれぞれのWASIエラー形式へ変換する。元の例外はデバッグ用に残す。
- 同時操作中のファイル削除・移動やロックの挙動はブラウザ依存の部分を実測して記録する。POSIX完全互換を偽装しない。

## 7. 共通I/O、Pipe、Backpressure

### 7.1 Pipe生成と配線

- 公開`webos:ipc/create-pipe()`は**Input StreamとOutput Streamの組**を返す（独自公開Pipe Endpoint型は必須としない）。
- OS Coreが論理Pipe（1 Reader / 1 Writer）とEndpointの所有・終了を管理する。内部Stream IDはCoreが割り当てる。
- Process Worker間のDATAは**MessagePortによる直接通信**。OS Coreを全データの中継にしない。Coreは生成・接続・切断・終了処理を担当する。
- DATAはArrayBufferのChunkとして運ぶが、WASIアプリにはChunk境界を見せない。読み書きはByte Streamとして扱い、部分read/writeを許す。
- Readerが消費したバイト数をWriterへ**ACK（制御メッセージ）**として返す。ACK自体はArrayBufferではない。
- Pipeのバッファ上限は**設定可能**（初期候補64KiB）。DATA Chunk最大長も設定可能で、Pipe容量を超えるChunkは送らない。大きなwriteは分割する。

### 7.2 ACK / 送信可能量（Q262〜Q265、Q273〜Q277）

- **ACKはPipe開始からの累積消費バイト数**を通知する。Writerは最新値と送信済み累計から未ACK量を求める。
- WriterはACKの累積値が後退せず、送信済みバイト数も超えないことを検証する。矛盾は内部プロトコルエラーとしてPipeを終了する。
- ACKは一定量の消費をまとめて送る。Writerが容量不足で待機している場合は、少量の消費でも速やかにACKして待機を解除する。具体的な閾値は実測で調整。
- Writerは**容量上限 − 未ACKバイト数**の範囲でのみDATAを送る。空きがなければ待機し、ACKで回復したら`check-write()`等のreadinessへ反映する。
- Writerは最後のDATAを送ってからCLOSE通知を送る。Readerは**受信済みデータを読み尽くしてからEOF**を返す。
- Reader切断後、Writerの以降のwriteはBroken Pipe相当のエラーとし、未ACKデータの回収を待たずにPipeを終了できる。
- Worker終了／Stream closeでは相手側の待機をEOF・切断・エラー等で解除し、関連する内部リソースを冪等に破棄する。一般的なデッドロック検出器はPoCでは設けない。

### 7.3 Readinessとpollable（Q240、Q250〜Q254、Q265、Q278）

- Input Streamは、**データあり／EOFを観測できる／エラーを観測できる**ときreadableとする。
- Output Streamは空き容量に基づいてwritableとする。Pipeの満杯時は書き込み可能量0。
- 同一Streamへ複数pollableがある場合、**すべての待機中pollableに状態変化を反映する**。pollableごとにPipeやMessagePortは作らない。
- AdapterがStreamの状態と待機リストを管理し、閉鎖・異常終了時にも待機を必ず解除する。
- WASI Preview 2の`read`/`write`/`check-write`/`subscribe`/`pollable`の標準契約を尊重し、独自ブロッキング規則に書き換えない。Preview 1のブロッキングI/OはAdapterが橋渡しする。

## 8. TTY / Shell

### 8.1 TTY

- TTYはOS Coreが論理管理するPipe系の接続だが、PoCでは通常Pipeと異なり**ACKなし・容量上限なし**。
- Main ThreadのTerminal UIとProcess Worker間でTTYの実データを直接流す。TTY Outputは接続が生きている間、常にwritableとする。
- stdinとstdout/stderrは論理的に区別する。stdout/stderrは複数ProcessからTTYに出力してよい。
- TTY stdinの入力先は**常に最大1つのフォアグラウンドProcess**。ShellがForeground Pipelineの入力先をOS Coreへ明示する。通常はTTYをstdinとするPipeline先頭コマンドが候補で、リダイレクト時は入力先なしも許す。
- Pipeline終了時、ShellがTTY入力先を自分へ戻す。Shellが異常終了した場合はOS Coreが入力先を無効化する。
- TTY入力先が未設定の間は**新たな入力を保持せず破棄**する。古いProcessへの入力が新しいProcessへ届かないようにする。
- Ctrl+CはフォアグラウンドPipelineへの停止要求として扱う。高度なPTY、Job Control、端末モード制御は後続。

### 8.2 WASI Shell

- Shellは通常のWASIアプリであり、Process操作は`webos:process`、Pipe生成は`webos:ipc`を使用する。
- PATH検索、`argv`、環境変数、cwd、`cd`、stdio接続、`<`、`>`、`>>`、`|`、終了コードを扱う。
- `cat | grep | sort`ではShellがPipeを2本生成し、各Processのstdin/stdoutへ明示的にStreamを所有権移譲して並列起動する。
- Pipelineの終了コードは原則最後のコマンドの終了コード。起動失敗時には関連Processの停止とStream解放を適切に行う。
- 一般的な`dup()`、任意Streamの共有、`2>&1`、通常Pipe/Fileの暗黙的stdio継承はPoC対象外。
- ユーザー入力のCtrl+Cは現在のフォアグラウンドPipelineの停止へ対応付ける。

## 9. Component / Transpilation / Cache

- Core WasmのPreview 1とComponentのPreview 2で、ロード経路・Runtime Adapterを分ける。
- **JcoをPreview 2 Componentの変換基盤として活用**する（Round 27 Q287）。必要なComponent変換は**各Process Worker自身**が実施し、Core Wasm + JavaScript Glueをブラウザの標準WebAssembly Runtimeで動かす。
- Jcoや既存WASI Shimの再利用可能部分を活用するが、Web OS固有のHost実装は**共通I/O・Filesystem・Process管理**へ接続する。既存Shimを使うだけで全機能が成立すると仮定しない。
- Process Worker内のメモリキャッシュと、**OPFS上の共有永続変換キャッシュ**を用いる。
- キャッシュキーは元Componentの内容ハッシュ＋変換ツールバージョン＋オプション。複数Workerによる同一変換の重複は許す。
- キャッシュは一時領域で生成し、完成済みの成果物だけを公開する。PoCでは中央Cache Manager、自動LRUは不要。手動クリアを用意する。
- CSP、Blob URL、Dynamic Import、変換JS Glueのブラウザロード方式、OPFSでの完成物公開方法は初期に実験し、未検証の機構を本番経路とみなさない。

## 10. Securityと非目標

### 10.1 PoCのセキュリティ上の限界

**PoCは信頼済みWASIアプリのみを実行する。実効的なCapability強制隔離は実装しない。**

- 将来は親が委譲できるDescriptorやCapabilityだけを子へ渡すモデルを目指す。親Process WorkerでのDescriptor検証・解決はその候補境界。
- ただしProcess Workerから直接OPFS APIを使用できるため、Worker境界やWASI Preopenだけで不信なアプリを安全に隔離できるわけではない。PoCをマルチテナント安全実行基盤として表示しない。
- Browser API、CPU・メモリQuota、任意TCP/UDP、厳密なPOSIX互換はブラウザ制約を受ける。

### 10.2 PoC対象外

- Linuxカーネル・x86・ELFエミュレーション
- Full POSIX、`fork()`、`mmap()`、`ioctl()`、複雑なSignal、PTY、Job Control
- 任意FD継承、`dup()`、一般的なStream共有、`2>&1`
- 本格ネットワークCLI、GUI、Desktop、フルスクリーンTUI
- Native Wasm Runtime、JS Runtime、Thread / pthread
- 信頼できないアプリのCapability強制隔離、厳密なQuota
- Execution Worker Pool、Process Worker Pool、中央変換Worker
- 完全オフライン起動、一般的なデッドロック検出
- エミュレーション方式に対する性能優位の証明

## 11. 実装計画 — Vertical Slice（Round 27 Q284）

**各段階を動く状態で検証しながら積み上げる。** 異なる依存関係で並行して進められるものは適宜並列化してよいが、重要な境界を最後まで未検証のまま残さない。

| Slice | 最低限の成果 | 確認事項 |
|---|---|---|
| **1. Workerと最小Wasm** | Main Thread、OS Core Worker、1 Process Worker。CoreがWorkerを起動し、Wasmを実行してREADY/EXITを受信 | PID、起動/終了、Trap、強制終了、Core非ブロッキング |
| **2. WASI 0.1とOPFS** | WASI Preview 1 Runtime Adapter、argv/env/cwd、基本ファイル、stdin/out/err | ブラウザ上のHello World、読み書き、永続化 |
| **3. `spawn`/`wait`** | WIT正本とP1 Host Imports互換ライブラリ。WASIアプリから別のWASIアプリを起動 | Descriptorベース起動、Resource、READY待機、親終了の区別 |
| **4. Stream / Pipe / TTY** | `create-pipe`、MessagePort直接転送、ACKとreadiness、TTY入力管理 | 複数Process接続、EOF、Broken Pipe、Ctrl+C |
| **5. WASI Shell** | PATH、`cd`、リダイレクト、Pipeline | `cat README.md \| grep TODO \| sort` |
| **6. WASI 0.2** | Component Model、Jco変換・キャッシュ、Preview 2 Host Adapter | 標準`wasi:io`とWeb OS ABIの接続、Component実行 |
| **7. 完成検証** | 既存Linux由来CLIを最低1つ移植、異常系テスト、計測 | 合格基準の実測と再現手順 |

**初期の技術リスク検証を前倒しする：**

1. JSPIで同期WASI importと非同期Worker RPCを橋渡しできるか。
2. できなければSAB/Atomicsの成立条件とCross-Origin Isolation等を調べる。
3. OPFS `FileSystemFileHandle`のWorker間Structured Clone、アクセスハンドルのロック、実際のI/Oを検証する。
4. MessagePort移譲・Ready ACK・相手Worker終了時の挙動を確認する。
5. Jcoによるブラウザ用Component変換、生成JSのCSP・ロード・キャッシュを検証する。
6. WIT正本・Preview 1のHost Imports・Preview 2のResource型を、実際のツールチェーンで検証する。

技術リスクを低減するため、上記の実験は該当Sliceより前に実施してよい。

## 12. PoCの合格基準

以下をブラウザ上で実行・確認し、再現可能な手順（テスト・ログ・画面等）を残す。

1. **WASIアプリであるShell**がWeb OS ABIの`spawn`から別のWASI CLIを起動し、Process Resource・PID・`wait`結果を扱える。
2. `argv`、`env`、cwd Descriptor、stdin/stdout/stderrが意図したProcessに渡る。
3. OPFSで基本ファイル・ディレクトリ操作ができ、永続化、`<`、`>`、`>>`が動く。
4. 複数ProcessをPipeで並行接続でき、`cat README.md | grep TODO | sort`相当を動かせる。
5. **既存Linux向けソース由来のCLIを少なくとも1つ**WASIへ再コンパイルして動かせる。
6. Trapや強制終了、Readerの切断等が無関係なProcessやShellを停止させず、Stream/待機を適切に解放できる。
7. 親の正常終了と異常終了が**READY前／READY後**で確定表どおりに扱われる。異常終了とREADYの競合、複数の終了イベントで二重解放しない。
8. Preview 1 / Preview 2の双方について、対応している機能と未対応の機能を明示し、各形式の基本実行を確認する。
9. 起動時間、メモリ、CPU、ファイルI/O、Pipeの簡単なベンチマーク結果を記録する。比較対象方式より優れることまでは必須ではない。

**PoCの合格条件に含めないもの：** Capability拒否テスト、一般的な`dup()`、完璧なPOSIX互換、Threads、ネットワークCLI、GUI、完全PTY。

## 13. 実装時に決めてよい事項／要検証事項

以下は**新しいGrillingを必要としない実装裁量または技術検証**であり、未決定の設計質問ではない。

- 公開WITの正確な`package`、`world`、`interface`、`resource`、`own`/`borrow`表記と、生成Bindingsの置き場所。
- Preview 1互換用Core Wasm import名、ABIエンコード、libcラッパーの具体化。ただし公開意味はWITに一致させる。
- TS Worker RPCのmessage schema、Process/Stream識別子の内部形、RequesterのRequest ID。
- Spawn timeout、Pipe容量（64KiBは初期候補）、DATA Chunk最大長、ACK集約閾値。
- 正確なDOMExceptionからWASIエラーへの対応表、診断ログ形式。
- OPFSのclone・rename・ロック・flush・削除時挙動を考慮した具体的Adapter設計。
- Blob URL / Dynamic Import / CSP、Jcoの選定バージョン、キャッシュ公開方法。
- `pollable`やStream終了時の細かなイベント解除順序。**WASIの標準契約を壊さないこと**。
- 自動テストのフレームワーク、リポジトリ構成、CLIの最初の移植候補、性能計測方法。

**変更時にユーザー承認を求める事項：** 1 Process = 1 Workerの撤回、OS Core経由の常時Pipe DATA中継、Process WorkerのOPFS直接I/Oの撤回、公開ABIのDescriptor/Stream所有権の意味の変更、ShellをJS特権アプリへ変更、PoCのセキュリティ範囲の拡大など、確定した主要設計への変更。

## 14. Grilling終了時点で上書きされた主要判断

| 古い案／スナップショットの記述 | 最終判断 |
|---|---|
| Execution Worker / Poolを別途設ける | **廃止**。Process Workerが変換と実行を担当 |
| OS CoreがOPFS read/write/namespace操作を集中処理 | 各Process Workerが直接OPFSへアクセス |
| `spawn`に実行ファイルパスを渡す | **読み取り可能なFilesystem Descriptor**を渡す |
| stdioをFile/Pipe/TTYの公開`variant`で渡す | 共通Input/Output Streamを使用 |
| Pipe Endpointを独自公開Resourceとする | `create-pipe()`は共通Input/Output Streamの組を返す |
| `spawn`失敗時にStreamを親へ返却する | **親へ返却せず解放する** |
| すべての`inherit`をShell側で解決する | **TTY/Nullの`inherit`は`spawn`に組み込む**。汎用`dup()`は不要 |
| Fileリダイレクトは子が最初にパス解決する | 親が事前準備・作成／切り詰めし、子がOPFSハンドルを開く |
| 親Workerが終了したらREADY前の子をすべてキャンセル | **親の異常終了時のみキャンセル**。正常終了ならREADY前でも子は存続 |
| ACKに差分バイト数を送る | **累積消費バイト数**を通知 |
| 特定のWASIバージョンだけをPoCで提供 | Preview 1から始め、Preview 2もPoCで対応 |
| Preview 1アプリがWeb OS ABIを呼べない | WIT正本から**Core Wasm用Host Imports互換レイヤー**を用意 |
| Preview 2を全て新規実装する | **Jco等を活用**して共通Host実装に接続 |
| Grillingを継続して細部まで決める | **Round 27で終了。実装と検証へ進む** |

## 15. 将来の拡張（PoC以降）

1. より広いlibc/POSIX互換性、WASI 0.3の非同期公開ABI、PTY、Job Control、ネットワーク等。
2. 実効的なCapability強制隔離。Process WorkerによるOPFS直アクセスとの両立を設計し直す必要がある。
3. Native WasmやJavaScript Runtime、Wasm Runtime API、追加のBrowser Host API。
4. Thread/pthread・Shared Memory・Wasm Atomics等の対応。Component Modelやツールチェーンの成熟に合わせる。
5. 性能測定に基づくTranspile Workerの分離、キャッシュ最適化、Worker Poolの検討。

---

**GrillingはRound 27（Q284〜Q288すべてYES）をもって完了。** 本書は、CodexがWeb OSの実装に着手するための**合意済みコンセプト・設計ベースライン**である。細部の妥当性は実際のブラウザ・WASIツールチェーン・テストで確認し、未実装を実装済みと表現しない。
