import { ExecException, exec, execSync } from "child_process";
import { ExecuteResult } from "./ExecuteResult";

export interface IExecutor {
    execute(command: string, stdoutCallback?: (data: any) => void, stderrCallback?: (data: any) => void): Promise<ExecuteResult>;
    executeSync(command: string): ExecuteResult;
}

export class Executor implements IExecutor {
    async execute(command: string, stdoutCallback?: (data: any) => void, stderrCallback?: (data: any) => void): Promise<ExecuteResult> {
        return new Promise<ExecuteResult>((resolve, reject) => {
            const child = exec(command, (error, stdout, stderr) => {
                const result = new ExecuteResult(child.exitCode ?? -1, stdout, stderr);
                if (!error) {
                    resolve(result);
                }
                else {
                    result.error = error;
                    reject(result);
                }
            });

            if (stdoutCallback) { child.stdout?.on("data", (data) => { stdoutCallback(data); }); }
            if (stderrCallback) { child.stderr?.on("data", (data) => { stderrCallback(data); }); }
        });
    }

    executeSync(command: string): ExecuteResult {
        try {
            const child = execSync(command, { encoding: "utf8" });
            return new ExecuteResult(0, child, undefined);
        }
        catch (error: any) {
            return new ExecuteResult(error.status, error.stdout, error.stderr);
        }
    }
}
