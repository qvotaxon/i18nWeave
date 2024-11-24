import { Diff } from 'deep-diff';
import { unset } from 'lodash';
import path from 'path';
import { Uri } from 'vscode';

import { BaseActionModule } from '@i18n-weave/module/module-base-action';

import {
  StatusBarManager,
  StatusBarState,
} from '@i18n-weave/feature/feature-status-bar-manager';
import { TranslationService } from '@i18n-weave/feature/feature-translation-service';

import { FileReader } from '@i18n-weave/file-io/file-io-file-reader';
import { FileWriter } from '@i18n-weave/file-io/file-io-file-writer';

import { FileLocationStore } from '@i18n-weave/store/store-file-location-store';
import { FileLockStore } from '@i18n-weave/store/store-file-lock-store';
import { TranslationStore } from '@i18n-weave/store/store-translation-store';

import {
  ConfigurationStoreManager,
  GeneralConfiguration,
} from '@i18n-weave/util/util-configuration';
import { applyChange } from '@i18n-weave/util/util-file-diff';
import { extractLocaleFromFileUri } from '@i18n-weave/util/util-file-path-utilities';
import { LogLevel } from '@i18n-weave/util/util-logger';

import { TranslationModuleContext } from './translation-module-context';

export class TranslationModule extends BaseActionModule {
  private readonly _className = 'TranslationModule';

  protected async doExecuteAsync(
    context: TranslationModuleContext
  ): Promise<void> {
    const config =
      ConfigurationStoreManager.getInstance().getConfig<GeneralConfiguration>(
        'general'
      );
    if (!context.jsonContent) {
      return;
    }

    const diffs = TranslationStore.getInstance().getTranslationFileDiffs(
      context.inputPath,
      context.jsonContent
    );
    if (!diffs || diffs.length === 0) {
      this.logger.log(
        LogLevel.VERBOSE,
        `No diffs found for file ${context.inputPath.fsPath}. Skipping.`,
        this._className
      );
      return;
    }

    await FileLocationStore.getInstance().addOrUpdateFile(context.inputPath);

    const changesToTranslate = this.extractRelevantChanges(diffs);
    if (changesToTranslate.length === 0) {
      this.logger.log(
        LogLevel.VERBOSE,
        `No diff changes to translate. Skipping.`,
        this._className
      );
      return;
    }

    const statusBarManager = StatusBarManager.getInstance();

    try {
      statusBarManager.updateState(
        StatusBarState.Running,
        'Translating changes...'
      );

      const sourceLanguage = extractLocaleFromFileUri(context.inputPath);
      const otherFiles = this.findRelatedFiles(context.inputPath.fsPath);
      const translationsByLanguage = await this.translateChanges(
        sourceLanguage,
        changesToTranslate,
        otherFiles
      );
      await this.applyTranslationsToFiles(
        otherFiles,
        translationsByLanguage,
        config
      );
      TranslationStore.getInstance().updateEntry(
        context.inputPath,
        context.jsonContent
      );
    } catch (error) {
      this.logger.log(
        LogLevel.ERROR,
        `Error translating changes: ${(error as Error).message}`,
        this._className
      );
      return;
    } finally {
      statusBarManager.setIdle();
    }
  }

  private extractRelevantChanges(diffs: any[]) {
    return diffs.filter(
      ({ kind, rhs }) =>
        (kind === 'N' || kind === 'E') &&
        rhs !== '' &&
        this.getAllStringValues(rhs).filter(value => value !== '').length > 0
    );
  }

  private getAllStringValues(obj: Record<string, any>): string[] {
    let values: string[] = [];

    for (const key in obj) {
      const value = obj[key];
      if (typeof value === 'string') {
        values.push(value);
      } else if (typeof value === 'object' && value !== null) {
        values = values.concat(this.getAllStringValues(value));
      }
    }

    return values;
  }

  private findRelatedFiles(currentFilePath: string) {
    return FileLocationStore.getInstance()
      .getTranslationFiles()
      .map(file => file.metaData.uri)
      .filter(
        fileUri =>
          fileUri.fsPath !== currentFilePath &&
          path.basename(fileUri.fsPath) === path.basename(currentFilePath)
      );
  }

  private async translateChanges(
    sourceLanguage: string,
    changes: any[],
    targetFiles: Uri[]
  ) {
    const translationService = TranslationService.getInstance(
      this.extensionContext
    );

    let translationsByLanguage: { [key: string]: any[] } = {};

    for (const targetFile of targetFiles) {
      const targetLanguage = extractLocaleFromFileUri(targetFile);
      const fileContent = JSON.parse(
        await FileReader.readWorkspaceFileAsync(targetFile)
      );

      const changesToTranslate = changes.filter(change => {
        const currentValue = change.path.reduce(
          (obj: { [x: string]: any }, key: string | number) => obj?.[key],
          fileContent
        );
        return (
          currentValue === undefined ||
          currentValue === null ||
          currentValue === ''
        );
      });

      if (changesToTranslate.length > 0) {
        const valuesToTranslate = changesToTranslate.map(
          (change: { rhs: any }) => change.rhs
        );

        const translatedValues = await translationService.translateKeysAsync(
          valuesToTranslate,
          sourceLanguage,
          targetLanguage
        );

        translationsByLanguage[targetLanguage] = changesToTranslate.map(
          (change: any, index: number) => ({
            ...change,
            rhs: translatedValues[index],
          })
        );
      }
    }

    return translationsByLanguage;
  }

  private async applyTranslationsToFiles(
    targetFiles: Uri[],
    translationsByLanguage: { [x: string]: any },
    config: GeneralConfiguration
  ) {
    let fileShouldEndWithNewLine: boolean = false;

    for (const fileUri of targetFiles) {
      if (FileLockStore.getInstance().hasFileLock(fileUri)) {
        continue;
      }

      let fileContent;
      try {
        const fileContentAsString =
          await FileReader.readWorkspaceFileAsync(fileUri);
        fileShouldEndWithNewLine = fileContentAsString.endsWith('\n');

        fileContent = JSON.parse(fileContentAsString);
      } catch (error) {
        this.logger.log(
          LogLevel.ERROR,
          `Failed to parse JSON content from file ${fileUri}: ${(error as Error).message}`,
          this._className
        );
        continue;
      }
      const targetLanguage = extractLocaleFromFileUri(fileUri);
      const diffs = translationsByLanguage[targetLanguage];
      this.applyDiffsToJSON(fileContent, diffs);

      let stringifiedContent = JSON.stringify(
        fileContent,
        null,
        config.format.numberOfSpacesForIndentation
      );

      if (fileShouldEndWithNewLine && !stringifiedContent.endsWith('\n')) {
        stringifiedContent += '\n';
      }

      FileLockStore.getInstance().addLock(fileUri);
      await FileWriter.writeToWorkspaceFileAsync(
        fileUri,
        stringifiedContent
      ).then(() => {
        setTimeout(() => {
          FileLockStore.getInstance().delete(fileUri);
        }, 500);
      });

      TranslationStore.getInstance().updateEntry(fileUri, stringifiedContent);
    }
  }

  private applyDiffsToJSON(target: any, diffs: Diff<unknown, unknown>[]) {
    diffs?.forEach(change => {
      if (change.kind === 'D') {
        const path = change.path?.join('.');
        if (path) {
          unset(target, path);
        }
      } else if (change.kind === 'E' || change.kind === 'A') {
        if (change.path) {
          const targetValue = change.path.reduce(
            (obj, key) => obj?.[key],
            target
          );

          if (targetValue !== undefined) {
            applyChange(target, change);
          }
        }
      }
    });
  }
}
