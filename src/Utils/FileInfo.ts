import { Minimatch } from "minimatch";

export class FileInfo {
    constructor(
        public readonly name: string,
        public readonly modified: number,
        public readonly size: number) { }

    get modifiedSeconds(): number {
        return Math.trunc(this.modified / 1000);
    }

    static match(fileInfos: FileInfo[], include?: string, exclude?: string, nocase: boolean = true): FileInfo[] {
        const excludeMatch = exclude ? new Minimatch(exclude, { dot: true, nocase: nocase }) : undefined;
        const includeMatch = include ? new Minimatch(include, { dot: true, nocase: nocase }) : undefined;

        return fileInfos.filter(x => {
            if (!x.name) { return false; }
            if (excludeMatch && excludeMatch.match(x.name)) { return false; }
            if (includeMatch && !includeMatch.match(x.name)) { return false; }
            return true;
        });
    }
}