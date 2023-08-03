import { fail } from "assert";
import { SimpleS3SyncSettings } from "../VSCodeExtension/SimpleS3SyncSettings";

describe("SimpleS3SyncSettings", () => {
    test("noSyncInfo: yes", async () => {
        await SimpleS3SyncSettings.load("./src/test/settings-noSyncInfo.json").then(settings => {
            expect(settings).toBeDefined();
            expect(settings.synced.length).toBe(0);
        }, err => {
            expect(err).toBeUndefined();
            fail("Should have succeeded");
        });
    });

    test("noSyncInfo: no", async () => {
        await SimpleS3SyncSettings.load("./src/test/settings-hasSyncInfo.json").then(settings => {
            expect(settings).toBeDefined();
            expect(settings.synced.length).toBe(1);
        }, err => {
            expect(err).toBeUndefined();
            fail("Should have succeeded");
        });
    });
});