export class SyncedFileInfo {
    constructor(
        public readonly localTime: number,
        public readonly name: string,
        public readonly remoteTime: number) { }
}
