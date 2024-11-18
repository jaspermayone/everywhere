// Helper function to clean up files

import fs from "fs";

export async function cleanupFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      // Delete file
      fs.promises.unlink(file);

      // delete any empty directories
      const dir = path.dirname(file);
      const filesInDir = await fs.promises.readdir(dir);
      if (filesInDir.length === 0) {
        fs.promises.rmdir(dir);
      }
    } catch (err) {
      console.error("Error deleting file:", file, err);
    }
  }
}
