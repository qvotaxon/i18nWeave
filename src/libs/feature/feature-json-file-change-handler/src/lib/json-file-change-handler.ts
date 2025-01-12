import vscode, { Uri } from 'vscode';

import {
  ActionModule,
  BaseModuleContext,
} from '@i18n-weave/module/module-base-action';
import { ReadJsonFileModule } from '@i18n-weave/module/module-read-json-file';
import { TranslationModule } from '@i18n-weave/module/module-translation';

import { BaseFileChangeHandler } from '@i18n-weave/feature/feature-base-file-change-handler';
import { FileWatcherCreator } from '@i18n-weave/feature/feature-file-watcher-creator';
import { ModuleChainManager } from '@i18n-weave/feature/feature-module-chain-manager';

import { FileLockStore } from '@i18n-weave/store/store-file-lock-store';

// import { FileStore } from '@i18n-weave/store/store-file-store';
import { TraceMethod } from '@i18n-weave/util/util-decorators';
import { ChainType } from '@i18n-weave/util/util-enums';
import { extractFileUriParts } from '@i18n-weave/util/util-file-path-utilities';
import { LogLevel, Logger } from '@i18n-weave/util/util-logger';

export class JsonFileChangeHandler extends BaseFileChangeHandler {
  private readonly _className = 'JsonFileChangeHandler';
  private readonly _logger: Logger;
  private static fileWatcherCreator: FileWatcherCreator;
  private static readJsonFileModule: ReadJsonFileModule;
  private static translationModule: TranslationModule;

  static readonly moduleChainManager: ModuleChainManager =
    new ModuleChainManager();

  private constructor(
    fileWatcherCreator: FileWatcherCreator,
    readJsonFileModule: ReadJsonFileModule,
    translationModule: TranslationModule
  ) {
    super();

    this._logger = Logger.getInstance();

    JsonFileChangeHandler.fileWatcherCreator = fileWatcherCreator;
    JsonFileChangeHandler.readJsonFileModule = readJsonFileModule;
    JsonFileChangeHandler.translationModule = translationModule;

    JsonFileChangeHandler.moduleChainManager.registerChain(
      ChainType.Json,
      this.createJsonChain()
    );
  }

  public static readonly create = (
    context: vscode.ExtensionContext
  ): JsonFileChangeHandler => {
    const fileWatcherCreator = new FileWatcherCreator();
    const readJsonFileModule = new ReadJsonFileModule(context);
    const translationModule = new TranslationModule(context);

    this.readJsonFileModule = readJsonFileModule;
    this.translationModule = translationModule;

    return new JsonFileChangeHandler(
      fileWatcherCreator,
      readJsonFileModule,
      translationModule
    );
  };

  createJsonChain(): ActionModule {
    JsonFileChangeHandler.readJsonFileModule.setNext(
      JsonFileChangeHandler.translationModule
    );

    return JsonFileChangeHandler.readJsonFileModule;
  }

  /**
   * Handles the asynchronous file change event.
   *
   * @param changeFileLocation - The location of the changed file.
   * @returns A promise that resolves when the file change is handled.
   */
  @TraceMethod
  async handleFileChangeAsync(
    changeFileLocation?: Uri | undefined
  ): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!changeFileLocation) {
      return Promise.resolve();
    }

    // await FileStore.getInstance().addOrUpdateFileAsync(changeFileLocation);

    if (FileLockStore.getInstance().hasFileLock(changeFileLocation)) {
      return Promise.resolve();
    }

    const extractedFileParts = extractFileUriParts(changeFileLocation);

    const context: BaseModuleContext = {
      inputPath: changeFileLocation,
      locale: extractedFileParts.locale,
      outputPath: extractedFileParts.outputPath,
      hasChanges: undefined,
      hasDeletions: undefined,
      hasRenames: undefined,
    };

    FileLockStore.getInstance().addLock(extractedFileParts.outputPath);

    await JsonFileChangeHandler.moduleChainManager.executeChainAsync(
      ChainType.Json,
      context
    );

    this._logger.log(
      LogLevel.VERBOSE,
      `Json File change handled: ${changeFileLocation}`,
      this._className
    );

    const fileWatcherDisposable =
      JsonFileChangeHandler.fileWatcherCreator.createFileWatcherForFile(
        extractedFileParts.outputPath.fsPath,
        () => {
          FileLockStore.getInstance().purgeForFile(
            extractedFileParts.outputPath
          );
          fileWatcherDisposable.dispose();
        }
      );
  }
}
