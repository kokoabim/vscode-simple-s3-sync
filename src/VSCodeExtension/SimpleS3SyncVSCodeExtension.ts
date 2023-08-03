import * as vscode from "vscode";
import { Aws, IAws } from '../Aws/Aws';
import { SimpleS3SyncSettings } from "./SimpleS3SyncSettings";
import { VSCodeCommand } from "./VSCodeCommand";
import { VSCodeExtension } from "./VSCodeExtension";
import { FileInfo } from "../Utils/FileInfo";
import { AwsS3ListObject } from '../Aws/AwsS3ListObject';
import { FileToSyncInfo } from "./FileToSyncInfo";
import { FileSyncReason } from "./FileSyncReason";
import { FileSyncDirection } from "./FileSyncDirection";
import { SyncContext } from './SyncContext';
import '../Extensions/Array.extensions';
import '../Extensions/Date.extensions';

/**
 * Simple S3 Sync (S5) VS Code extension
 */
export class SimpleS3SyncVSCodeExtension extends VSCodeExtension {
    private _awsCliExists: boolean | undefined;
    private _workspaceSettingsFile: string | undefined;
    private _workspaceTrashFolder: string | undefined;

    private constructor(context: vscode.ExtensionContext) {
        super(context);

        this.addCommands(
            this.createCreateSettingsFileCommand(),
            this.createCheckStatusCommand(),
            this.createGoToS3BucketCommand(),
            this.createTwoWaySyncCommand(),
            this.createUploadLocalWorkspaceCommand(),
            this.createDownloadS3BucketCommand());
    }

    static use(context: vscode.ExtensionContext) {
        new SimpleS3SyncVSCodeExtension(context);
    }

    protected override isWorkspaceReady(): boolean {
        if (!super.isWorkspaceReady()) { return false; }

        this._workspaceSettingsFile = this.workspacePath(SimpleS3SyncSettings.workspaceFile);
        this._workspaceTrashFolder = this.workspacePath(SimpleS3SyncSettings.trashFolder);
        return true;
    }

    private async awsCliExists(): Promise<boolean> {
        return this._awsCliExists || (this._awsCliExists = await Aws.cliExists());
    }

    private createCheckStatusCommand(): VSCodeCommand {
        return new VSCodeCommand("kokoabim.ss3sync.status", async () => {
            const syncContext = await this.determineSyncContext();
            this.outputChannel.appendLine("\n✅ Finished checking status.");
        });
    }

    private createCreateSettingsFileCommand(): VSCodeCommand {
        return new VSCodeCommand("kokoabim.ss3sync.create-workspace-settings-file", async () => {
            if (!this.isWorkspaceReady()) { return; }
            await this.createWorkspaceSettingsFile();
        });
    }

    private createDownloadS3BucketCommand(): VSCodeCommand {
        return new VSCodeCommand("kokoabim.ss3sync.download-s3-bucket", async () => {
            await this.performSync(FileSyncDirection.download);
        });
    }

