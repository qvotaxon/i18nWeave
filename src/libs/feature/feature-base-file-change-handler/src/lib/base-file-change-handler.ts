import { Uri } from 'vscode';

import { FileStore } from '@i18n-weave/store/store-file-store';
import { TranslationStore } from '@i18n-weave/store/store-translation-store';

export abstract class BaseFileChangeHandler {
  public abstract handleFileChangeAsync(
    changeFileLocation?: Uri | undefined
  ): Promise<void>;

  public async handleFileDeletionAsync(changeFileLocation: Uri): Promise<void> {
    FileStore.getInstance().deleteFile(changeFileLocation);
    TranslationStore.getInstance().deleteEntry(changeFileLocation);
  }
  public async handleFileCreationAsync(changeFileLocation: Uri): Promise<void> {
    FileStore.getInstance().addOrUpdateFileAsync(changeFileLocation);
    await TranslationStore.getInstance().addEntryAsync(changeFileLocation);
  }
}
