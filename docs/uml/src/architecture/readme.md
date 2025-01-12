# I18nWeave

This file describes the proposed software design of i18nWeave.

## Pipelines & Steps

i18nWeave will be implemented using the Pipeline Pattern.

- TopLevelPipeline

  - ??? Step
  
    Determine what to do with multiple file changes of multiple file types simultaneously.
  
  - FileTypePickingStep

    Checks each changed file's File Type and based on that places the file in a specific 'bucket'. Each 'bucket' will be handled by its own pipeline.

- CodeFileChangePipeLine

  - ValidationStep

    Check if any of the files are in an unsaved state.

  - ExtractKeysStep

    Scan the Code File using AST and extract all Translation Keys from it. Taking into consideration the namespaces. An extracted key should represent a value of:

    ```json
    { "key": "", "namespace": "" }
    ```

  - DiffStep

    Use a previously stored version of the changed Code File's keys if they exist and diff them against the new keys.

    Based on the types of changes we will determine whether we should do a Full Scan or a Specific File Scan using I18nextScanner.

    Based types of changes to the keys we do the following:
    - Deletions: Full Scan
    - Renames: Full Scan
    - Only Additions: Specific Scan

    > The main benefit of using I18nextScanner over using the custom scanning logic of i18nWeave for writing to / merging with existing i18next resource files is the many formatting and other related functionalities which are way more complicated than just scanning code and writing keys it implements.
    >
    > However writing the keys to the resource files specifically instead of using the i18next scanner logic should be feasible.

    Before performing the scan the logic should prevent the TopLevelPipeline from being triggered by the files that will be written to. So we will add FileLocks to all translation files that will be written to.

    > Ideally we should only lock just before writing to the i18next resource files, so we reduce the time they are locked. After the writing to the files has happened. We should keep the locks alive for just a moment longer, since the file handlers of vscode may be triggered with a delay.

  - CachingStep

    This step is responsible for storing the changed file's keys in a Store / Cache. The logic responsible in this step should be certified that the items it gets provided with are valid.

    > Do this step after the Validation, Extraction and Diffing Steps because we need to prevent writing invalid entries to our cache.

- TranslationFileChangePipeline
