import type { UploadedFile } from "@/lib/upload-client";

export const SOFTWARE_PRESETS = [
  "Blender",
  "Maya",
  "3ds Max",
  "ZBrush",
  "Substance 3D Painter",
  "Substance 3D Designer",
  "Marmoset Toolbag",
  "Unreal Engine",
  "Unity",
  "Photoshop",
  "Marvelous Designer",
  "RizomUV",
] as const;

export interface WorkFormState {
  title: string;
  description: string;
  tags: string;
  software: string[];
  softwareCustom: string;
  workDate: string;
  sizeWeight: number;
  uploadedFiles: UploadedFile[];
  coverIndex: number;
  uploading: boolean;
  uploadProgress: string;
  uploadTotal: number;
  uploadDone: number;
}

export function createEmptyWorkFormState(): WorkFormState {
  return {
    title: "",
    description: "",
    tags: "",
    software: [],
    softwareCustom: "",
    workDate: "",
    sizeWeight: 1,
    uploadedFiles: [],
    coverIndex: 0,
    uploading: false,
    uploadProgress: "",
    uploadTotal: 0,
    uploadDone: 0,
  };
}

export function patchWorkFormState(state: WorkFormState, patch: Partial<WorkFormState>): WorkFormState {
  return { ...state, ...patch };
}

export function appendUploadedFiles(state: WorkFormState, files: UploadedFile[]): WorkFormState {
  return {
    ...state,
    uploadedFiles: [...state.uploadedFiles, ...files],
    uploading: false,
    uploadProgress: "",
    uploadTotal: 0,
    uploadDone: 0,
  };
}

export function moveInArray<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= arr.length ||
    toIndex >= arr.length ||
    fromIndex === toIndex
  ) {
    return arr;
  }
  const updated = [...arr];
  const [moved] = updated.splice(fromIndex, 1);
  updated.splice(toIndex, 0, moved);
  return updated;
}

export function getMovedIndex(currentIndex: number, fromIndex: number, toIndex: number): number {
  if (currentIndex === fromIndex) return toIndex;
  if (fromIndex < currentIndex && toIndex >= currentIndex) return currentIndex - 1;
  if (fromIndex > currentIndex && toIndex <= currentIndex) return currentIndex + 1;
  return currentIndex;
}

export function getIndexAfterRemoval(currentIndex: number, removedIndex: number): number {
  if (currentIndex === removedIndex) return Math.max(0, currentIndex - 1);
  if (currentIndex > removedIndex) return currentIndex - 1;
  return currentIndex;
}

export function moveUploadedFile(state: WorkFormState, fromIndex: number, toIndex: number): WorkFormState {
  const uploadedFiles = moveInArray(state.uploadedFiles, fromIndex, toIndex);
  if (uploadedFiles === state.uploadedFiles) return state;

  return {
    ...state,
    uploadedFiles,
    coverIndex: getMovedIndex(state.coverIndex, fromIndex, toIndex),
  };
}

export function removeUploadedFile(state: WorkFormState, index: number): WorkFormState {
  const uploadedFiles = state.uploadedFiles.filter((_, currentIndex) => currentIndex !== index);
  if (uploadedFiles.length === 0) {
    return {
      ...state,
      uploadedFiles,
      coverIndex: 0,
    };
  }

  return {
    ...state,
    uploadedFiles,
    coverIndex: getIndexAfterRemoval(state.coverIndex, index),
  };
}

export function splitCommaValues(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function mergeSoftwareValues(selected: string[], customInput: string): string[] {
  return Array.from(new Set([...selected, ...splitCommaValues(customInput)]));
}

export function formatUploadResult(successCount: number, total: number, failures: string[], unit: string) {
  if (failures.length === 0) return `${successCount}/${total} ${unit}上传成功`;
  const shown = failures.slice(0, 3).join("；");
  const more = failures.length > 3 ? `；另有 ${failures.length - 3} 个失败` : "";
  return `${successCount}/${total} ${unit}上传成功，${failures.length} 个失败：${shown}${more}`;
}

export interface EditableImage {
  id: string;
  image_url: string;
  thumb_url: string;
  source: "existing" | "new";
  size: number;
  media_type: string;
}

export interface EditWorkFormState {
  title: string;
  description: string;
  tags: string;
  software: string[];
  softwareCustom: string;
  workDate: string;
  sizeWeight: number;
  allImages: EditableImage[];
  coverIndex: number;
  previewIndex: number;
  loading: boolean;
  saving: boolean;
  saveStep: string;
  baseUpdatedAt: string;
  conflict: boolean;
}

export function createEditWorkFormState(): EditWorkFormState {
  return {
    title: "",
    description: "",
    tags: "",
    software: [],
    softwareCustom: "",
    workDate: "",
    sizeWeight: 1,
    allImages: [],
    coverIndex: 0,
    previewIndex: 0,
    loading: true,
    saving: false,
    saveStep: "",
    baseUpdatedAt: "",
    conflict: false,
  };
}

export function patchEditWorkFormState(state: EditWorkFormState, patch: Partial<EditWorkFormState>): EditWorkFormState {
  return { ...state, ...patch };
}

export function moveEditableImage(state: EditWorkFormState, fromIndex: number, toIndex: number): EditWorkFormState {
  const allImages = moveInArray(state.allImages, fromIndex, toIndex);
  if (allImages === state.allImages) return state;
  return {
    ...state,
    allImages,
    coverIndex: getMovedIndex(state.coverIndex, fromIndex, toIndex),
    previewIndex: getMovedIndex(state.previewIndex, fromIndex, toIndex),
  };
}

export function removeEditableImage(state: EditWorkFormState, index: number): EditWorkFormState {
  const allImages = state.allImages.filter((_, currentIndex) => currentIndex !== index);
  if (allImages.length === 0) {
    return { ...state, allImages, coverIndex: 0, previewIndex: 0 };
  }
  return {
    ...state,
    allImages,
    coverIndex: getIndexAfterRemoval(state.coverIndex, index),
    previewIndex: getIndexAfterRemoval(state.previewIndex, index),
  };
}

export function nextTempImageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `new_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
