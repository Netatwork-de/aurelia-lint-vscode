import { readFile } from "fs/promises";
import { workspace } from "vscode";
import semver from "semver";
import { dirname } from "path";

interface PackageLock {
	dependencies: Record<string, {
		version: string;
	}>;
}

export class PackageLocator {
	private readonly _name: string;
	private readonly _range: string;

	public constructor(name: string, range: string) {
		this._name = name;
		this._range = range;
	}

	public async locate(): Promise<PackageLocator.Location | null> {
		const packageLocks = await workspace.findFiles("**/package-lock.json", "**/node_modules/**", 256);

		let location: PackageLocator.Location | null = null;

		for (const uri of packageLocks) {
			const filename = uri.fsPath;

			const info = JSON.parse(await readFile(filename, "utf-8")) as PackageLock;
			const version = info.dependencies?.[this._name]?.version;
			if (version) {
				if (semver.satisfies(version, this._range)) {
					if (location === null || semver.gt(version, location.version)) {
						location = {
							dirname: dirname(filename),
							version,
						};
					}
				}
			}
		}

		return location;
	}
}

export declare namespace PackageLocator {
	export interface Location {
		dirname: string;
		version: string;
	}
}
