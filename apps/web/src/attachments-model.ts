import type { ObjectRef } from "./relations-model";

export type Attachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
  links: ObjectRef[];
  createdAt: string;
};

export const ATTACHMENTS_STORAGE_KEY = "sfera.attachments.v1";

function sameRef(a: ObjectRef, b: ObjectRef) {
  return a.type === b.type && a.id === b.id;
}

export function readAttachments(): Attachment[] {
  try {
    const raw = localStorage.getItem(ATTACHMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function attachmentsFor(attachments: Attachment[], ref: ObjectRef) {
  return attachments.filter((attachment) => attachment.links.some((link) => sameRef(link, ref)));
}

export function removeAttachmentLink(attachment: Attachment, ref: ObjectRef) {
  return {
    ...attachment,
    links: attachment.links.filter((link) => !sameRef(link, ref))
  };
}
