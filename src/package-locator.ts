import { access, readFile } from "fs/promises";
import { OutputChannel, workspace } from "vscode";
import semver from "semver";
import { dirname, join } from "path";

interface PackageLock {
	dependencies: Record<string, {
		version: string;
	}>;
}

export class PackageLocator {
	private readonly _output: OutputChannel;
	private readonly _name: string;
	private readonly _range: string;
	private readonly _entryPath: string;

	public constructor(output: OutputChannel, name: string, range: string, entryPath: string) {
		this._output = output;
		this._name = name;
		this._range = range;
		this._entryPath = entryPath;
	}

	public async locate(): Promise<PackageLocator.Location | null> {
		const packageLocks = await workspace.findFiles("**/package-lock.json", "**/node_modules/**", 256);

		let location: PackageLocator.Location | null = null;

		await Promise.all(packageLocks.map(async uri => {
			const packageLock = uri.fsPath;
			const context = dirname(packageLock);

			const info = JSON.parse(await readFile(packageLock, "utf-8")) as PackageLock;
			const version = info.dependencies?.[this._name]?.version;
			if (version) {
				const entryModule = join(context, "node_modules", this._name, this._entryPath);
				if (await access(entryModule).then(() => true, () => false)
					&& semver.satisfies(version, this._range)
					&& (location === null || semver.gt(version, location.version))
				) {
					location = {
						context,
						entryModule,
						version,
					};
				} else {
					this._output.appendLine(`Ignoring package ${this._name} (${version}) in ${context} because it is not installed.`);
				}
			}
		}));

		return location;
	}
}

export declare namespace PackageLocator {
	export interface Location {
		context: string;
		entryModule: string;
		version: string;
	}
}
