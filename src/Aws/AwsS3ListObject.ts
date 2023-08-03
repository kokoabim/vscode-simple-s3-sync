import { Minimatch } from 'minimatch';

export class AwsS3ListObject {
    modifiedSeconds: number;
    name: string;
    size: number;

    /* eslint-disable @typescript-eslint/naming-convention */
    constructor(
        public readonly Key: string,
        public readonly LastModified: string,
        public readonly ETag: string,
        public readonly Size: number,
        public readonly StorageClass: string,
        public readonly Owner: AwsS3ListObjectOwner) {
        this.modifiedSeconds = Math.trunc(new Date(this.LastModified).getTime() / 1000);
        this.name = this.Key;
        this.size = this.Size;
    }
    /* eslint-enable @typescript-eslint/naming-convention */

    static match(objects: AwsS3ListObject[], include?: string, exclude?: string, nocase: boolean = true): AwsS3ListObject[] {
        const excludeMatch = exclude ? new Minimatch(exclude, { dot: true, nocase: nocase }) : undefined;
        const includeMatch = include ? new Minimatch(include, { dot: true, nocase: nocase }) : undefined;

        return objects.filter(x => {
            if (excludeMatch && excludeMatch.match(x.name)) { return false; }
            if (includeMatch && !includeMatch.match(x.name)) { return false; }
            return true;
        });
    }
}

export class AwsS3ListObjectOwner {
    /* eslint-disable @typescript-eslint/naming-convention */
    constructor(
        public readonly DisplayName: string,
        public readonly ID: string) { }
    /* eslint-enable @typescript-eslint/naming-convention */
}