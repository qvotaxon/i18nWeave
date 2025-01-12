import { BaseActionModule } from '@i18n-weave/module/module-base-action';

import { I18nextScannerService } from '@i18n-weave/feature/feature-i18next-scanner-service';

import { FileLockStore } from '@i18n-weave/store/store-file-lock-store';
import { FileStore } from '@i18n-weave/store/store-file-store';

import {
  ConfigurationStoreManager,
  I18nextScannerModuleConfiguration,
} from '@i18n-weave/util/util-configuration';
import { TraceMethod } from '@i18n-weave/util/util-decorators';
import { LogLevel } from '@i18n-weave/util/util-logger';

import I18nextScannerModuleContext from './i18next-scanner-module-context';

/**
 * Module for handling i18next scanner execution.
 */
export class I18nextScannerModule extends BaseActionModule {
  /**
   * Executes the i18next scanner module.
   * @param context The context for the i18next scanner module.
   */
  @TraceMethod
  protected async doExecuteAsync(
    i18nextScannerModuleContext: I18nextScannerModuleContext
  ): Promise<void> {
    if (
      ConfigurationStoreManager.getInstance().getConfig<I18nextScannerModuleConfiguration>(
        'i18nextScannerModule'
      ).enabled
    ) {
      if (
        !i18nextScannerModuleContext.hasDeletions &&
        !i18nextScannerModuleContext.hasRenames &&
        !i18nextScannerModuleContext.hasChanges
      ) {
        return;
      }

      const translationFileUris = FileStore.getInstance()
        .getTranslationFiles()
        .map(file => file.metaData.uri);

      const onScanCodeComplete = async () => {
        this.logger.log(
          LogLevel.INFO,
          'Done scanning code files.',
          'I18nextScannerModule'
        );

        setTimeout(() => {
          FileLockStore.getInstance().deleteLocks(translationFileUris);
          this.logger.log(
            LogLevel.VERBOSE,
            'Deleted file locks.',
            'I18nextScannerModule'
          );
        }, 1000);

        FileStore.getInstance().addOrUpdateFilesAsync(translationFileUris);
      };

      if (
        i18nextScannerModuleContext.hasDeletions ||
        i18nextScannerModuleContext.hasRenames
      ) {
        FileLockStore.getInstance().addLocks(translationFileUris);

        I18nextScannerService.getInstance().scanCode(onScanCodeComplete);
      } else if (i18nextScannerModuleContext.hasChanges) {
        I18nextScannerService.getInstance().scanFile(
          i18nextScannerModuleContext.inputPath,
          onScanCodeComplete
        );
      }
    }
  }
}
