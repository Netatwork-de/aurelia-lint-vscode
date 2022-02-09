import createLimit from "p-limit";
import { OutputChannel, window, workspace } from "vscode";
import { LanguageClient, TransportKind } from "vscode-languageclient/node";
import { PackageLocator } from "./package-locator";
import { Settings } from "./settings";
import { inspect } from "util";
import { isAbsolute, join } from "path";
import { access } from "fs/promises";

interface State {
	readonly client: LanguageClient;
	readonly serverVersion: string;
}

const startLimit = createLimit(1);

const entryPath = "dist/language-server/index.js";

let output: OutputChannel;
let state: State | null = null;

export async function activate() {
	output = window.createOutputChannel("Aurelia Lint");

	async function showError(message: string, error?: unknown) {
		if (error !== undefined) {
			output.appendLine(inspect(error, false, 99, false));
		}
		if (await window.showErrorMessage(message, "Show Output")) {
			output.show();
		}
	}

	async function start() {
		const settings = workspace.getConfiguration("nawAureliaLint") as Settings;
		const packageName = settings.packageName ?? "@netatwork/aurelia-lint";
		const range = "1.x";

		let serverLocation: PackageLocator.Location | null;

		if (isAbsolute(packageName)) {
			serverLocation = {
				context: packageName,
				entryModule: join(packageName, entryPath),
				version: "1.0.0"
			};
			if (!await access(serverLocation.entryModule).then(() => true, () => false)) {
				showError(`Language server from absolute path ${packageName} could not be loaded.`);
				return;
			}
		} else {
			serverLocation = await new PackageLocator(output, packageName, range, entryPath).locate();
		}

		if (state !== null) {
			if (serverLocation?.version === state.serverVersion) {
				output.appendLine("Language server is up to date.");
				return;
			} else {
				output.appendLine(`Stopping language server.`);
				await state.client.stop();
				state.client.outputChannel.dispose();
				state.client.traceOutputChannel.dispose();
				state = null;
			}
		}

		if (serverLocation) {
			output.appendLine(`Starting language server from ${serverLocation.context} (${serverLocation.version}).`);

			state = {
				serverVersion: serverLocation.version,
				client: new LanguageClient(
					"Aurelia Lint Server",
					{
						module: serverLocation.entryModule,
						transport: TransportKind.ipc,
					},
					{
						documentSelector: [
							{
								scheme: "file",
								language: "html",
							},
						],
						synchronize: {
							fileEvents: [
								workspace.createFileSystemWatcher("**/aurelia-lint.json5"),
								workspace.createFileSystemWatcher("**/*.{ts,js}"),
							],
						},
					},
				),
			};

			state.client.start();
		} else {
			output.appendLine(`No compatible (${range}) version of ${packageName} was found in the current workspace.`);
		}
	}

	startLimit(start);

	workspace.onDidChangeWorkspaceFolders(() => {
		if (startLimit.pendingCount === 0) {
			output.appendLine("Checking for new language server versions.");
			startLimit(start);
		}
	});
}

export async function deactivate() {
	await startLimit(() => {});
	if (state !== null) {
		await state.client.stop();
	}
	output.dispose();
}
