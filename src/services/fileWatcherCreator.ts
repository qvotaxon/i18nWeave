import * as vscode from 'vscode';
import FileChangeHandlerFactory from './fileChangeHandlerFactory';

/**
 * Class responsible for creating file watchers for files matching a given glob pattern.
 */
export default class FileWatcherCreator {
  /**
   * Creates file watchers for files matching the specified glob pattern.
   * @param pattern - The glob pattern to match files against.
   * @param disableFlags - Optional disable flags that determine whether the file watchers should be disabled.
   * @returns A promise that resolves to an array of file system watchers.
   */
  public async createFileWatchersForFilesMatchingGlobAsync(
    pattern: string,
    ...disableFlags: (() => boolean)[]
  ): Promise<vscode.FileSystemWatcher[]> {
    const fileURIs = await vscode.workspace.findFiles(
      pattern,
      '**/node_modules/**'
    );
    const fileWatchers: vscode.FileSystemWatcher[] = [];

    await Promise.all(
      fileURIs.map(async (fileURI) => {
        const fsPath = fileURI.fsPath;
        const fileChangeHandlerFactory = new FileChangeHandlerFactory();
        const fileWatcher = vscode.workspace.createFileSystemWatcher(fsPath);
        const fileChangeHandler =
          fileChangeHandlerFactory.createFileChangeHandler(fsPath);

        fileWatcher.onDidChange(async (uri) => {
          const isEnabled = !disableFlags.some((disableFlag) => disableFlag());
          if (isEnabled) {
            await fileChangeHandler?.handleFileChangeAsync(uri);
          }
        });

        fileWatchers.push(fileWatcher);
      })
    );

    return fileWatchers;
  }
}
