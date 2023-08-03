import { ExecException } from "child_process";

export class ExecuteResult {
    error: ExecException | undefined;

    constructor(
        public readonly exitCode: number,
        public readonly stdout: string | undefined,
        public readonly stderr: string | undefined) { }
}
