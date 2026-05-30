export interface CNLFormData {
  crypted?: string[];
  jk?: string[];
  urls?: string[];
  passwords?: string[];
  package?: string[];
  source?: string[];
}

export interface CNLRequestData {
  url: string;
  formData: CNLFormData;
}

export interface CNLDecryptedData {
  links: string[];
  passwords: string[];
  packageName?: string;
  sourceUrl?: string;
}

export interface GeneralOptions {
  basketNotificationsEnabled: boolean;
  cnlEnabled: boolean;
}

export interface BasketItem {
  url: string;
  type: 'manual' | 'cnl';
  cnlData?: {
    packageName?: string;
    passwords?: string[];
    sourceUrl?: string;
    timestamp: number;
  };
}
