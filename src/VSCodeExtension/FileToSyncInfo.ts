import { FileSyncDirection } from "./FileSyncDirection";
import { FileSyncReason } from "./FileSyncReason";
import { SyncedFileInfo } from "./SyncedFileInfo";

export class FileToSyncInfo {
    localTime: number = 0;
    remoteTime: number = 0;
    get modifiedMilliseconds(): number { return this.modifiedSeconds * 1000; }

    constructor(
        public readonly name: string,
        public readonly modifiedSeconds: number,
        public readonly direction: FileSyncDirection,
        public readonly reason: FileSyncReason) {
        if (direction === FileSyncDirection.download) {
            this.remoteTime = modifiedSeconds;
        }
        else if (direction === FileSyncDirection.upload) {
            this.localTime = modifiedSeconds;
        }
        else {
            throw new Error("Invalid FileSyncDirection");
        }
    }


    toSyncedFileInfo(): SyncedFileInfo {
        return new SyncedFileInfo(this.localTime, this.name, this.remoteTime);
    }
}
