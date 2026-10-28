// Private shared service operations; these are not the public WASI contract.
import type { Exit } from '../types.js';
export interface EnvironmentEntry {
  readonly key: string;
  readonly value: string;
}
export interface Environment {
  get(key: string): string | undefined;
  has(key: string): boolean;
  entries(): readonly EnvironmentEntry[];
}
export interface Pollable extends AsyncDisposable {
  ready(): boolean;
  block(): Promise<void>;
}
export interface InputStream extends AsyncDisposable {
  read(length: bigint): Promise<Uint8Array>;
  blockingRead(length: bigint): Promise<Uint8Array>;
  skip(length: bigint): Promise<bigint>;
  blockingSkip(length: bigint): Promise<bigint>;
  subscribe(): Pollable;
}
export interface OutputStream extends AsyncDisposable {
  checkWrite(): bigint;
  write(bytes: Uint8Array): Promise<void>;
  flush(): Promise<void>;
  blockingFlush(): Promise<void>;
  subscribe(): Pollable;
}
export interface IoService {
  readonly stdin: InputStream;
  readonly stdout: OutputStream;
  readonly stderr: OutputStream;
  createPipe(): Promise<readonly [InputStream, OutputStream]>;
}
export type DescriptorType = 'directory' | 'regular-file';
export interface DescriptorFlags {
  readonly read?: boolean;
  readonly write?: boolean;
  readonly mutateDirectory?: boolean;
}
export interface OpenFlags {
  readonly create?: boolean;
  readonly exclusive?: boolean;
  readonly truncate?: boolean;
  readonly directory?: boolean;
}
export interface PathFlags {
  readonly symlinkFollow?: boolean;
}
export interface Datetime {
  readonly seconds: bigint;
  readonly nanoseconds: number;
}
export interface DescriptorStat {
  readonly type: DescriptorType;
  readonly linkCount: bigint;
  readonly size: bigint;
  readonly dataModificationTimestamp?: Datetime;
}
export interface DirectoryEntry {
  readonly name: string;
  readonly type: DescriptorType;
}
export interface DirectoryEntryStream extends AsyncDisposable {
  readDirectoryEntry(): Promise<DirectoryEntry | undefined>;
}
/** Both file and directory descriptors use the P2 descriptor-relative model. */
export interface FileDescriptor extends AsyncDisposable {
  getType(): DescriptorType;
  getFlags(): DescriptorFlags;
  openAt(
    pathFlags: PathFlags,
    path: string,
    openFlags: OpenFlags,
    flags: DescriptorFlags,
  ): Promise<FileDescriptor>;
  stat(): Promise<DescriptorStat>;
  statAt(pathFlags: PathFlags, path: string): Promise<DescriptorStat>;
  readViaStream(offset: bigint): Promise<InputStream>;
  writeViaStream(offset: bigint): Promise<OutputStream>;
  appendViaStream(): Promise<OutputStream>;
  read(length: bigint, offset: bigint): Promise<readonly [Uint8Array, boolean]>;
  write(bytes: Uint8Array, offset: bigint): Promise<bigint>;
  setSize(size: bigint): Promise<void>;
  sync(): Promise<void>;
  readDirectory(): Promise<DirectoryEntryStream>;
  createDirectoryAt(path: string): Promise<void>;
  removeDirectoryAt(path: string): Promise<void>;
  unlinkFileAt(path: string): Promise<void>;
  renameAt(path: string, destination: FileDescriptor, newPath: string): Promise<void>;
  isSameObject(other: FileDescriptor): Promise<boolean>;
}
export interface FilesystemService {
  getDirectories(): readonly (readonly [FileDescriptor, string])[];
}
export interface ChildProcess extends AsyncDisposable {
  pid(): number;
  wait(): Promise<Exit>;
  requestStop(): Promise<void>;
}
export interface ProcessService {
  spawn(
    executable: FileDescriptor,
    argv: readonly string[],
    env: readonly EnvironmentEntry[],
    stdin?: InputStream,
    stdout?: OutputStream,
    stderr?: OutputStream,
  ): Promise<ChildProcess>;
}
export interface ClockService {
  readonly wall: { now(): Datetime; resolution(): Datetime };
  readonly monotonic: {
    now(): bigint;
    resolution(): bigint;
    subscribeInstant(instant: bigint): Pollable;
    subscribeDuration(duration: bigint): Pollable;
  };
}
export interface RandomService {
  getRandomBytes(length: bigint): Uint8Array;
  getRandomU64(): bigint;
  getInsecureRandomBytes(length: bigint): Uint8Array;
  getInsecureRandomU64(): bigint;
  insecureSeed(): readonly [bigint, bigint];
}
export interface ServiceModel {
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
