import { fail } from "assert";
import { Aws } from "../Aws/Aws";
import { SimpleS3SyncSettings } from "../VSCodeExtension/SimpleS3SyncSettings";

class AwsTestSettings {
    static profile = "default";
    static bucket = "";
    static folder: string | null = "s5-test";
    static fileThatExists = SimpleS3SyncSettings.trashFile;

    static ready(): boolean {
        return AwsTestSettings.bucket !== "" && AwsTestSettings.profile !== "";
    }
}

const testIt = () => AwsTestSettings.ready() ? it : it.skip;

describe("Aws()", () => {
    test("cliExists: true (await)", async () => {
        expect(await Aws.cliExists()).toBe(true);
    });

    test("cliExists: true (then)", async () => {
        Aws.cliExists().then(result => {
            expect(result).toBe(true);
        }, err => {
            expect(err).toBeUndefined();
            fail("Should have succeeded");
        });
    });

    testIt()("s3HeadBucket: success", async () => {
        const target = new Aws(AwsTestSettings.bucket, AwsTestSettings.folder, AwsTestSettings.profile);
        await target.s3HeadBucket().then(result => {
            expect(result).toBe(true);
        }, err => {
            expect(err).toBeUndefined();
            fail("Should have succeeded");
        });
    });

    test("s3HeadBucket: fail on bad profile/bucket", async () => {
        const target = new Aws("this-should-not-exist-a1b2c3d4e5f6", "this-should-not-exist-a1b2c3d4e5f6");
        await target.s3HeadBucket().then(result => {
            expect(result).toBe(false);
        }, err => {
            expect(err).toBeUndefined();
            fail("Should have succeeded");
        });
    });

    testIt()("s3HeadObject: success", async () => {
        const target = new Aws(AwsTestSettings.bucket, AwsTestSettings.folder, AwsTestSettings.profile);
        await target.s3HeadObject(AwsTestSettings.fileThatExists).then(result => {
            expect(result).toBeDefined();
        }, err => {
            expect(err).toBeUndefined();
            fail("Should have succeeded");
        });
    });

    testIt()("s3HeadObject: fail on object not found", async () => {
        const target = new Aws(AwsTestSettings.bucket, AwsTestSettings.folder, AwsTestSettings.profile);
        await target.s3HeadObject("this-should-not-exist").then(result => {
            expect(result).toBeUndefined();
            fail("Should have failed");
        }, err => {
            expect(err).toBeDefined();
        });
    });

    testIt()("listS3Objects: success", async () => {
        const target = new Aws(AwsTestSettings.bucket, AwsTestSettings.folder, AwsTestSettings.profile);
        await target.s3ListObjects().then(result => {
            expect(result).toBeDefined();
        }, err => {
            expect(err).toBeUndefined();
            fail("Should have succeeded");
        });
    });

    test("listS3Objects: fail on bad profile/bucket", async () => {
        const target = new Aws("this-should-not-exist-a1b2c3d4e5f6", "this-should-not-exist-a1b2c3d4e5f6");
        await target.s3ListObjects().then(result => {
            expect(result).toBeUndefined();
            fail("Should have failed");
        }, err => {
            expect(err).toBeDefined();
        });
    });

    testIt()("s3ObjectExists: yes", async () => {
        const target = new Aws(AwsTestSettings.bucket, AwsTestSettings.folder, AwsTestSettings.profile);
        await target.s3ObjectExists(AwsTestSettings.fileThatExists).then(result => {
            expect(result).toBe(true);
        }, err => {
            expect(err).toBeUndefined();
            fail("Should have succeeded");
        });
    });

    testIt()("s3ObjectExists: no", async () => {
        const target = new Aws(AwsTestSettings.bucket, AwsTestSettings.folder, AwsTestSettings.profile);
        await target.s3ObjectExists("this-should-not-exist").then(result => {
            expect(result).toBe(false);
        }, err => {
            expect(err).toBeUndefined();
            fail("Should have succeeded");
        });
    });

    testIt()("s3WriteObject: success", async () => {
        const target = new Aws(AwsTestSettings.bucket, AwsTestSettings.folder, AwsTestSettings.profile);
        await target.s3WriteObject(SimpleS3SyncSettings.trashFile, SimpleS3SyncSettings.trashFileData).then(result => {
            expect(result).toBe(true);
        }, err => {
            expect(err).toBeUndefined();
            fail("Should have succeeded");
        });
    });
});
