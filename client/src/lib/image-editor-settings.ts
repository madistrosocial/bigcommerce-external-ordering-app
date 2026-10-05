export type LogoTone = "dark" | "light";

export type ImageEditorSettings = {
  generalDirection: string;
  specificCustomization: string;
  darkLogoDataUrl: string;
  darkLogoFileName: string;
  lightLogoDataUrl: string;
  lightLogoFileName: string;
  selectedLogoTone: LogoTone;
};

const DATABASE_NAME = "vansales-image-editor";
const DATABASE_VERSION = 1;
const STORE_NAME = "settings";
const SETTINGS_KEY = "saved-setup";
const MAX_LOGO_DATA_URL_LENGTH = Math.ceil(2 * 1024 * 1024 * 1.38) + 128;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support local settings storage."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open local settings storage."));
    request.onsuccess = () => resolve(request.result);
  });
}

function runStoreOperation<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    let settled = false;
    let result: T | undefined;
    const finishWithError = (error: Error) => {
      if (settled) return;
      settled = true;
      database.close();
      reject(error);
    };

    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => {
        finishWithError(request.error ?? new Error("Could not access saved settings."));
      };
    } catch (error) {
      finishWithError(error instanceof Error ? error : new Error("Could not access saved settings."));
      return;
    }

    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(result as T);
    };
    transaction.onerror = () => {
      finishWithError(transaction.error ?? new Error("Could not access saved settings."));
    };
    transaction.onabort = () => {
      finishWithError(transaction.error ?? new Error("Could not access saved settings."));
    };
  }));
}

function normalizeImageEditorSettings(value: unknown): ImageEditorSettings | null {
  if (!value || typeof value !== "object") return null;
  const settings = value as Record<string, unknown>;
  const darkLogoDataUrl = typeof settings.darkLogoDataUrl === "string"
    ? settings.darkLogoDataUrl
    : typeof settings.logoDataUrl === "string" ? settings.logoDataUrl : "";
  const darkLogoFileName = typeof settings.darkLogoFileName === "string"
    ? settings.darkLogoFileName
    : typeof settings.logoFileName === "string" ? settings.logoFileName : "";
  const lightLogoDataUrl = typeof settings.lightLogoDataUrl === "string" ? settings.lightLogoDataUrl : "";
  const lightLogoFileName = typeof settings.lightLogoFileName === "string" ? settings.lightLogoFileName : "";
  const selectedLogoTone: LogoTone = settings.selectedLogoTone === "light" ? "light" : "dark";
  if (
    typeof settings.generalDirection !== "string"
    || settings.generalDirection.length > 1500
    || typeof settings.specificCustomization !== "string"
    || settings.specificCustomization.length > 2000
    || darkLogoDataUrl.length > MAX_LOGO_DATA_URL_LENGTH
    || darkLogoFileName.length > 255
    || lightLogoDataUrl.length > MAX_LOGO_DATA_URL_LENGTH
    || lightLogoFileName.length > 255
  ) {
    return null;
  }

  const validDataUrl = (dataUrl: string) => dataUrl === "" || /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl);
  if (!validDataUrl(darkLogoDataUrl) || !validDataUrl(lightLogoDataUrl)) return null;
  return {
    generalDirection: settings.generalDirection,
    specificCustomization: settings.specificCustomization,
    darkLogoDataUrl,
    darkLogoFileName,
    lightLogoDataUrl,
    lightLogoFileName,
    selectedLogoTone,
  };
}

export async function loadImageEditorSettings(): Promise<ImageEditorSettings | null> {
  const value = await runStoreOperation<unknown>("readonly", (store) => store.get(SETTINGS_KEY));
  return normalizeImageEditorSettings(value);
}

export async function saveImageEditorSettings(settings: ImageEditorSettings): Promise<void> {
  await runStoreOperation<IDBValidKey>("readwrite", (store) => store.put(settings, SETTINGS_KEY));
}