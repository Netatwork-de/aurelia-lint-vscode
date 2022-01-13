import { join } from "path";
import { ExtensionContext, workspace } from "vscode";
import { LanguageClient, TransportKind } from "vscode-languageclient/node";

export function activate(context: ExtensionContext): void {
	// TODO: Use module from workspace or bundled version.
	// TODO: Use context.asAbsolutePath
	const serverModule = join(__dirname, "../../aurelia-lint/dist/language-server/index.js");

	const client = new LanguageClient(
		"Aurelia Lint Language Server",
		{
			module: serverModule,
			transport: TransportKind.ipc,
			options: {
				// execArgv: ["--nolazy", "--inspect=6009"],
			},
		},
		{
			documentSelector: [
				{
					scheme: "file",
					language: "html",
				},
			],
			synchronize: {
				fileEvents: workspace.createFileSystemWatcher("**/aurelia-lint.json5"),
			},
		},
	);

	// client.traceOutputChannel.show();

	context.subscriptions.push(client.start());
}

export function deactivate(): void {}
