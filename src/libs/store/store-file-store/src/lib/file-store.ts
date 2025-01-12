import fs from 'fs';
import vscode from 'vscode';

import { FileReader } from '@i18n-weave/file-io/file-io-file-reader';

import {
  ConfigurationStoreManager,
  I18nextScannerModuleConfiguration,
} from '@i18n-weave/util/util-configuration';
import { FileType } from '@i18n-weave/util/util-enums';
import {
  extractLocaleFromFileUri,
  extractNamespaceFromFileUri,
  getFileExtension,
} from '@i18n-weave/util/util-file-path-utilities';
import { extractTranslationKeys } from '@i18n-weave/util/util-i18next-file-utils';
import { LogLevel, Logger } from '@i18n-weave/util/util-logger';
import { FileSearchLocation } from '@i18n-weave/util/util-types';

import { CodeFile, TranslationFile } from './file-store.types';

export class FileStore {
  private readonly _className = 'FileLocationStore';
  private static instance: FileStore;
  private readonly files: Map<string, TranslationFile | CodeFile> = new Map();
  private readonly _logger: Logger;

  private constructor() {
    // Private constructor to prevent instantiation
    this._logger = Logger.getInstance();
  }

  /**
   * Returns the singleton instance of FileLocationStore.
   */
  public static getInstance(): FileStore {
    if (!FileStore.instance) {
      FileStore.instance = new FileStore();
    }
    return FileStore.instance;
  }

  /**
   * Scans the workspace for specific file types and populates the store.
   */
  public async scanWorkspaceAsync(fileSearchLocations: FileSearchLocation[]) {
    this._logger.log(
      LogLevel.INFO,
      'Scanning workspace for files...',
      this._className
    );
    for (const fileSearchLocation of fileSearchLocations) {
      const files = await vscode.workspace.findFiles(
        fileSearchLocation.filePattern,
        fileSearchLocation.ignorePattern
      );
      files.forEach(file => this.addOrUpdateFileAsync(file));
      this._logger.log(
        LogLevel.INFO,
        `Found ${files.length} number of files for search pattern ${fileSearchLocation.filePattern as string}, ignoring ${fileSearchLocation.ignorePattern as string} and .gitignore patterns.`,
        this._className
      );
    }
  }

  /**
   * Clears the file location store.
   * Removes all file locations from the store.
   */
  public async clearStoreAsync() {
    this.files.clear();
  }

  /**
   * Adds files to the store.
   * @param uri The URIs of the files.
   */
  public async addOrUpdateFilesAsync(uri: vscode.Uri[]) {
    uri.forEach(file => this.addOrUpdateFileAsync(file));
  }

  /**
   * Adds a file to the store.
   * @param uri The URI of the file.
   */
  public async addOrUpdateFileAsync(uri: vscode.Uri) {
    const fileType = this.determineFileType(uri);
    let file: TranslationFile | CodeFile;

    switch (fileType) {
      case FileType.Translation:
        file = await this.createTranslationFileAsync(uri);
        break;
      case FileType.Code:
        file = await this.createCodeFileAsync(uri);
        break;
    }

    this.files.set(uri.fsPath, file);

    this._logger.log(
      LogLevel.VERBOSE,
      `Added file ${uri.fsPath} to the store.`,
      this._className
    );
  }

  public async getFileAsync(uri: vscode.Uri) {
    if (!this.hasFile(uri)) {
      await this.addOrUpdateFileAsync(uri);
    }

    const file = this.files.get(uri.fsPath);

    if (!file) {
      throw new Error(`File not found: ${uri.fsPath}`);
    }

    if (file.type === 'translation') {
      return file satisfies TranslationFile;
    } else {
      return file satisfies CodeFile;
    }
  }

  async createTranslationFileAsync(uri: vscode.Uri): Promise<TranslationFile> {
    const fileContent = await new FileReader().readWorkspaceFileAsync(uri);
    const jsonContent = JSON.parse(fileContent) as JSON;
    const language = extractLocaleFromFileUri(uri);
    const namespace = extractNamespaceFromFileUri(uri);
    const stats = fs.statSync(uri.fsPath);
    const lastModified = stats.mtime;
    const keys = await extractTranslationKeys(uri);

    const translationFile = {
      type: 'translation',
      jsonContent: jsonContent,
      language: language,
      namespace: namespace,
      keys: keys,
      metaData: {
        entryLastModified: lastModified,
        type: FileType.Translation,
        uri: uri,
      },
    } satisfies TranslationFile;

    return translationFile;
  }

  public getTranslationValue(
    language: string,
    namespace: string,
    translationKey: string
  ): string | undefined | null {
    return this.getTranslationFiles()
      .filter(
        file => file.language === language && file.namespace === namespace
      )
      .map(file => file.keys[translationKey]?.value)
      .find(value => value !== undefined);
  }

  public getTranslationValuesByNamespaceAndKey(
    namespace: string,
    translationKey: string
  ): Record<string, string | undefined | null> {
    const translationValues: Record<string, string | undefined | null> = {};

    this.getTranslationFiles()
      .filter(file => file.namespace === namespace)
      .forEach(file => {
        translationValues[file.language] = file.keys[translationKey]?.value;
      });

    return translationValues;
  }

  public getTranslationKeys(language: string, namespace: string): string[] {
    return this.getTranslationFiles()
      .filter(
        file => file.language === language && file.namespace === namespace
      )
      .flatMap(file => Object.keys(file.keys));
  }

  async createCodeFileAsync(uri: vscode.Uri) {
    const fileContent = await new FileReader().readWorkspaceFileAsync(uri);
    const stats = fs.statSync(uri.fsPath);
    const lastModified = stats.mtime;

    const codeFile = {
      type: 'code',
      content: fileContent,
      metaData: {
        entryLastModified: lastModified,
        type: FileType.Code,
        uri: uri,
      },
    } satisfies CodeFile;

    return codeFile;
  }

  public deleteFile(uri: vscode.Uri) {
    this.files.delete(uri.fsPath);

    this._logger.log(
      LogLevel.VERBOSE,
      `Deleted file ${uri.fsPath} from the store.`,
      this._className
    );
  }

  public getCodeFiles(): CodeFile[] {
    return Array.from(this.files.values())
      .filter(file => file.metaData.type === FileType.Code)
      .map(file => file as CodeFile);
  }

  public getTranslationFiles(): TranslationFile[] {
    return Array.from(this.files.values())
      .filter(file => file.metaData.type === FileType.Translation)
      .map(file => file as TranslationFile);
  }

  public hasFile(uri: vscode.Uri): boolean {
    return this.files.has(uri.fsPath);
  }

  private determineFileType(uri: vscode.Uri) {
    const extension = getFileExtension(uri);
    const config =
      ConfigurationStoreManager.getInstance().getConfig<I18nextScannerModuleConfiguration>(
        'i18nextScannerModule'
      );

    if (extension === 'json') {
      return FileType.Translation;
    } else if (config.fileExtensions.includes(extension)) {
      return FileType.Code;
    }

    this._logger.log(
      LogLevel.ERROR,
      `Unsupported file type: ${extension}`,
      this._className
    );
    throw new Error(`Unsupported file type: ${extension}`);
  }
}
