import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { resetBuildDirectory } from "./build-package";

test("resetBuildDirectory removes build trees containing non-readable directories", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "local-packages-build-"));
  const buildDir = join(tempRoot, "whisper-cpp");
  const lockedDir = join(buildDir, "pkg");

  try {
    await mkdir(join(lockedDir, "nested"), { recursive: true });
    await writeFile(join(lockedDir, "nested", "file"), "contents");
    await chmod(lockedDir, 0o111);

    await resetBuildDirectory(buildDir);

    expect(await readdir(buildDir)).toEqual([]);
  } finally {
    await chmod(lockedDir, 0o755).catch(() => {});
    await rm(tempRoot, { recursive: true, force: true });
  }
});
