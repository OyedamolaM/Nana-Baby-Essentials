"use client";

import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";

export type ColourGalleryDraft = {
  images: { id: string; url: string; thumbnailUrl?: string }[];
  pendingImageFiles: File[];
};

export function ColourGalleryEditor({ colours, drafts, onChange, onDelete }: {
  colours: string[];
  drafts: Record<string, ColourGalleryDraft>;
  onChange: (colour: string, draft: ColourGalleryDraft) => void;
  onDelete: (colour: string, imageId: string) => Promise<void>;
}) {
  if (!colours.length) return null;
  return <div className="space-y-3 rounded-md border bg-white p-3">
    <p className="text-sm font-semibold">Photos by colour</p>
    <p className="text-xs text-gray-500">Upload once for each colour. These photos apply to every size, age and other option in that colour. Save the product to upload new photos.</p>
    {colours.map(colour => {
      const draft = drafts[colour] ?? { images: [], pendingImageFiles: [] };
      return <div key={colour} className="space-y-2 rounded-md border p-3">
        <p className="font-medium">{colour}</p>
        <div className="flex flex-wrap gap-2">
          {draft.images.map(image => <div key={image.id} className="space-y-1">
            <ImageWithFallback src={image.thumbnailUrl || image.url} alt={`${colour} product photo`} className="h-16 w-16 rounded object-cover" />
            <Button type="button" variant="outline" size="sm" onClick={() => void onDelete(colour, image.id)}>Remove</Button>
          </div>)}
        </div>
        <Input type="file" accept="image/*" multiple aria-label={`${colour} photos`} onChange={event => {
          onChange(colour, { ...draft, pendingImageFiles: [...draft.pendingImageFiles, ...Array.from(event.target.files ?? [])] });
          event.target.value = "";
        }} />
        {draft.pendingImageFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center gap-2 text-xs">
          <span>{file.name}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(colour, { ...draft, pendingImageFiles: draft.pendingImageFiles.filter((_, i) => i !== index) })}>Remove pending photo</Button>
        </div>)}
      </div>;
    })}
  </div>;
}
