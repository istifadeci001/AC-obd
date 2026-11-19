import { BleClient } from '@capacitor-community/bluetooth-le';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
window.BleClient = BleClient;
window.CapApp = App;

// Avto-jurnal fayllarını tətbiqin ACOBD sənəd qovluğunda saxla.
window.ACOBDFiles = {
  saveText: async function (name, data) {
    await Filesystem.mkdir({ path: 'ACOBD', directory: Directory.Documents, recursive: true }).catch(function () {});
    return Filesystem.writeFile({ path: 'ACOBD/' + name, data: data, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
  }
};
