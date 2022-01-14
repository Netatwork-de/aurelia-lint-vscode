import createLimit from "p-limit";
import resolveModule from "resolve";
import { OutputChannel, window, workspace } from "vscode";
import { LanguageClient, TransportKind } from "vscode-languageclient/node";
import { PackageLocator } from "./package-locator";
import { Settings } from "./settings";
import { inspect } from "util";
import { isAbsolute } from "path";

interface State {
	readonly client: LanguageClient;
	readonly serverVersion: string;
}

const startLimit = createLimit(1);

let output: OutputChannel;
let state: State | null = null;

export async function activate() {
	output = window.createOutputChannel("Aurelia Lint");

	async function showError(message: string, error: unknown) {
		output.appendLine(inspect(error, false, 99, false));
		if (await window.showErrorMessage(message, "Show Output")) {
			output.show();
		}
	}

	async function start() {
		const settings = workspace.getConfiguration("nawAureliaLint") as Settings;
		const packageName = settings.packageName ?? "@netatwork/aurelia-lint";
		const range = "1.x";

		const serverLocation: PackageLocator.Location | null = isAbsolute(packageName)
			? { dirname: packageName, version: "1.0.0" }
			: await new PackageLocator(packageName, range).locate();

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
			output.appendLine(`Starting language server from ${serverLocation.dirname} (${serverLocation.version}).`);

			let serverModule: string;
			try {
				serverModule = await new Promise<string>((resolve, reject) => {
					resolveModule(`${packageName}/dist/language-server`, { basedir: serverLocation.dirname }, (error, filename) => {
						if (error) {
							reject(error);
						} else {
							resolve(filename!);
						}
					});
				});
			} catch (error) {
				showError("Failed to resolve aurelia lint language server module.", error);
				return;
			}

			state = {
				serverVersion: serverLocation.version,
				client: new LanguageClient(
					"Aurelia Lint Server",
					{
						module: serverModule,
						transport: TransportKind.ipc,
					},
					{
						documentSelector: [
							{
								scheme: "file",
								language: "html",
							},
						],
					},
				),
			};

			state.client.start();
		} else {
			output.appendLine(`No compatible (${range}) version of ${packageName} was found in the current workspace.`);
		}
	}

	await startLimit(start);

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
