// Hands the "Download my data" JSON to the user: on phones, write a file and open the share sheet.
// save-export.web.ts is the browser version (a normal file download).
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function saveExport(fileName: string, json: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(json);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing isn’t available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Your Scenic Stroll data',
    UTI: 'public.json',
  });
}
