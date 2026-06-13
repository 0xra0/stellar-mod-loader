import * as log from "electron-log/main";
import * as which from "which";

const fs = require("fs-extra") as typeof import("fs-extra");

export namespace BinUtils {

    export function resolve7zBinaryPath(): string {
        // Look for 7-Zip installed on system
        const _7zBinaries = [
            "7zzs",
            "7zz",
            "7z",
            "7z.exe"
        ];

        const _7zBinaryLocations = [
            "C:\\Program Files\\7-Zip\\7z.exe",
            "C:\\Program Files (x86)\\7-Zip\\7z.exe"
        ];

        let _7zBinaryPath = _7zBinaryLocations.find(_7zPath => fs.existsSync(_7zPath));
        
        if (!_7zBinaryPath) {
            _7zBinaryPath = _7zBinaries.reduce((_7zBinaryPath, _7zBinaryPathGuess) => {
                try {
                    const which7zBinaryPath = which.sync(_7zBinaryPathGuess);
                    _7zBinaryPath ||= (Array.isArray(which7zBinaryPath)
                        ? which7zBinaryPath[0]
                        : which7zBinaryPath
                    ) ?? undefined;
                } catch (_err) {}

                return _7zBinaryPath;
            }, _7zBinaryPath);
        }

        if (_7zBinaryPath) {
            log.debug("Found 7-Zip binary: ", _7zBinaryPath);
        } else {
            throw new Error("7-Zip is not installed or could not be found on PATH.");
        }

        return _7zBinaryPath;
    }

    export function resolveUnrarBinaryPath(): string | undefined {
        const unrarLocations = [
            "C:\\Program Files\\WinRAR\\UnRAR.exe",
            "C:\\Program Files (x86)\\WinRAR\\UnRAR.exe"
        ];

        let unrarBinaryPath: string | undefined = unrarLocations.find(p => fs.existsSync(p));

        if (!unrarBinaryPath) {
            try {
                const result = which.sync("unrar");
                unrarBinaryPath = (Array.isArray(result) ? result[0] : result) ?? undefined;
            } catch {}
        }

        if (unrarBinaryPath) {
            log.debug("Found unrar binary: ", unrarBinaryPath);
        }

        return unrarBinaryPath;
    }

    export function resolveBsdtarBinaryPath(): string | undefined {
        try {
            const result = which.sync("bsdtar");
            const bsdtarPath = (Array.isArray(result) ? result[0] : result) ?? undefined;
            if (bsdtarPath) {
                log.debug("Found bsdtar binary: ", bsdtarPath);
            }
            return bsdtarPath;
        } catch {
            return undefined;
        }
    }
}