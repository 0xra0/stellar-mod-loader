// @ts-check
const { execSync } = require("child_process");
const appPackage = require("../package.json");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const os = require("os");

const BUILD_DIR = "./dist";
const PKG_DIR = "./out";
const ICON_FILE = "./public/favicon.ico";
const BUILD_ALL = process.argv.includes("--all");
const RELEASE_MODE = process.argv.includes("--release");

/**
 * Bundles a thin libasound.so.2 wrapper into a Linux package directory.
 *
 * Electron is built on Ubuntu where libasound.so.2 exports ALSA_0.9 / ALSA_0.9.0rc4
 * version symbols (VERDEF). Arch Linux's libasound.so.2 omits those VERDEF entries,
 * so glibc's dynamic linker prints repeated "no version information available" warnings
 * every time Electron (or one of its subprocesses) starts.
 *
 * The fix: place a tiny libasound.so.2 wrapper in the package directory (which is
 * already on the binary's RPATH via $ORIGIN). The wrapper has VERDEF entries for
 * ALSA_0.9 and ALSA_0.9.0rc4, silencing ld.so's check. The real ALSA implementation
 * comes from libasound.so.2.real (a copy of the system library with its soname patched)
 * which the wrapper lists as DT_NEEDED.
 *
 * Requires: gcc and patchelf on PATH. Skips gracefully if either is missing.
 */
function bundleAlsaWrapper(pkgDir) {
    const systemLib = "/usr/lib/libasound.so.2";
    if (!fs.existsSync(systemLib)) return;

    for (const tool of ["gcc", "patchelf"]) {
        try { execSync(`which ${tool}`, { stdio: "pipe" }); }
        catch { console.log(`  Skipping ALSA wrapper: '${tool}' not found on PATH`); return; }
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sml-alsa-"));
    try {
        const realLib = path.join(pkgDir, "libasound.so.2.real");
        const wrapLib = path.join(pkgDir, "libasound.so.2");

        // Copy and rename soname so wrapper can reference it as a distinct DT_NEEDED
        fs.copyFileSync(systemLib, realLib);
        execSync(`patchelf --set-soname libasound.so.2.real "${realLib}"`, { stdio: "pipe" });

        // Version script: declare ALSA_0.9 / ALSA_0.9.0rc4 namespaces
        const mapFile = path.join(tmpDir, "alsa.map");
        fs.writeFileSync(mapFile, "ALSA_0.9 { global: *; };\nALSA_0.9.0rc4 { global: *; };\n");

        // Compile wrapper: VERDEF from version script, symbol implementations from .real
        execSync([
            "gcc -shared -fPIC",
            `-Wl,-soname,libasound.so.2`,
            `-Wl,--version-script=${mapFile}`,
            `-Wl,-rpath,'$ORIGIN'`,
            `-o "${wrapLib}"`,
            "/dev/null",
            `-L"${pkgDir}" -l:libasound.so.2.real`
        ].join(" "), { stdio: "pipe" });

        console.log(`  Bundled ALSA version wrapper in ${path.basename(pkgDir)}`);
    } catch (err) {
        console.warn(`  ALSA wrapper build failed: ${err.message}`);
        // Clean up partial files so the package still works (just with warnings)
        for (const f of ["libasound.so.2", "libasound.so.2.real"]) {
            try { fs.unlinkSync(path.join(pkgDir, f)); } catch {}
        }
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

(async () => {
    const clearPkgDirTask = fsPromises.rm(PKG_DIR, { recursive: true, force: true });

    if (RELEASE_MODE || !fs.existsSync(BUILD_DIR)) {
        execSync(
            `node ./scripts/build.cjs ${RELEASE_MODE ? "--release" : ""}`,
            { stdio: "inherit" }
        );
    }

    // Clear out dir while doing prework
    await clearPkgDirTask;

    execSync([
        `npx electron-packager ${BUILD_DIR} ${appPackage.name} --out ${PKG_DIR} --overwrite --no-tmpdir --icon=${ICON_FILE}`,
        BUILD_ALL ? " --platform 'win32, linux' --arch 'ia32, x64, armv7l, arm64'" : ""
    ].join(""), { stdio: "inherit" });

    // Bundle ALSA wrapper in all Linux builds to suppress glibc version warnings
    const linuxBuilds = fs.readdirSync(PKG_DIR).filter(d => d.includes("-linux-"));
    for (const build of linuxBuilds) {
        console.log(`Bundling ALSA wrapper for ${build}...`);
        bundleAlsaWrapper(path.join(PKG_DIR, build));
    }
})();
