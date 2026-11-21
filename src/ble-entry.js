import { BleClient } from '@capacitor-community/bluetooth-le';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

window.BleClient = BleClient;
window.CapApp = App;

// Avto-jurnal fayllarini yalniz proqramin oz ACOBD qovlugunda saxla.
window.ACOBDFiles = {
  saveText: async function (name, data) {
    // Fayl adi yalniz herf, reqem, tire ve alt xett ola biler; yalniz .txt.
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+\.txt$/.test(name)) {
      throw new Error('Invalid ACOBD filename');
    }

    try {
      await Filesystem.mkdir({
        path: 'ACOBD',
        directory: Directory.Documents,
        recursive: true
      });
    } catch (error) {
      // Qovluq artiq varsa davam et; basqa xetani gizletme.
      const exists = await Filesystem.stat({
        path: 'ACOBD',
        directory: Directory.Documents
      }).catch(() => null);
      if (!exists) throw error;
    }

    return Filesystem.writeFile({
      path: 'ACOBD/' + name,
      data: String(data),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true
    });
  },
  appendText: async function (name, data) {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+\.txt$/.test(name)) {
      throw new Error('Invalid ACOBD filename');
    }
    try {
      await Filesystem.appendFile({
        path: 'ACOBD/' + name,
        data: String(data),
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });
    } catch (error) {
      // appendFile fayl yoxdursa bəzi platformalarda xəta verir; yalnız bu halda yaradılır.
      const exists = await Filesystem.stat({ path: 'ACOBD/' + name, directory: Directory.Documents }).catch(() => null);
      if (exists) throw error;
      return Filesystem.writeFile({
        path: 'ACOBD/' + name,
        data: String(data),
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true
      });
    }
    return { uri: 'ACOBD/' + name };
  }
};
