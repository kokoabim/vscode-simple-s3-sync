import { fail } from "assert";
import { FileSystem } from "../Utils/FileSystem";

describe("FileSystem", () => {
    test("getFileInfos: success", async () => {
        const target = new FileSystem();
        await target.getFileInfos("./src").then(result => {
            expect(result.length).toBeGreaterThan(20);
        }, err => {
            expect(err).toBeUndefined();
            fail("Should have succeeded");
        });
    });
});