export class AwsS3HeadObject {
    /* eslint-disable @typescript-eslint/naming-convention */
    AcceptRanges!: string;
    LastModified!: string;
    ContentLength!: number;
    ETag!: string;
    ContentType!: string;
    ServerSideEncryption!: string;
    Metadata: any;
    /* eslint-enable @typescript-eslint/naming-convention */

    constructor(init: Partial<AwsS3HeadObject>) {
        Object.assign(this, init);
    }

    get modifiedSeconds(): number {
        return Math.trunc(new Date(this.LastModified).getTime() / 1000);
    }
}