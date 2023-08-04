import { IFileSystem, FileSystem } from "../Utils/FileSystem";
import { SyncedFileInfo } from "./SyncedFileInfo";

export class SimpleS3SyncSettings {
    static readonly trashFolder: string = ".simple-s3-sync.trash";
    static readonly trashFile: string = `${SimpleS3SyncSettings.trashFolder}/.keep`;
    static readonly trashFileData: string = "(This file is auto-created by the Simple S3 Sync VS Code extension. It is a placeholder to preserve its bucket folder.)";
    static readonly workspaceFile: string = ".simple-s3-sync.json";

    profile: string = "default";
    bucket: string = "";
    folder: string | null = null;
    include: string[] = [];
    exclude: string[] = [];
    synced: SyncedFileInfo[] = [];

    private static readonly _fileReader: IFileSystem = new FileSystem();
    private static readonly _alwaysExclude: string[] = [`**/${SimpleS3SyncSettings.workspaceFile}`, `**/${SimpleS3SyncSettings.trashFolder}/**`];

    constructor(init?: Partial<SimpleS3SyncSettings>, creatingNew: boolean = false) {
        Object.assign(this, init);

        if (!creatingNew) {
            if (!this.profile) { throw new Error("Profile is required."); }
            else if (!this.bucket) { throw new Error("Bucket is required."); }
        }

        if (this.folder && (this.folder.startsWith('/') || this.folder.endsWith('/'))) {
            throw new Error("Folder cannot start or end with '/'.");
        }

        this.synced.forEach(s => {
            if (!s.name || s.name === '') { throw new Error(`Sync name is required. See '${SimpleS3SyncSettings.workspaceFile}' workspace settings file.`); }
            if (!s.localTime || typeof s.localTime !== 'number') { throw new Error(`Sync local modified time is required. See '${SimpleS3SyncSettings.workspaceFile}' workspace settings file.`); }
            if (!s.remoteTime || typeof s.remoteTime !== 'number') { throw new Error(`Sync local modified time is required. See '${SimpleS3SyncSettings.workspaceFile}' workspace settings file.`); }
        });
    }

    static async load(path: string): Promise<SimpleS3SyncSettings> {
        return this._fileReader.readFileAsJson(path).then(data => {
            return new SimpleS3SyncSettings(data);
        }, err => {
            throw err;
        });
    }

    static new(): SimpleS3SyncSettings {
        return new SimpleS3SyncSettings({
            profile: "default",
            bucket: "",
            folder: "",
            include: [
                "**/**"
            ],
            exclude: [
                "**/.DS_Store",
                "**/.git/**",
                "**/bin/**",
                "**/bower_components/**",
                "**/desktop.ini",
                "**/node_modules/**",
                "**/obj/**"
            ]
        }, true);
    }

    excludeGlob(): string | undefined {
        return this.toGlobPattern(this.exclude.concat(SimpleS3SyncSettings._alwaysExclude));
    }

    includeGlob(): string | undefined {
        return this.toGlobPattern(this.include);
    }

    toSettingsInfoString(): string {
        return `Simple S3 Sync Settings:\n  - AWS Profile: ${this.profile}\n  - S3 Bucket: ${this.bucket}\n  - S3 Bucket Folder: ${this.folder ?? "(none)"}\n  - Include Pattern: ${this.includeGlob() ?? '(empty)'}\n  - Exclude Pattern: ${this.excludeGlob() ?? '(empty)'}`;
    }

    private toGlobPattern(values: string[]): string | undefined {
        return values.length === 0 ? undefined : (values.length === 1 ? values[0] : `{${values.join(",")}}`);
    }
}
