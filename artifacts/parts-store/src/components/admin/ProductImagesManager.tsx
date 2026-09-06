import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { requestUploadUrl, setProductImage } from '@workspace/api-client-react';
import { Star, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GalleryImage } from '@/components/products/ProductGallery';

const MAX_PHOTOS = 12;
const MAX_BYTES = 8 * 1024 * 1024;

export function ProductImagesManager({ productId, name, images, imageUrl, onChange, onBusyChange }: {
  productId: number;
  name: string;
  images?: string[];
  imageUrl?: string | null;
  onChange: (value: { images: string[]; imageUrl: string | null }) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const photos = [...new Set(images?.length ? images : imageUrl ? [imageUrl] : [])];
  const start = () => { lock.current = true; setBusy(true); onBusyChange(true); setErrors([]); };
  const finish = () => { lock.current = false; setBusy(false); onBusyChange(false); };
  const save = async (urls: string[]) => {
    const saved = await setProductImage(productId, { imageUrls: urls });
    onChange({ images: saved.images, imageUrl: saved.imageUrl });
    await queryClient.invalidateQueries();
    return saved.images;
  };
  const changeGallery = async (urls: string[]) => {
    if (lock.current) return;
    start();
    try { await save(urls); setStatus('Photo gallery saved.'); }
    catch (error) { setErrors([error instanceof Error ? error.message : 'Could not save the gallery. Please try again.']); }
    finally { finish(); }
  };
  const upload = async (files: File[]) => {
    if (lock.current || !files.length) return;
    start();
    let current = [...photos];
    let uploaded = 0;
    const failures: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setStatus(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
        try {
          if (current.length >= MAX_PHOTOS) throw new Error(`A product can have up to ${MAX_PHOTOS} photos.`);
          const contentType = file.type;
          if (contentType !== 'image/jpeg' && contentType !== 'image/png' && contentType !== 'image/webp') throw new Error('Use a JPEG, PNG or WebP image.');
          if (!file.size || file.size > MAX_BYTES) throw new Error('Use a non-empty image smaller than 8 MB.');
          const target = await requestUploadUrl({ name: file.name, size: file.size, contentType });
          const response = await fetch(target.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
          if (!response.ok) throw new Error('File transfer failed. Please try again.');
          current = await save([...current, target.objectPath]);
          uploaded++;
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`);
        }
      }
      setStatus(`${uploaded} of ${files.length} photos uploaded and saved.`);
      setErrors(failures);
    } finally {
      if (input.current) input.current.value = '';
      finish();
    }
  };

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Manage product photos" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Product photos <span className="text-muted-foreground">({photos.length}/{MAX_PHOTOS})</span></h3>
        <Button type="button" variant="outline" size="sm" disabled={busy || photos.length >= MAX_PHOTOS}
          onClick={() => input.current?.click()} data-testid="button-upload-product-photos">
          <Upload className="mr-2 h-4 w-4" /> Add photos
        </Button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only"
          aria-label="Upload product photos" disabled={busy} data-testid="input-product-photos"
          onChange={(event) => void upload(Array.from(event.target.files || []))} />
      </div>
      <p className="text-xs text-muted-foreground">Select multiple JPEG, PNG or WebP files, up to 8 MB each. Changes are saved immediately. The first photo is the cover. Removing a photo unlinks it from this gallery; existing file links remain available.</p>
      {photos.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((url, index) => (
            <div key={url} className="min-w-0 rounded-md border p-2">
              <GalleryImage src={url} alt={`${name} — photo ${index + 1}`} className="aspect-square w-full bg-white object-contain" />
              <div className="mt-2 flex items-center justify-between">
                <Button type="button" size="icon" variant={index === 0 ? 'secondary' : 'ghost'} disabled={busy || index === 0}
                  aria-label={index === 0 ? 'Cover photo' : `Use photo ${index + 1} as cover`}
                  title={index === 0 ? 'Cover photo' : 'Use as cover'}
                  onClick={() => void changeGallery([url, ...photos.filter((p) => p !== url)])}>
                  <Star className={`h-4 w-4 ${index === 0 ? 'fill-current' : ''}`} />
                </Button>
                <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={`Remove photo ${index + 1} from gallery`}
                  onClick={() => void changeGallery(photos.filter((p) => p !== url))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">No photos yet. Add front, back and connector close-ups.</p>}
      <p role="status" className="text-sm">{status}</p>
      {errors.length > 0 && <ul role="alert" className="space-y-1 text-sm text-destructive">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
    </section>
  );
}