    private createGoToS3BucketCommand(): VSCodeCommand {
        return new VSCodeCommand("kokoabim.ss3sync.goto-s3-bucket", async () => {
            if (!this.isWorkspaceReady()) { return; }

            const settings = await this.loadWorkspaceSettingsFile();
            if (!settings) { return; }

            await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(`https://s3.console.aws.amazon.com/s3/buckets/${settings.bucket}${settings.folder ? `/${settings.folder}/` : ''}`));
        });
    }

    private createTwoWaySyncCommand(): VSCodeCommand {
        return new VSCodeCommand("kokoabim.ss3sync.two-way-sync", async () => {
            await this.performSync();
        });
    }

    private createUploadLocalWorkspaceCommand(): VSCodeCommand {
        return new VSCodeCommand("kokoabim.ss3sync.upload-local-workspace", async () => {
            await this.performSync(FileSyncDirection.upload);
        });
    }

    private async createWorkspaceSettingsFile(): Promise<void> {
        const shouldNotWriteFile = await this.fileSystem.exists(this._workspaceSettingsFile!).then(async exists => {
            if (!exists) { return false; }

            const answer = await vscode.window.showErrorMessage('The Simple S3 Sync workspace settings file already exists. Do you want to overwrite it?', {
                modal: true,
                detail: 'WARNING: Any previous sync settings will be removed. No local workspace or S3 bucket files will be deleted but rather the data stored in the workspace settings file.'
            }, 'Yes', 'No');

            return answer !== 'Yes';
        });
        if (shouldNotWriteFile) { return; }

        await this.fileSystem.writeFile(this._workspaceSettingsFile!, SimpleS3SyncSettings.new(), true);

        await vscode.workspace.openTextDocument(this._workspaceSettingsFile!).then(doc => vscode.window.showTextDocument(doc));
    }

    private deleteBucketFiles(s3Files: AwsS3ListObject[], timestamp: string, aws: IAws): Promise<string>[] {
        return s3Files.map(s3File => {
            return new Promise<string>(async (resolve, reject) => {
                this.outputChannel.appendLine(`  - Deleting S3 bucket file: ${s3File.name}`);
                const s3FileTimestamp = new Date(s3File.modifiedSeconds * 1000).format("yyyy-MM-dd_HH-mm-ss");
                await aws.s3MoveObject(s3File.name, `${SimpleS3SyncSettings.trashFolder}/${timestamp}/${s3File.name}.${s3FileTimestamp}${this.fileSystem.extension(s3File.name)}`).then(result => {
                    if (result) {
                        resolve(s3File.name);
                    }
                    else {
                        this.outputChannel.appendLine(`  - 🔴 Error moving S3 bucket file to trash. Its synced information will not be saved (unless this is an upload sync). File: ${s3File.name}`);
                        reject();
                    }
                }, err => {
                    this.outputChannel.appendLine(`  - 🔴 Error moving S3 bucket file to trash. Its synced information will not be saved (unless this is an upload sync). File: ${s3File.name}, message: ${err.message}`);
                    reject();
                });
            });
        });
    }

    private async deleteWorkspaceFiles(localFiles: FileInfo[], timestamp: string): Promise<string[]> {
        const names: string[] = [];

        for (const localFile of localFiles) {
            this.outputChannel.appendLine(`  - Deleting local workspace file: ${localFile.name}`);
            const fileTimestamp = new Date(localFile.modified).format("yyyy-MM-dd_HH-mm-ss");
            await this.fileSystem.moveFile(this.fileSystem.resolvePaths(this.workspaceFolder!.uri.path, localFile.name), this.fileSystem.resolvePaths(this._workspaceTrashFolder!, timestamp, `${localFile.name}.${fileTimestamp}${this.fileSystem.extension(localFile.name)}`), true).then(() => {
                names.push(localFile.name);
            });
        }

        return names;
    }

    private async determineSyncContext(direction: FileSyncDirection = FileSyncDirection.both): Promise<SyncContext | undefined> {
        if (!this.isWorkspaceReady()) { return; }

        const syncContext = await this.prepareForSync();
        if (!syncContext) { return; }

        // confirmation on one-way syncs

        if (direction !== FileSyncDirection.both) { // one-way sync
            const answer = await vscode.window.showWarningMessage(`Are you sure you want to overwrite ${direction === FileSyncDirection.upload ? 'S3 bucket files by uploading local workspace' : 'local workspace files by downloading S3 bucket'} files?`, {
                modal: true,
                detail: `WARNING: This will overwrite any existing ${direction === FileSyncDirection.upload ? 'S3 bucket' : 'local workspace'} files.\n\nNOTE: ${direction === FileSyncDirection.upload ? 'S3 bucket' : 'Local workspace'} files that are not matched by 'include' and 'exclude' patterns will not be overwritten but ignored.\n\nBefore the sync is performed, you will be shown a list of files that will be overwritten.`
            }, 'Yes', 'No');

            if (answer !== 'Yes') {
                this.outputChannel.appendLine("\n😥 Whoa, close call. Sync cancelled.");
                return;
            }
        }

        // match files

        const matchingWorkspaceFiles = await this.workspaceFiles(syncContext.settings.includeGlob(), syncContext.settings.excludeGlob());

        const matchingBucketFiles = await syncContext.aws.s3ListObjects().then(objects => {
            return AwsS3ListObject.match(objects, syncContext.settings.includeGlob(), syncContext.settings.excludeGlob());
        });

        // counts

        this.outputChannel.appendLine("\nCounts:");
        this.outputChannel.appendLine(`  - Sync information items: ${syncContext.settings.synced.length}`);
        this.outputChannel.appendLine(`  - Local workspace files:  ${matchingWorkspaceFiles.length}`);
        this.outputChannel.appendLine(`  - S3 bucket/folder files: ${matchingBucketFiles.length}`);

        // files to delete, synced info to ignore/remove

        syncContext.bucketFilesToDelete = direction === FileSyncDirection.both // filter if full sync, all if uploading, none if downloading
            ? matchingBucketFiles.filter(bf => syncContext.settings.synced.some(s => s.name === bf.name && s.remoteTime === bf.modifiedSeconds && !matchingWorkspaceFiles.some(wf => wf.name === bf.name)))
            : direction === FileSyncDirection.upload
                ? matchingBucketFiles
                : [];

        syncContext.workspaceFilesToDelete = direction === FileSyncDirection.both // filter if full sync, all if downloading, none if uploading
            ? matchingWorkspaceFiles.filter(wf => syncContext.settings.synced.some(s => s.name === wf.name && s.localTime === wf.modifiedSeconds && !matchingBucketFiles.some(bf => bf.name === wf.name)))
            : direction === FileSyncDirection.download
                ? matchingWorkspaceFiles
                : [];

        syncContext.syncedInfoToRemove = direction === FileSyncDirection.both // filter if full sync, otherwise all
            ? syncContext.settings.synced.filter(s => !matchingBucketFiles.some(bf => bf.name === s.name) && !matchingWorkspaceFiles.some(wf => wf.name === s.name))
            : syncContext.settings.synced;

        syncContext.syncedInfoToIgnore = direction === FileSyncDirection.both // filter if full sync, otherwise none (since not used)
            ? syncContext.settings.synced.filter(s =>
                matchingBucketFiles.some(bf => bf.name === s.name && s.remoteTime > bf.modifiedSeconds)
                || matchingWorkspaceFiles.some(wf => wf.name === s.name && s.localTime > wf.modifiedSeconds))
            : [];

        if (direction === FileSyncDirection.both) { // full sync
            if (syncContext.syncedInfoToIgnore.length > 0) {
                this.outputChannel.appendLine(`\n⛔️ Bad sync information (${syncContext.syncedInfoToIgnore.length}) since either (1) local modified time is later than that of its local workspace file or (2) remote modified time is later than that of its S3 bucket file. Files will not be synced.`);
                syncContext.syncedInfoToIgnore.forEach(s => this.outputChannel.appendLine(`  - ${s.name}`));
            }

            if (syncContext.syncedInfoToRemove.length > 0) {
                this.outputChannel.appendLine(`\n🗑️ Sync information (${syncContext.syncedInfoToRemove.length}) to be removed since neither local workspace file or S3 bucket file exists.`);
                syncContext.syncedInfoToRemove.forEach(s => this.outputChannel.appendLine(`  - ${s.name}`));
            }
        }

        if (syncContext.workspaceFilesToDelete.length > 0) {
            this.outputChannel.appendLine(`\n🗑️ Local workspace files (${syncContext.workspaceFilesToDelete.length}) to be deleted since ${direction === FileSyncDirection.both ? 'its S3 bucket file does not exist' : 'overwriting with S3 bucket'}.`);
            syncContext.workspaceFilesToDelete.forEach(wf => this.outputChannel.appendLine(`  - ${wf.name}`));
        }

        if (syncContext.bucketFilesToDelete.length > 0) {
            this.outputChannel.appendLine(`\n🗑️ S3 bucket files (${syncContext.bucketFilesToDelete.length}) to be deleted since ${direction === FileSyncDirection.both ? 'its local workspace file does not' : 'overwriting with local workspace'}.`);
            syncContext.bucketFilesToDelete.forEach(bf => this.outputChannel.appendLine(`  - ${bf.name}`));
        }

        // candidate files to sync

        if (direction === FileSyncDirection.both) { // full sync
            matchingWorkspaceFiles.forEach(wf => {
                if (syncContext.syncedInfoToIgnore.some(s => s.name === wf.name)) { return; }
                else if (syncContext.workspaceFilesToDelete.some(ftd => ftd.name === wf.name)) { return; }

                let r = FileSyncReason.none;
                const s = syncContext.settings.synced.find(s => s.name === wf.name);

                if (!s) { r = FileSyncReason.hasNotBeenSynced; }
                else if (s.localTime < wf.modifiedSeconds) { r = FileSyncReason.newer; }
                else if (!matchingBucketFiles.some(bf => bf.name === wf.name)) { r = FileSyncReason.doesNotExist; }

                if (r !== FileSyncReason.none) { syncContext.workspaceFilesToUpload.push(new FileToSyncInfo(wf.name!, wf.modifiedSeconds, FileSyncDirection.upload, r)); }
            });

            matchingBucketFiles.forEach(bf => {
                if (syncContext.syncedInfoToIgnore.some(s => s.name === bf.name)) { return; }
                else if (syncContext.bucketFilesToDelete.some(ftd => ftd.name === bf.name)) { return; }

                let r = FileSyncReason.none;
                const s = syncContext.settings.synced.find(s => s.name === bf.name);

                if (!s) { r = FileSyncReason.hasNotBeenSynced; }
                else if (s.remoteTime < bf.modifiedSeconds) { r = FileSyncReason.newer; }
                else if (!matchingWorkspaceFiles.some(wf => wf.name === bf.name)) { r = FileSyncReason.doesNotExist; }

                if (r !== FileSyncReason.none) { syncContext.bucketFilesToDownload.push(new FileToSyncInfo(bf.name, bf.modifiedSeconds, FileSyncDirection.download, r)); }
            });
        }
        else if (direction === FileSyncDirection.upload) {
            syncContext.workspaceFilesToUpload = matchingWorkspaceFiles.map(wf => new FileToSyncInfo(wf.name!, wf.modifiedSeconds, FileSyncDirection.upload, FileSyncReason.uploading));
        }
        else if (direction === FileSyncDirection.download) {
            syncContext.bucketFilesToDownload = matchingBucketFiles.map(bf => new FileToSyncInfo(bf.name, bf.modifiedSeconds, FileSyncDirection.download, FileSyncReason.downloading));
        }

        // possibly ignore some candidate files (if full sync, otherwise ignore)

        if (direction === FileSyncDirection.both) {
            const matchingFilesForDifferentReasons: FileToSyncInfo[] = [];
            const matchingFilesWithIssues: FileToSyncInfo[] = [];
            const matchingFileNamesForBothUploadAndDownload = syncContext.workspaceFilesToUpload.filter(wfs => syncContext.bucketFilesToDownload.some(bfs => bfs.name === wfs.name)).map(wfs => wfs.name);

            matchingFileNamesForBothUploadAndDownload.forEach(name => {
                let doNotUploadOrDownloadFile = false;
                const wfs = syncContext.workspaceFilesToUpload.find(fs => fs.name === name)!;
                const bfs = syncContext.bucketFilesToDownload.find(fs => fs.name === name)!;

                if (wfs.reason !== bfs.reason) {
                    matchingFilesForDifferentReasons.push(...[wfs, bfs]);
                    doNotUploadOrDownloadFile = true;
                }
                else {
                    let issueWithReasonOrModifiedValue = false;
                    if (wfs.reason === FileSyncReason.newer || wfs.reason === FileSyncReason.doesNotExist) {
                        if (wfs.modifiedSeconds > bfs.modifiedSeconds) { syncContext.bucketFilesToDownload.remove(bf => bf.name === bfs.name); }
                        else if (wfs.modifiedSeconds < bfs.modifiedSeconds) { syncContext.workspaceFilesToUpload.remove(wf => wf.name === wfs.name); }
                        else { issueWithReasonOrModifiedValue = true; }
                    }
                    else { issueWithReasonOrModifiedValue = true; }

                    if (issueWithReasonOrModifiedValue) {
                        matchingFilesWithIssues.push(...[wfs, bfs]);
                        doNotUploadOrDownloadFile = true;
                    }
                }

                if (doNotUploadOrDownloadFile) {
                    syncContext.workspaceFilesToIgnore.push(wfs);
                    syncContext.bucketFilesToIgnore.push(bfs);

                    syncContext.workspaceFilesToUpload.remove(wf => wf.name === wfs.name);
                    syncContext.bucketFilesToDownload.remove(bf => bf.name === bfs.name);
                }
            });

            if (matchingFilesForDifferentReasons.length > 0) {
                this.outputChannel.appendLine(`\n⛔️ Files (${matchingFilesForDifferentReasons.length}) that are marked for both upload and download but for different reasons. This should not happen. Files will not be synced.`);
                matchingFilesForDifferentReasons.forEach(fs => this.outputChannel.appendLine(`  - ${fs.name}: ${fs.direction === FileSyncDirection.download ? 'download' : 'upload'}, ${SimpleS3SyncVSCodeExtension.getReasonText(fs.reason)}`));
            }

            if (matchingFilesWithIssues.length > 0) {
                this.outputChannel.appendLine(`\n⛔️ Files (${matchingFilesWithIssues.length}) that are marked for both upload and download but have issues with either sync reason or modified times. This should not happen. Files will not be synced.`);
                matchingFilesWithIssues.forEach(fs => this.outputChannel.appendLine(`  - ${fs.name}: ${fs.direction === FileSyncDirection.download ? 'download' : 'upload'}, ${SimpleS3SyncVSCodeExtension.getReasonText(fs.reason)}, ${new Date(fs.modifiedSeconds * 1000).toLocaleString()}`));
            }

            if (syncContext.settings.synced.length === 0 && matchingWorkspaceFiles.length > 0 && matchingBucketFiles.length > 0) {
                this.outputChannel.appendLine(`\n🟡 No sync information exists and there are files in both the local workspace and S3 bucket. An initial upload-only or download-only sync may be required. See other Simple S3 Sync (S5) commands to perform these.`);
            }
        }

        // actual files to sync

        if (syncContext.workspaceFilesToUpload.length > 0) {
            this.outputChannel.appendLine(`\n🔼 Local workspace files (${syncContext.workspaceFilesToUpload.length}) to upload.`);
            syncContext.workspaceFilesToUpload.forEach(fs => this.outputChannel.appendLine(`  - ${fs.name}: ${SimpleS3SyncVSCodeExtension.getReasonText(fs.reason)}`));
        }

        if (syncContext.bucketFilesToDownload.length > 0) {
            this.outputChannel.appendLine(`\n🔽 S3 bucket files (${syncContext.bucketFilesToDownload.length}) to download.`);
            syncContext.bucketFilesToDownload.forEach(fs => this.outputChannel.appendLine(`  - ${fs.name}: ${SimpleS3SyncVSCodeExtension.getReasonText(fs.reason)}`));
        }

        // output

        const syncVerb = direction === FileSyncDirection.both ? "Sync" : (direction === FileSyncDirection.download ? "Download" : "Upload");

        let todoCount =
            syncContext.workspaceFilesToDelete.length
            + syncContext.bucketFilesToDelete.length
            + syncContext.workspaceFilesToUpload.length
            + syncContext.bucketFilesToDownload.length;

        if (direction === FileSyncDirection.both) { // full sync
            todoCount += syncContext.syncedInfoToRemove.length;
        }

        if (todoCount === 0) {
            this.outputChannel.appendLine(`\n👍🏼 Nothing to ${syncVerb.toLocaleLowerCase()}.`);
            return;
        }

        return syncContext;
    }

    private downloadBucketFiles(filesToSync: FileToSyncInfo[], timestamp: string, aws: IAws): Promise<FileToSyncInfo>[] {
        return filesToSync.map(fileToSync => {
            return new Promise<FileToSyncInfo>(async (resolve, reject) => {
                this.outputChannel.appendLine(`  - Downloading S3 bucket file: ${fileToSync.name}`);
                const targetFile = this.fileSystem.resolvePaths(this.workspaceFolder!.uri.path, fileToSync.name);

                const fileDoesNotExistOrWasMovedToTrash = await this.fileSystem.exists(targetFile).then(async fileExists => {
                    if (!fileExists) { return true; }

                    const localFileModifiedTime = (await this.fileSystem.getStats(targetFile)).mtimeMs;
                    const localFileTimestamp = new Date(localFileModifiedTime).format("yyyy-MM-dd_HH-mm-ss");

                    return await this.fileSystem.moveFile(targetFile, this.fileSystem.resolvePaths(this._workspaceTrashFolder!, timestamp, `${fileToSync.name}.${localFileTimestamp}${this.fileSystem.extension(fileToSync.name)}`), true).then(result => {
                        return result;
                    }, err => {
                        this.outputChannel.appendLine(`  - 🔴 Error moving existing local workspace file to trash. The S3 bucket file will not be downloaded and its synced information will not be saved. File: ${fileToSync.name}, message: ${err.message}`);
                        return false;
                    });
                });
                if (!fileDoesNotExistOrWasMovedToTrash) { reject(); return; }

                await aws.s3GetObject(fileToSync.name, targetFile).then(async getObjectResult => {
                    await this.fileSystem.getStats(targetFile).then(stats => {
                        fileToSync.localTime = Math.trunc(stats.mtime.getTime() / 1000);
                        resolve(fileToSync);
                    }, err => {
                        this.outputChannel.appendLine(`  - 🔴 Error getting modified time for downloaded file. Though the file has been downloaded, its synced information will not be saved. File: ${fileToSync.name}, message: ${err.message}`);
                        reject();
                    });
                });
            });
        });
    }

    private static getReasonText(reason: FileSyncReason): string {
        switch (reason) {
            case FileSyncReason.doesNotExist: return "does not exist";
            case FileSyncReason.hasNotBeenSynced: return "has not been synced";
            case FileSyncReason.newer: return "is newer";
            case FileSyncReason.uploading: return "uploading";
            case FileSyncReason.downloading: return "downloading";
            default: return "";
        }
    }

    private async performSync(direction: FileSyncDirection = FileSyncDirection.both): Promise<void> {
        const syncContext = await this.determineSyncContext(direction);
        if (!syncContext) { return; }

        const syncVerb = direction === FileSyncDirection.both ? "Sync" : (direction === FileSyncDirection.download ? "Download" : "Upload");

        this.outputChannel.appendLine("\nAnswer Yes or No to bottom-right message. (If message disappears before responding, run command again. To prevent this, click the message to keep it from disappearing while you review this output.)");
        const answer = await vscode.window.showInformationMessage("Review the Simple S3 Sync (S5) channel output. Do you want to perform a sync?", "Yes", "No").then((answer) => answer === "Yes");
        if (!answer) {
            this.outputChannel.appendLine(`\n😕 ${syncVerb} cancelled.`);
            return;
        }

        const syncTimestamp = new Date().format("yyyy-MM-dd_HH-mm-ss");

        this.outputChannel.appendLine(`\n🔄 ${syncVerb}ing...`);

        // delete, upload and download

        const deleteResults: string[] = [];
        if (syncContext.workspaceFilesToDelete.length > 0) {
            this.outputChannel.appendLine(`\n⏳ Deleting local workspace files, please wait...`);
            deleteResults.push(...await this.deleteWorkspaceFiles(syncContext.workspaceFilesToDelete, syncTimestamp));
        }
        deleteResults.push(...await this.promiseProgressWindow("S5", "Deleting remote S3 files", "Deleting remote S3 files", this.deleteBucketFiles(syncContext.bucketFilesToDelete, syncTimestamp, syncContext.aws)));

        const upAndDownResults: FileToSyncInfo[] = [];
        upAndDownResults.push(...await this.promiseProgressWindow("S5", "Uploading local files to S3", "Uploading local files to S3", this.uploadWorkspaceFiles(syncContext.workspaceFilesToUpload, syncTimestamp, syncContext.aws)));
        upAndDownResults.push(...await this.promiseProgressWindow("S5", "Downloading remote files from S3", "Downloading remote files from S3", this.downloadBucketFiles(syncContext.bucketFilesToDownload, syncTimestamp, syncContext.aws)));

        // sync information

        let writeWorkspaceSettingsFile = false;

        if (direction === FileSyncDirection.both) { // full sync
            const syncedInfoNamesToRemove = deleteResults.concat(syncContext.syncedInfoToRemove.map(s => s.name));
            if (syncedInfoNamesToRemove.length > 0) {
                writeWorkspaceSettingsFile = true;
                this.outputChannel.appendLine(`\nRemoving sync information (${syncedInfoNamesToRemove.length})...`);
                syncedInfoNamesToRemove.forEach(name => {
                    this.outputChannel.appendLine(`  - ${name}`);
                    syncContext.settings.synced.remove(s => s.name === name);
                });
            }

            if (upAndDownResults.length > 0) {
                writeWorkspaceSettingsFile = true;
                this.outputChannel.appendLine(`\nAdding sync information (${upAndDownResults.length})...`);
                upAndDownResults.forEach(si => {
                    this.outputChannel.appendLine(`  - ${si.name}`);
                    syncContext.settings.synced.replace(x => x.name === si.name, si.toSyncedFileInfo());
                });
            }
        }
        else { // download or upload
            writeWorkspaceSettingsFile = true;
            syncContext.settings.synced = upAndDownResults.map(si => si.toSyncedFileInfo());
        }

        if (writeWorkspaceSettingsFile) {
            await this.fileSystem.writeFile(this._workspaceSettingsFile!, syncContext.settings, true).then(() => {
            }, (err: any) => {
                this.outputChannel.appendLine(`\n🔴 Error writing Simple S3 Sync workspace settings file: ${err.message}`);
            });
        }

        this.outputChannel.appendLine(`\n✅ Finished ${syncVerb.toLocaleLowerCase()}ing.`);
    }

    private async loadWorkspaceSettingsFile(): Promise<SimpleS3SyncSettings | undefined> {
        if (!(await this.fileSystem.exists(this._workspaceSettingsFile!))) {
            const answer = await vscode.window.showInformationMessage("Simple S3 Sync workspace settings file does not exist. Would you like to create it?", { modal: true }, "Yes", "No");
            if (answer === "Yes") { await this.createWorkspaceSettingsFile(); }
            return;
        }

        try {
            return await SimpleS3SyncSettings.load(this._workspaceSettingsFile!);
        } catch (err: any) {
            await vscode.workspace.openTextDocument(this._workspaceSettingsFile!).then(doc => vscode.window.showTextDocument(doc));
            await vscode.window.showWarningMessage(`Problem loading Simple S3 Sync workspace settings file: ${err.message}`, { modal: true });
            return;
        }
    }

    private async prepareForSync(): Promise<SyncContext | undefined> {
        // AWS CLI

        if (!(await this.awsCliExists())) {
            await vscode.window.showWarningMessage("AWS CLI not found. Please install AWS CLI.", { modal: true, detail: "The Simple S3 Sync extension requires it.\n\nhttps://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" });
            return;
        }

        // Simple S3 Sync file

        const settings = await this.loadWorkspaceSettingsFile();
        if (!settings) { return; }

        this.outputChannel.show();
        this.outputChannel.appendLine('\n' + settings.toSettingsInfoString());

        // AWS

        const aws: IAws = new Aws(settings.bucket!, settings.folder, settings.profile);

        this.outputChannel.append("\nChecking bucket existence and access permissions... ");
        if (!(await aws.s3HeadBucket())) {
            this.outputChannel.appendLine("🚫 Bucket may not exist or you may not have permission to access it.");
            return;
        }

        if (!(await aws.s3ObjectExists(SimpleS3SyncSettings.trashFile)) && !(await aws.s3WriteObject(SimpleS3SyncSettings.trashFile, SimpleS3SyncSettings.trashFileData))) {
            this.outputChannel.appendLine("🚫 Bucket exists but you may not have permission to read/write.");
            return;
        }

        this.outputChannel.appendLine("✅ Succeeded.");

        return new SyncContext(settings, aws);
    }

    private async promiseProgressWindow<T>(windowTitle: string, progressPrefix: string, channelWaitMessage: string, promises: Promise<T>[]): Promise<T[]> {
        let current = 0;
        const results: T[] = [];
        const total = promises.length;

        if (total === 0) { return results; }

        promises.map(p => p.then(pr => results.push(pr)).finally(() => current++));

        this.outputChannel.appendLine(`\n⌛️ ${channelWaitMessage}, please wait...`);

        vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: windowTitle,
        }, async p => {
            p.report({ increment: 0, message: "" });
            while (current < total) {
                p.report({ increment: current / total * 100, message: `${progressPrefix} ${current} of ${total}` });
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            p.report({ increment: 100, message: `${progressPrefix} ${current} of ${total}` });
        });

        await Promise.allSettled(promises);
        return results;
    }

    private uploadWorkspaceFiles(filesToSync: FileToSyncInfo[], timestamp: string, aws: IAws): Promise<FileToSyncInfo>[] {
        return filesToSync.map(fileToSync => {
            return new Promise<FileToSyncInfo>(async (resolve, reject) => {
                this.outputChannel.appendLine(`  - Uploading workspace file: ${fileToSync.name}`);

                const fileDoesNotExistOrWasMovedToTrash = await aws.s3ObjectExists(fileToSync.name).then(async objectExists => {
                    if (!objectExists) { return true; }

                    const s3FileTimestamp = new Date(fileToSync.modifiedSeconds * 1000).format("yyyy-MM-dd_HH-mm-ss");
                    return await aws.s3MoveObject(fileToSync.name, `${SimpleS3SyncSettings.trashFolder}/${timestamp}/${fileToSync.name}.${s3FileTimestamp}${this.fileSystem.extension(fileToSync.name)}`).then(result => {
                        return result;
                    }, err => {
                        this.outputChannel.appendLine(`  - 🔴 Error moving existing S3 bucket file to trash. The local workspace file will not be uploaded and its synced information will not be saved. File: ${fileToSync.name}, message: ${err.message}`);
                        return false;
                    });
                });
                if (!fileDoesNotExistOrWasMovedToTrash) { reject(); return; }

                await aws.s3PutObject(fileToSync.name, this.fileSystem.resolvePaths(this.workspaceFolder!.uri.path, fileToSync.name)).then(async putObjectResult => {
                    await aws.s3HeadObject(fileToSync.name).then(headObjectResult => {
                        fileToSync.remoteTime = headObjectResult.modifiedSeconds;
                        resolve(fileToSync);
                    }, err => {
                        this.outputChannel.appendLine(`  - 🔴 Error getting modified time for uploaded file. Though the file has been uploaded, its synced information will not be saved. File: ${fileToSync.name}, message: ${err.message}`);
                        reject();
                    });
                });
            });
        });
    }
}
