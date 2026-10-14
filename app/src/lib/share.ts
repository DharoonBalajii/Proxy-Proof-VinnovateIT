import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api } from '../api/client';

/** Downloads a CSV from the server and opens the system share sheet so it can be saved or sent. */
export async function shareCsv(path: string, filename: string) {
  const text = await api.text(path);
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: filename });
}
