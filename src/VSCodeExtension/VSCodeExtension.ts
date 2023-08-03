import * as vscode from "vscode";
import { VSCodeCommand } from "./VSCodeCommand";
import { FileInfo } from "../Utils/FileInfo";
import { FileSystem, IFileSystem } from "../Utils/FileSystem";

export abstract class VSCodeExtension {
    protected context: vscode.ExtensionContext;
    protected fileSystem: IFileSystem = new FileSystem();

    protected get isWorkspaceOpen(): boolean { return !!vscode.workspace.workspaceFolders; }
    protected outputChannel: vscode.OutputChannel;
    protected workspaceFolder: vscode.WorkspaceFolder | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel(context.extension.packageJSON.displayName);
    }

    protected addCommands(...commands: VSCodeCommand[]) {
        commands.forEach(c => {
            this.context.subscriptions.push(vscode.commands.registerCommand(c.name, c.command));
        });
    }

    protected isWorkspaceReady(): boolean {
        if (!this.isWorkspaceOpen) {
            vscode.window.showErrorMessage("A workspace must be open to use Simple S3 Sync.");
            return false;
        }

        this.workspaceFolder = vscode.workspace.workspaceFolders![0];
        return true;
    }


    protected workspacePath(...relativePath: string[]): string {
        return vscode.Uri.joinPath(this.workspaceFolder!.uri, ...relativePath).path;
    }

    protected async workspaceFiles(include?: string, exclude?: string): Promise<FileInfo[]> {
        const files = await this.fileSystem.getFileInfos(this.workspaceFolder!.uri.path);
        return include || exclude ? FileInfo.match(files, include, exclude) : files;
    }
}
