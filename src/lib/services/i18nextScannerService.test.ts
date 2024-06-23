import * as assert from 'assert';
import sinon from 'sinon';

import GeneralConfiguration from '../entities/configuration/general/generalConfiguration';
import ConfigurationStoreManager from '../stores/configuration/configurationStoreManager';
import I18nextScannerService from './i18nextScannerService';

suite('I18nextScannerService', () => {
  let scannerService: I18nextScannerService;
  let getConfigStub: sinon.SinonStub;

  setup(() => {
    scannerService = I18nextScannerService.getInstance();
  });

  teardown(() => {
    sinon.restore();
  });

  suite('getInstance', () => {
    test('should return the singleton instance', () => {
      const instance1 = I18nextScannerService.getInstance();
      const instance2 = I18nextScannerService.getInstance();
      assert.strictEqual(instance1, instance2);
    });
  });

  suite('scanCodeAsync', () => {
    test('should scan code for translation keys', async () => {
      const config = {
        i18nextScannerModule: {
          translationFilesLocation: 'locales',
          translationFunctionNames: ['I18nKey'],
          translationComponentTranslationKey: 'i18nKey',
          translationComponentName: 'Trans',
        },
      };

      getConfigStub = sinon
        .stub(ConfigurationStoreManager.getInstance(), 'getConfig')
        .returns(config.i18nextScannerModule);

      const executeScannerStub = (scannerService['executeScanner'] = sinon
        .stub()
        .resolves());

      scannerService.scanCode();

      sinon.assert.calledOnce(getConfigStub);
      sinon.assert.calledOnce(executeScannerStub);
    });
  });
});
