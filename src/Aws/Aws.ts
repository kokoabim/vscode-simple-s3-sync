import "../Extensions/RegExp.extensions";
import { ExecuteResult } from "../Utils/ExecuteResult";
import { Executor } from "../Utils/Executor";
import { FileSystem } from "../Utils/FileSystem";
import { AwsS3HeadObject } from "./AwsS3HeadObject";
import { AwsS3ListObject, AwsS3ListObjectOwner } from "./AwsS3ListObject";

export interface IAws {
    s3CopyObject(sourceKey: string, destinationKey: string): Promise<boolean>;
    s3DeleteObject(key: string): Promise<boolean>;
    s3GetObject(key: string, targetFile: string): Promise<boolean>;
    s3GetObjectMetadata(key: string): Promise<any>;
    s3HeadBucket(): Promise<boolean>;
    s3HeadObject(key: string): Promise<AwsS3HeadObject>;
    s3ListObjects(): Promise<AwsS3ListObject[]>;
    s3MoveObject(sourceKey: string, destinationKey: string): Promise<boolean>;
    s3ObjectExists(key: string): Promise<boolean>;
    s3PutObject(key: string, sourceFile: string, contentType?: string): Promise<boolean>;
    s3WriteObject(key: string, content: string): Promise<boolean>;
}

export class Aws implements IAws {
    private static readonly _executor: Executor = new Executor();

    private _fileSystem: FileSystem = new FileSystem();

    constructor(
        public readonly bucket: string,
        public readonly folder: string | null = null,
        public readonly profile: string = "default") {

        if (!this.profile) { throw new Error("Profile is required."); }
        if (!this.bucket) { throw new Error("Bucket is required."); }

        if (this.folder) {
            while (this.folder.startsWith('/')) { this.folder = this.folder.substring(1); }
            while (this.folder.endsWith('/')) { this.folder = this.folder.substring(0, this.folder.length - 1); }
        }
    }

    private baseKey(key: string): string {
        return this.folder && key.startsWith(`${this.folder}/`) ? key.substring(this.folder.length + 1) : key;
    }

    private s3Key(key: string, withBucket: boolean = false): string {
        return `${withBucket ? `${this.bucket}/` : ''}${this.folder ? `${this.folder}/` : ''}${key}`;
    }

    static async cliExists(): Promise<boolean> {
        return await Aws._executor.execute("aws --version").then(result => { return true; }, err => { return false; });
    }

    async s3CopyObject(sourceKey: string, destinationKey: string): Promise<boolean> {
        return await Aws._executor.execute(`aws s3api copy-object --copy-source '${this.s3Key(sourceKey, true)}' --bucket ${this.bucket} --key '${this.s3Key(destinationKey)}' --profile ${this.profile}`).then(result => {
            if (result.exitCode !== 0) { throw new Error(result.stderr); }
            return true;
        }, err => {
            throw err;
        });
    }

    async s3DeleteObject(key: string): Promise<boolean> {
        return await Aws._executor.execute(`aws s3api delete-object --bucket ${this.bucket} --key '${this.s3Key(key)}' --profile ${this.profile}`).then(result => {
            if (result.exitCode !== 0) { throw new Error(result.stderr); }
            return true;
        }, err => {
            throw err;
        });
    }

    async s3GetObject(key: string, targetFile: string): Promise<boolean> {
        await this._fileSystem.makeDir(targetFile, true);
        return await Aws._executor.execute(`aws s3api get-object --bucket ${this.bucket} --key '${this.s3Key(key)}' '${targetFile}' --profile ${this.profile}`).then(result => {
            if (result.exitCode !== 0) { throw new Error(result.stderr); }
            return true;
        }, err => {
            throw err;
        });
    }

    async s3GetObjectMetadata(key: string): Promise<any> {
        return await this.s3HeadObject(key).then(result => {
            return result.Metadata;
        }, err => {
            throw err;
        });
    }

    async s3HeadBucket(): Promise<boolean> {
        return await Aws._executor.execute(`aws s3api head-bucket --bucket ${this.bucket} --profile ${this.profile}`).then(result => {
            if (result.exitCode !== 0) { throw new Error(result.stderr); }
            return true;
        }, err => {
            return false;
        });
    }

    async s3HeadObject(key: string): Promise<AwsS3HeadObject> {
        return await Aws._executor.execute(`aws s3api head-object --bucket ${this.bucket} --key '${this.s3Key(key)}' --profile ${this.profile}`).then(result => {
            if (result.exitCode !== 0) { throw new Error(result.stderr); }
            return new AwsS3HeadObject(JSON.parse(result.stdout!));
        }, err => {
            throw err;
        });
    }

    async s3ListObjects(): Promise<AwsS3ListObject[]> {
        return await Aws._executor.execute(`aws s3api list-objects --bucket ${this.bucket} ${this.folder ? `--prefix '${this.folder}/'` : ''} --profile ${this.profile}`).then(result => {
            if (result.exitCode !== 0) { throw new Error(result.stderr); }

            return JSON.parse(result.stdout!).Contents.map((item: any) => {
                return new AwsS3ListObject(
                    this.baseKey(item.Key),
                    item.LastModified,
                    item.ETag,
                    item.Size,
                    item.StorageClass,
                    new AwsS3ListObjectOwner(
                        item.Owner.DisplayName,
                        item.Owner.ID));
            });
        }, err => {
            throw err;
        });
    }

    async s3MoveObject(sourceKey: string, destinationKey: string): Promise<boolean> {
        return await this.s3CopyObject(sourceKey, destinationKey).then(async copyResult => {
            if (copyResult) {
                return await this.s3DeleteObject(sourceKey).then(deleteResult => {
                    if (!deleteResult) { throw new Error("Failed to delete object."); }
                    return true;
                }, err => {
                    throw err;
                });
            }

            throw new Error("Failed to copy object.");
        }, err => {
            throw err;
        });
    }

    async s3ObjectExists(key: string): Promise<boolean> {
        return await Aws._executor.execute(`aws s3api head-object --bucket ${this.bucket} --key '${this.s3Key(key)}' --profile ${this.profile}`).then(result => {
            return result.exitCode === 0;
        }, (err: ExecuteResult) => {
            if (err.stderr?.includes("(404)")) { return false; }
            throw err;
        });
    }

    async s3PutObject(key: string, sourceFile: string, contentType: string | undefined = undefined): Promise<boolean> {
        if (!(await this._fileSystem.exists(sourceFile))) { throw new Error(`File not found: ${sourceFile}`); }

        return await Aws._executor.execute(`aws s3api put-object --body '${sourceFile}' --bucket ${this.bucket} --key '${this.s3Key(key)}' --profile ${this.profile} ${contentType ? `--content-type '${contentType}'` : ''}`).then(result => {
            if (result.exitCode !== 0) { throw new Error(result.stderr); }
            return true;
        }, err => {
            throw err;
        });
    }

    async s3WriteObject(key: string, data: string): Promise<boolean> {
        const tempFile = await this._fileSystem.writeTempFile(data);

        return await this.s3PutObject(key, tempFile).finally(async () => {
            await this._fileSystem.deleteFile(tempFile);
        });
    }
}
