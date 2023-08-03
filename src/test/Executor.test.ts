import { fail } from "assert";
import { Executor } from "../Utils/Executor";

describe("Executor", () => {
    test("execute: success", async () => {
        const target = new Executor();
        return await target.execute('echo "Hello World"').then(result => {
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('Hello World\n');
            expect(result.stderr).toBe("");
        }, err => {
            expect(err).toBeUndefined();
            fail("Should have succeeded");
        });
    });

    test("execute: fail on bad command", async () => {
        const target = new Executor();
        return await target.execute("this-should-fail").then(result => {
            expect(result).toBeUndefined();
            fail("Should have failed");
        }, err => {
            expect(err.stderr).toBe('/bin/sh: this-should-fail: command not found\n');
        });
    });

    test("executeSync: success", () => {
        const target = new Executor();
        const result = target.executeSync('echo "Hello World"');
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('Hello World\n');
    });

    test("executeSync: fail on bad command", () => {
        const target = new Executor();
        const result = target.executeSync("this-should-fail");
        expect(result.exitCode).toBe(127);
        expect(result.stderr).toBe('/bin/sh: this-should-fail: command not found\n');
    });
});