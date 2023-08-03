import { FileInfo } from "../Utils/FileInfo";
import { AwsS3ListObject } from "../Aws/AwsS3ListObject";
import { FileToSyncInfo } from "./FileToSyncInfo";
import { SimpleS3SyncSettings } from "./SimpleS3SyncSettings";
import { IAws } from "../Aws/Aws";
import { SyncedFileInfo } from "./SyncedFileInfo";

export class SyncContext {
    constructor(
        public readonly settings: SimpleS3SyncSettings,
        public readonly aws: IAws,

        public workspaceFilesToUpload: FileToSyncInfo[] = [],
        public bucketFilesToDownload: FileToSyncInfo[] = [],

        public workspaceFilesToDelete: FileInfo[] = [],
        public bucketFilesToDelete: AwsS3ListObject[] = [],
        public syncedInfoToRemove: SyncedFileInfo[] = [],

        public syncedInfoToIgnore: SyncedFileInfo[] = [],
        public workspaceFilesToIgnore: FileToSyncInfo[] = [],
        public bucketFilesToIgnore: FileToSyncInfo[] = [],
    ) { }
}
