import * as vscode from "vscode";
import { SimpleS3SyncVSCodeExtension } from "./VSCodeExtension/SimpleS3SyncVSCodeExtension";

export function activate(context: vscode.ExtensionContext) {
    SimpleS3SyncVSCodeExtension.use(context);
}

export function deactivate() { }
